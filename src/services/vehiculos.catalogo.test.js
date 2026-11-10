import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma.js";
import { SIN_TRAMITE_ABIERTO } from "../lib/senas.js";
import { whereDisponible } from "../agente/auto-publico.js";
import { listarVehiculos, obtenerVehiculoPorRef, listarMarcas } from "./vehiculos.service.js";

function conAutos(t) {
  const pedidos = [];
  const { findMany, findFirst } = prisma.autos;
  prisma.autos.findMany = async (args) => (pedidos.push(args.where), []);
  prisma.autos.findFirst = async (args) => (pedidos.push(args.where), null);
  t.after(() => Object.assign(prisma.autos, { findMany, findFirst }));
  return pedidos;
}

test("el catálogo público excluye los autos con trámite abierto", async (t) => {
  const pedidos = conAutos(t);
  await listarVehiculos();
  await obtenerVehiculoPorRef("A1");
  await listarMarcas();

  assert.equal(pedidos.length, 3);
  for (const where of pedidos) {
    assert.deepEqual(where.tramites_interes, SIN_TRAMITE_ABIERTO.tramites_interes);
    assert.deepEqual(where.permutas, SIN_TRAMITE_ABIERTO.permutas);
  }
});

test("la API devuelve la versión del vehículo", async (t) => {
  const base = { ref: "1", marca: "Volkswagen", modelo: "Gol", anio: 2020, precio: 1000, fotos_json: [], descuentos: [], auto_promociones: [] };
  let fila = { ...base, version: "1.6 Pack I" };
  const { findFirst } = prisma.autos;
  prisma.autos.findFirst = async () => fila;
  t.after(() => Object.assign(prisma.autos, { findFirst }));

  assert.equal((await obtenerVehiculoPorRef("1")).version, "1.6 Pack I");
  fila = base;
  assert.equal((await obtenerVehiculoPorRef("1")).version, null);
});

test("un auto sacado de la web tampoco se abre por enlace directo", async (t) => {
  const pedidos = conAutos(t);
  await obtenerVehiculoPorRef("A1");
  assert.equal(pedidos[0].disponible, true);
});

test("el catálogo público no devuelve el costo de compra", async (t) => {
  const fila = { ref: "1", marca: "Volkswagen", modelo: "Gol", anio: 2020, precio: 1000, costo: 500, fotos_json: [], descuentos: [], auto_promociones: [] };
  const { findMany, findFirst } = prisma.autos;
  prisma.autos.findMany = async () => [fila];
  prisma.autos.findFirst = async () => fila;
  t.after(() => Object.assign(prisma.autos, { findMany, findFirst }));

  const [delListado] = await listarVehiculos();
  const deLaFicha = await obtenerVehiculoPorRef("1");

  assert.equal("costo" in delListado, false);
  assert.equal("costo" in deLaFicha, false);
});

function conFicha(t, datos) {
  const { findFirst } = prisma.autos;
  prisma.autos.findFirst = async () => ({ ref: "1", marca: "Volkswagen", modelo: "Gol", anio: 2020, precio: 1000, fotos_json: [], descuentos: [], auto_promociones: [], ...datos });
  t.after(() => Object.assign(prisma.autos, { findFirst }));
}

test("la ficha pública devuelve el anticipo y el precio al contado", async (t) => {
  conFicha(t, { anticipo: "3000000.00", precio_contado: "10000000.00" });
  const ficha = await obtenerVehiculoPorRef("1");
  assert.equal(ficha.anticipo, 3000000);
  assert.equal(ficha.precio_contado, 10000000);
});

test("un auto sin anticipo ni precio al contado los devuelve en null", async (t) => {
  conFicha(t, { anticipo: null, precio_contado: null });
  const ficha = await obtenerVehiculoPorRef("1");
  assert.equal(ficha.anticipo, null);
  assert.equal(ficha.precio_contado, null);
});

test("la web y el agente usan el mismo filtro", () => {
  const delAgente = whereDisponible();
  assert.deepEqual(delAgente.tramites_interes, SIN_TRAMITE_ABIERTO.tramites_interes);
  assert.deepEqual(delAgente.permutas, SIN_TRAMITE_ABIERTO.permutas);
});
