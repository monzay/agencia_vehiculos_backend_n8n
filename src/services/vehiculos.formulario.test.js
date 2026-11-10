import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma.js";
import { crearVehiculo, actualizarVehiculo } from "./vehiculos.service.js";

const BASICOS = { marca: "Volkswagen", modelo: "Gol", anio: 2020, precio: 1000 };
const FUERA_DEL_FORMULARIO = ["dominio", "motor", "chasis", "costo"];
const FILA = { id: 1, ref: "1", ...BASICOS, fotos_json: [], descuentos: [], auto_promociones: [] };

function conEscrituras(t) {
  const escritos = [];
  const { create, update, findFirst } = prisma.autos;
  const consultaOriginal = prisma.$queryRawUnsafe;
  prisma.$queryRawUnsafe = async () => [{ next: 1 }];
  prisma.autos.create = async (args) => (escritos.push(args.data), FILA);
  prisma.autos.update = async (args) => (escritos.push(args.data), FILA);
  prisma.autos.findFirst = async () => FILA;
  t.after(() => {
    Object.assign(prisma.autos, { create, update, findFirst });
    prisma.$queryRawUnsafe = consultaOriginal;
  });
  return escritos;
}

const sinCamposFuera = (data) => FUERA_DEL_FORMULARIO.filter((campo) => campo in data);

test("crear un vehículo sin dominio, motor, chasis ni costo funciona", async (t) => {
  const escritos = conEscrituras(t);
  await crearVehiculo(BASICOS);
  assert.equal(escritos.length, 1);
  assert.deepEqual(sinCamposFuera(escritos[0]), []);
});

test("se guarda la versión del vehículo", async (t) => {
  const escritos = conEscrituras(t);
  await crearVehiculo({ ...BASICOS, version: `  1.6 Pack I${" x".repeat(60)}` });
  assert.equal(escritos[0].version.length, 80);
  assert.ok(escritos[0].version.startsWith("1.6 Pack I"));
});

test("una marca o un modelo que no son texto o son muy largos no llegan a la base", async (t) => {
  const escritos = conEscrituras(t);
  for (const malo of [{ marca: "x".repeat(61) }, { modelo: "x".repeat(81) }, { marca: { a: 1 } }, { modelo: 123 }]) {
    await assert.rejects(crearVehiculo({ ...BASICOS, ...malo }), (e) => e.status === 400, JSON.stringify(malo));
  }
  assert.equal(escritos.length, 0);
});

test("un año con decimales no es válido", async (t) => {
  const escritos = conEscrituras(t);
  await assert.rejects(crearVehiculo({ ...BASICOS, anio: 2015.5 }), (e) => e.status === 400);
  assert.equal(escritos.length, 0);
});

test("vaciar la versión la borra", async (t) => {
  const escritos = conEscrituras(t);
  await actualizarVehiculo("1", { version: "  " });
  await actualizarVehiculo("1", { modelo: "Gol" });
  assert.equal(escritos[0].version, null);
  assert.equal("version" in escritos[1], false, "editar sin mandarla no la toca");
});

test("editar sin mandar dominio, motor, chasis ni costo no los modifica", async (t) => {
  const escritos = conEscrituras(t);
  await actualizarVehiculo("1", { ...BASICOS, combustible: "nafta" });
  assert.equal(escritos.length, 1);
  assert.deepEqual(sinCamposFuera(escritos[0]), []);
});

test("el costo que llega al crear o editar no se escribe", async (t) => {
  const escritos = conEscrituras(t);
  await crearVehiculo({ ...BASICOS, costo: 999 });
  await actualizarVehiculo("1", { ...BASICOS, costo: null });
  assert.deepEqual(escritos.map((data) => "costo" in data), [false, false]);
});

test("se guarda nafta y GNC", async (t) => {
  const escritos = conEscrituras(t);
  await crearVehiculo({ ...BASICOS, combustible: "nafta_gnc" });
  assert.equal(escritos[0].combustible, "nafta_gnc");
});

test("un combustible fuera de la lista no llega a la base", async (t) => {
  const escritos = conEscrituras(t);
  await assert.rejects(crearVehiculo({ ...BASICOS, combustible: "hidrogeno" }), (e) => e.status === 400);
  assert.equal(escritos.length, 0);
});

const camposDePago = (data) => ["anticipo", "precio_contado"].filter((campo) => campo in data);

test("se guardan el anticipo y el precio al contado", async (t) => {
  const escritos = conEscrituras(t);
  await crearVehiculo({ ...BASICOS, anticipo: "3000000", precio_contado: 10000000 });
  assert.equal(escritos[0].anticipo, 3000000);
  assert.equal(escritos[0].precio_contado, 10000000);
});

test("crear sin anticipo ni precio al contado funciona", async (t) => {
  const escritos = conEscrituras(t);
  await crearVehiculo(BASICOS);
  assert.equal(escritos.length, 1);
  assert.deepEqual(camposDePago(escritos[0]), []);
});

test("editar sin mandar anticipo ni precio al contado no los modifica", async (t) => {
  const escritos = conEscrituras(t);
  await actualizarVehiculo("1", BASICOS);
  assert.equal(escritos.length, 1);
  assert.deepEqual(camposDePago(escritos[0]), []);
});

test("vaciar el anticipo o el precio al contado los borra", async (t) => {
  const escritos = conEscrituras(t);
  await actualizarVehiculo("1", { ...BASICOS, anticipo: "", precio_contado: null });
  assert.equal(escritos[0].anticipo, null);
  assert.equal(escritos[0].precio_contado, null);
});

test("un anticipo o precio al contado inválido no llega a la base", async (t) => {
  const escritos = conEscrituras(t);
  for (const invalido of [-1, 0, "abc", 1e11]) {
    await assert.rejects(crearVehiculo({ ...BASICOS, anticipo: invalido }), (e) => e.status === 400);
    await assert.rejects(actualizarVehiculo("1", { ...BASICOS, precio_contado: invalido }), (e) => e.status === 400);
  }
  assert.equal(escritos.length, 0);
});
