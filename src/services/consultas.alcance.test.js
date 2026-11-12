import { test } from "node:test";
import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import { prisma } from "../lib/prisma.js";
import { TODAS, NINGUNA } from "../lib/alcance-consultas.js";
import {
  listarConsultas,
  listarConsultasVenta,
  obtenerConsulta,
  marcarConsultaAtendida,
  responderComoHumano,
  reanudarBot,
} from "./consultas.service.js";

const DEL_ASESOR_A = { vendedor_id: 4 };
const contiene = (where, filtro) => where.AND.some((f) => isDeepStrictEqual(f, filtro));

// Base falsa con una sola sesión (id 5) de OTRO asesor: findFirst respeta el `where` que recibe.
function conSesionAjena(t) {
  const sesion = { id: 5, cliente_id: 5, vendedor_id: 9, bot_pausado: false, clientes: { id: 5, telefono: "3884708347", cuil: null } };
  const e = { findFirst: [], findMany: [], count: [], escrituras: [], envios: [] };
  const coincide = (where) => Object.entries(where).every(([k, v]) => sesion[k] === v);
  const originales = {
    chat_estado: Object.fromEntries(["findFirst", "findUnique", "findMany", "count", "update"].map((m) => [m, prisma.chat_estado[m]])),
    autos: { findMany: prisma.autos.findMany },
    vendedores: { findMany: prisma.vendedores.findMany },
    $executeRawUnsafe: prisma.$executeRawUnsafe,
    $transaction: prisma.$transaction,
  };
  prisma.chat_estado.findFirst = async (args) => (e.findFirst.push(args.where), coincide(args.where) ? sesion : null);
  prisma.chat_estado.findUnique = async () => sesion;
  prisma.chat_estado.findMany = async (args) => (e.findMany.push(args.where), []);
  prisma.chat_estado.count = async (args) => (e.count.push(args.where), 0);
  prisma.chat_estado.update = async (args) => (e.escrituras.push(args), args);
  prisma.autos.findMany = async () => [];
  prisma.vendedores.findMany = async () => [];
  prisma.$executeRawUnsafe = async (...args) => e.escrituras.push(args);
  prisma.$transaction = async (ops) => Promise.all(ops);
  t.after(() => {
    Object.assign(prisma.chat_estado, originales.chat_estado);
    Object.assign(prisma.autos, originales.autos);
    Object.assign(prisma.vendedores, originales.vendedores);
    prisma.$executeRawUnsafe = originales.$executeRawUnsafe;
    prisma.$transaction = originales.$transaction;
  });
  e.enviar = { enviarTexto: async (datos) => (e.envios.push(datos), { wamid: "w" }) };
  return e;
}

test("el listado de consultas aplica el alcance del usuario", async (t) => {
  const e = conSesionAjena(t);
  await listarConsultas({ alcance: DEL_ASESOR_A });
  assert.ok(contiene(e.findMany[0], DEL_ASESOR_A));
  assert.ok(contiene(e.count[0], DEL_ASESOR_A), "el total usa el mismo where");
  await listarConsultas({});
  assert.ok(contiene(e.findMany[1], NINGUNA), "sin alcance, ninguna");
  await listarConsultas({ alcance: TODAS });
  assert.ok(contiene(e.findMany[2], TODAS));
});

test("el listado de venta y consignación aplica el alcance del usuario", async (t) => {
  const e = conSesionAjena(t);
  await listarConsultasVenta({ alcance: DEL_ASESOR_A });
  assert.ok(contiene(e.findMany[0], DEL_ASESOR_A));
  assert.ok(contiene(e.count[0], DEL_ASESOR_A));
  await listarConsultasVenta();
  assert.ok(contiene(e.findMany[1], NINGUNA), "sin alcance, ninguna");
});

test("el detalle de una consulta de otro asesor da no encontrada", async (t) => {
  const e = conSesionAjena(t);
  assert.equal(await obtenerConsulta("5", DEL_ASESOR_A), null);
  assert.equal(await obtenerConsulta("5"), null, "sin alcance, nada");
  assert.deepEqual(e.findFirst[0], { id: 5, vendedor_id: 4 });
  assert.deepEqual(e.findMany, [], "no sigue leyendo el chat");
});

test("un asesor no puede marcar atendida, responder ni devolver al bot una consulta de otro asesor", async (t) => {
  const e = conSesionAjena(t);
  const ahora = new Date();

  assert.equal(await marcarConsultaAtendida("5", true, { nombre: "A" }, DEL_ASESOR_A), null);
  const r = await responderComoHumano("5", "hola", { nombre: "A" }, { enviar: e.enviar, ahora, alcance: DEL_ASESOR_A });
  assert.deepEqual(r, { ok: false, codigo: "no_encontrada" });
  assert.equal(await reanudarBot("5", DEL_ASESOR_A), null);

  const sinAlcance = await responderComoHumano("5", "hola", { nombre: "A" }, { enviar: e.enviar, ahora });
  assert.equal(sinAlcance.codigo, "no_encontrada");
  assert.equal(await marcarConsultaAtendida("5", true, { nombre: "A" }), null);
  assert.equal(await reanudarBot("5"), null);

  assert.deepEqual([e.escrituras, e.envios], [[], []], "no escribe ni envía nada");
});
