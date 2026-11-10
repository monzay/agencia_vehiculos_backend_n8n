import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma.js";
import { listarIngresos } from "./ingresos.service.js";
import { actualizarSena, iniciarTramite } from "./senas.service.js";
import { abrirVenta } from "./vehiculos.service.js";
import { conversionPorAsesor } from "./conversion.service.js";
import { registrarEnvioFallido } from "../agente/envio-fallido.js";

const FUTURO = new Date(Date.now() + 10 * 86_400_000);
const EN_UN_MES = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);

// Reemplaza métodos de Prisma por una base en memoria y anota lo que se pidió y escribió.
function conBase(t, reemplazos) {
  const pedidos = [];
  const originales = Object.entries(reemplazos).map(([tabla, metodos]) => [tabla, Object.fromEntries(Object.keys(metodos).map((m) => [m, prisma[tabla][m]]))]);
  const transaccion = prisma.$transaction;
  for (const [tabla, metodos] of Object.entries(reemplazos)) {
    for (const [m, f] of Object.entries(metodos)) prisma[tabla][m] = async (args) => (pedidos.push({ tabla, m, args }), f(args));
  }
  prisma.$transaction = async (arg) => (typeof arg === "function" ? arg(prisma) : Promise.all(arg));
  t.after(() => {
    originales.forEach(([tabla, metodos]) => Object.assign(prisma[tabla], metodos));
    prisma.$transaction = transaccion;
  });
  return pedidos;
}

// ── Documentos: en curso, próximo paso y búsqueda por el auto vendido ──

const conIngresos = (t, filas = []) => conBase(t, { consignacion_ingresos: { findMany: () => filas, count: () => filas.length } });

test("el filtro En curso deja afuera lo terminado, y una venta sigue en curso hasta entregar y transferir", async (t) => {
  const pedidos = conIngresos(t);
  await listarIngresos({ estado: "en_curso" });
  const where = JSON.stringify(pedidos[0].args.where);
  assert.match(where, /"notIn":\["vendido","retirado"\]/);
  assert.match(where, /"tramite_hitos":\{"none":\{"tipo":"entregado"/);
  assert.match(where, /"tramite_hitos":\{"none":\{"tipo":"transferido"/);
});

test("la lista dice el próximo paso de cada trámite", async (t) => {
  conIngresos(t, [{ id: 1, modalidad: "contado", estado: "recepcion" }]);
  const { items } = await listarIngresos({});
  assert.equal(items[0].proximoPaso, "Boleto cargado");
});

test("se busca también por el auto que se vendió", async (t) => {
  const pedidos = conIngresos(t);
  await listarIngresos({ q: "Hilux" });
  assert.match(JSON.stringify(pedidos[0].args.where), /"auto_interes":\{"is":\{"OR":\[\{"marca":\{"contains":"Hilux"\}\}/);
});

// ── Señas: se revalida el auto al extenderla o al iniciar el trámite ──

const sena = (extra = {}) => ({ id: 4, estado: "vigente", vence: FUTURO, auto_id: 7, cliente_id: 5, monto: 1, forma_pago: "efectivo", senado_at: FUTURO, autos: { ref: "A7", vendido_at: null, consignaciones: [] }, ...extra });

function conSena(t, { auto = { id: 7, vendido_at: null }, enTramite = null } = {}) {
  return conBase(t, {
    // Con id es la lectura de la seña; sin id, la búsqueda de otra seña que reserve el auto.
    senas: { findFirst: ({ where }) => (typeof where.id === "number" ? sena() : null), update: ({ data }) => ({ ...sena(), ...data }) },
    autos: { findFirst: () => auto },
    compraventa_contratos: { findFirst: () => null },
    consignacion_ingresos: { findFirst: () => enTramite, create: () => ({ id: 60 }) },
  });
}

test("extender una seña revalida el auto: vendido o en otro trámite, no se extiende", async (t) => {
  for (const caso of [{ auto: { id: 7, vendido_at: new Date() } }, { enTramite: { id: 9 } }]) {
    const pedidos = conSena(t, caso);
    await assert.rejects(actualizarSena(4, { vence: EN_UN_MES }), (e) => e.status === 409);
    assert.equal(pedidos.some((p) => p.m === "update"), false);
  }
});

test("corregir solo las notas de una seña no revalida el auto", async (t) => {
  const pedidos = conSena(t, { enTramite: { id: 9 } });
  await actualizarSena(4, { notas: "Llamar el lunes" });
  assert.ok(pedidos.some((p) => p.m === "update"));
});

test("una seña no pasa a trámite si el auto ya está en otro trámite", async (t) => {
  const pedidos = conSena(t, { enTramite: { id: 9 } });
  await assert.rejects(iniciarTramite(4, 1), (e) => e.status === 409 && /trámite/.test(e.message));
  assert.equal(pedidos.some((p) => p.m === "create"), false);
});

// ── Deshacer la venta devuelve la seña que se había cerrado con ella ──

test("deshacer una venta vuelve a dejar vigente la seña que se cerró al vender", async () => {
  const llamadas = [];
  const tx = {
    autos: { update: async () => ({}) },
    consignaciones: { update: async () => ({}) },
    consignacion_ingresos: { updateMany: async () => ({}) },
    senas: { updateMany: async (args) => (llamadas.push(args), {}) },
  };
  const vendido = new Date("2026-11-05T12:00:00Z");
  await abrirVenta(tx, { id: 7, vendido_at: vendido, consignaciones: [] });
  const [devolucion] = llamadas;
  assert.deepEqual(devolucion.where, { auto_id: 7, deleted_at: null, estado: "convertida", ingreso_id: null, estado_at: { gte: vendido } });
  assert.equal(devolucion.data.estado, "vigente");
});

// ── Conversión por asesor ──

test("cuenta por asesor cuántas consultas avanzaron y cuántas se vendieron", async () => {
  const consulta = (vendedor_id, tramites = [], senas = []) => ({ vendedor_id, tramites, senas });
  const db = {
    chat_estado: {
      findMany: async () => [
        consulta(1),
        consulta(1, [{ estado: "recepcion" }]),
        consulta(1, [{ estado: "vendido" }]),
        consulta(2, [], [{ estado: "vigente", ingreso_id: null }]),
        consulta(2, [], [{ estado: "convertida", ingreso_id: null }]),
        consulta(null),
      ],
    },
    vendedores: { findMany: async () => [{ id: 1, nombre: "Lucas" }, { id: 2, nombre: "Sofía" }] },
  };
  const r = await conversionPorAsesor(db);
  assert.deepEqual(r.total, { consultas: 6, avanzaron: 4, vendieron: 2 });
  assert.deepEqual(r.porAsesor, [
    { asesor: "Lucas", consultas: 3, avanzaron: 2, vendieron: 1 },
    { asesor: "Sofía", consultas: 2, avanzaron: 2, vendieron: 1 },
    { asesor: "Sin asignar", consultas: 1, avanzaron: 0, vendieron: 0 },
  ]);
});

test("la conversión solo cuenta las consultas desde el 03/11/2026, cuando empezó el vínculo", async () => {
  let pedido;
  const db = {
    chat_estado: { findMany: async (args) => ((pedido = args), []) },
    vendedores: { findMany: async () => [] },
  };
  await conversionPorAsesor(db);
  assert.deepEqual(pedido.where.sesion_inicio, { gte: new Date("2026-11-03T03:00:00Z") });
});

// ── Envío fallido por WhatsApp: queda el aviso en la consulta ──

function dbDeEnvio({ canal = { cliente_id: 5 }, sesion = { id: 9 } } = {}) {
  const escrituras = [];
  return {
    escrituras,
    db: {
      cliente_canales: { findFirst: async () => canal },
      chat_estado: { findFirst: async () => sesion, update: async (args) => (escrituras.push(args), {}) },
    },
  };
}

test("un envío fallido deja el aviso en la última consulta del cliente", async () => {
  const { db, escrituras } = dbDeEnvio();
  const r = await registrarEnvioFallido({ para: "5493884000000" }, db);
  assert.equal(r.marcado, true);
  assert.deepEqual(escrituras[0].where, { id: 9 });
  assert.equal(escrituras[0].data.requiere_vendedor, true);
  assert.match(escrituras[0].data.requiere_vendedor_motivo, /WhatsApp/);
});

test("un número desconocido no marca nada, y uno inválido se rechaza", async () => {
  const { db, escrituras } = dbDeEnvio({ canal: null });
  assert.equal((await registrarEnvioFallido({ para: "5493884000000" }, db)).marcado, false);
  await assert.rejects(registrarEnvioFallido({ para: "hola" }, db), (e) => e.status === 400);
  assert.deepEqual(escrituras, []);
});
