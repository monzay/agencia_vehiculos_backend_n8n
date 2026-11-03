import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma.js";
import { avanceDeConsulta, sesionParaAvanzar, INCLUDE_AVANCE } from "./consulta-avance.service.js";
import { crearIngreso } from "./ingresos.service.js";
import { crearSena, iniciarTramite } from "./senas.service.js";

const FUTURO = new Date("2099-01-01T00:00:00Z");
const PASADO = new Date("2020-01-01T00:00:00Z");

const sesionLibre = { id: 10, tramites: [], senas: [] };
const conTramite = { ...sesionLibre, tramites: [{ id: 3, modalidad: "contado", estado: "recepcion" }] };
const conSena = { ...sesionLibre, senas: [{ id: 4, estado: "vigente", vence: FUTURO }] };

const FICHA = { id: 5, nombre: "Ana", dni: "30123456", deleted_at: null };

// Reemplaza las tablas de Prisma por una base en memoria: ninguna escritura llega a
// la base real, y `creados` anota lo que el servicio intentó guardar.
function conBase(t, { sesion = sesionLibre, sena = null } = {}) {
  const creados = [];
  const crear = (tabla) => async ({ data }) => {
    creados.push({ tabla, data });
    return { id: 50, estado: "vigente", monto: 1, forma_pago: "efectivo", vence: FUTURO, senado_at: FUTURO, ...data };
  };
  const reemplazos = {
    chat_estado: { findUnique: async () => sesion },
    autos: { findFirst: async () => ({ id: 7, ref: "A7", vendido_at: null, consignaciones: [] }) },
    senas: { findFirst: async () => sena, create: crear("senas"), update: async ({ data }) => ({ ...sena, ...data }) },
    compraventa_contratos: { findFirst: async () => null },
    consignacion_ingresos: { findFirst: async () => null, create: crear("consignacion_ingresos") },
    clientes: { findFirst: async () => FICHA, findUnique: async () => FICHA, findMany: async () => [FICHA], update: async () => FICHA, create: async () => FICHA },
    cliente_canales: { findFirst: async () => null, findMany: async () => [], create: async () => ({}), upsert: async () => ({}) },
    cliente_perfiles: { upsert: async () => ({}) },
  };
  const originales = Object.entries(reemplazos).map(([tabla, metodos]) => [tabla, Object.fromEntries(Object.keys(metodos).map((m) => [m, prisma[tabla][m]]))]);
  const transaccion = prisma.$transaction;

  Object.entries(reemplazos).forEach(([tabla, metodos]) => Object.assign(prisma[tabla], metodos));
  prisma.$transaction = async (arg) => (typeof arg === "function" ? arg(prisma) : Promise.all(arg));
  t.after(() => {
    originales.forEach(([tabla, metodos]) => Object.assign(prisma[tabla], metodos));
    prisma.$transaction = transaccion;
  });
  return creados;
}

const TITULAR = { nombre: "Ana", dni: "30123456" };
const VENTA = { modalidad: "contado", autoInteresRef: "A7", titular: TITULAR };
const EN_UN_MES = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
const SENA = { monto: 100, vence: EN_UN_MES, autoRef: "A7", cliente: TITULAR };

test("una consulta sin trámite ni seña no tiene avance", () => {
  assert.equal(avanceDeConsulta(sesionLibre), null);
  assert.equal(avanceDeConsulta({ id: 10 }), null);
});

test("el trámite manda sobre la seña de la que nació", () => {
  const sesion = { tramites: conTramite.tramites, senas: [{ id: 4, estado: "convertida", vence: FUTURO }] };
  assert.deepEqual(avanceDeConsulta(sesion), { tipo: "tramite", id: 3, modalidad: "contado", estado: "recepcion" });
});

test("la seña dice si sigue vigente, venció o se cerró con la venta", () => {
  const avance = (sena) => avanceDeConsulta({ tramites: [], senas: [sena] });
  assert.deepEqual(avance({ id: 4, estado: "vigente", vence: FUTURO }), { tipo: "sena", id: 4, estado: "vigente" });
  assert.deepEqual(avance({ id: 4, estado: "vigente", vence: PASADO }), { tipo: "sena", id: 4, estado: "vencida" });
  assert.deepEqual(avance({ id: 4, estado: "convertida", vence: PASADO }), { tipo: "sena", id: 4, estado: "convertida" });
});

test("un trámite cancelado o una seña cancelada liberan la consulta", () => {
  assert.deepEqual(INCLUDE_AVANCE.tramites.where, { deleted_at: null });
  assert.deepEqual(INCLUDE_AVANCE.senas.where, { deleted_at: null, estado: { in: ["vigente", "convertida"] } });
});

test("sin consulta no hay nada que vincular", async () => {
  for (const valor of [undefined, null, ""]) assert.equal(await sesionParaAvanzar(valor, prisma), null);
});

test("una consulta inválida o inexistente se rechaza", async (t) => {
  conBase(t, { sesion: null });
  for (const id of ["abc", 0, -1, 1.5]) {
    await assert.rejects(sesionParaAvanzar(id, prisma), (e) => e.status === 400, String(id));
  }
  await assert.rejects(sesionParaAvanzar(10, prisma), (e) => e.status === 404);
});

test("una consulta que ya avanzó no vuelve a avanzar", async (t) => {
  conBase(t, { sesion: conTramite });
  await assert.rejects(sesionParaAvanzar(10, prisma), (e) => e.status === 409 && /ya tiene/.test(e.message));
});

test("la venta que nace de una consulta guarda el vínculo", async (t) => {
  const creados = conBase(t);
  await crearIngreso({ ...VENTA, sesionId: 10 }, 1);
  assert.equal(creados.find((c) => c.tabla === "consignacion_ingresos").data.sesion_id, 10);
});

test("un trámite sin consulta no lleva vínculo", async (t) => {
  const creados = conBase(t);
  await crearIngreso(VENTA, 1);
  assert.equal(creados.find((c) => c.tabla === "consignacion_ingresos").data.sesion_id, null);
});

test("una compra o consignación no nace de una consulta", async (t) => {
  const creados = conBase(t);
  for (const modalidad of ["compra", "consignacion"]) {
    await assert.rejects(crearIngreso({ modalidad, titular: TITULAR, sesionId: 10 }, 1), (e) => e.status === 400, modalidad);
  }
  assert.deepEqual(creados, []);
});

test("no se crea otra venta desde una consulta que ya avanzó", async (t) => {
  const creados = conBase(t, { sesion: conSena });
  await assert.rejects(crearIngreso({ ...VENTA, sesionId: 10 }, 1), (e) => e.status === 409);
  assert.deepEqual(creados, []);
});

test("la seña que nace de una consulta guarda el vínculo", async (t) => {
  const creados = conBase(t);
  await crearSena({ ...SENA, sesionId: 10 }, 1);
  assert.equal(creados.find((c) => c.tabla === "senas").data.sesion_id, 10);
});

test("no se crea otra seña desde una consulta que ya avanzó", async (t) => {
  const creados = conBase(t, { sesion: conTramite });
  await assert.rejects(crearSena({ ...SENA, sesionId: 10 }, 1), (e) => e.status === 409);
  assert.deepEqual(creados, []);
});

test("el trámite que nace de una seña hereda su consulta", async (t) => {
  const sena = { id: 4, estado: "vigente", vence: FUTURO, cliente_id: 5, auto_id: 7, sesion_id: 10, monto: 1, forma_pago: "efectivo", senado_at: FUTURO, autos: { vendido_at: null, consignaciones: [] } };
  const creados = conBase(t, { sena });
  await iniciarTramite(4, 1);
  assert.equal(creados.find((c) => c.tabla === "consignacion_ingresos").data.sesion_id, 10);
});
