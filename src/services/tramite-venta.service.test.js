import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma.js";
import { venderAutoDelBoleto, desfirmarCompraventa, deshacerVentaDelBoleto } from "./ingreso-compraventa.service.js";
import { desfirmarContrato } from "./ingreso-contratos.service.js";
import { deshacerVentaIngreso, publicarIngreso, cambiarEstadoIngreso } from "./ingreso-publicacion.service.js";
import { eliminarIngreso } from "./ingresos.service.js";
import { marcarVendido, deshacerVenta } from "./vehiculos.service.js";

const FIRMA = new Date("2026-11-03T12:00:00Z");

const boleto = (extra = {}) => ({ id: 3, auto_entregado_id: 7, firmado_at: FIRMA, deleted_at: null, entregado_valor: 100, ...extra });
const tramite = (extra = {}) => ({ id: 1, modalidad: "contado", estado: "recepcion", auto_interes_id: 7, compraventa_contratos: boleto(), consignacion_contratos: null, financiaciones: [], ...extra });
const consignacion = (extra = {}) => ({ id: 1, modalidad: "consignacion", estado: "vendido", consignacion_id: 9, consignacion_contratos: { id: 4, firmado_at: FIRMA }, compraventa_contratos: null, financiaciones: [], ...extra });
const CON_FINANCIACION = [{ id: 5, clientes: {}, pagos: [] }];

// Reemplaza las tablas de Prisma por una base en memoria: ninguna escritura llega
// a la base real, y `escrituras` anota lo que el servicio intentó guardar.
function conBase(t, fila, { auto = null, ficha = null } = {}) {
  const escrituras = [];
  let actual = fila;
  const anotar = (tabla, metodo) => async (args) => {
    escrituras.push({ tabla, metodo, data: args.data });
    // Como la base: un filtro por modalidad no toca a las otras.
    const aplica = !args.where?.modalidad || args.where.modalidad === actual?.modalidad;
    if (tabla === "consignacion_ingresos" && aplica) actual = actual && { ...actual, ...args.data };
    return actual;
  };
  const reemplazos = {
    consignacion_ingresos: {
      // Como la base: si se busca por el auto, solo lo encuentra si es el suyo.
      findFirst: async ({ where } = {}) => (where?.auto_interes_id !== undefined && actual?.auto_interes_id !== where.auto_interes_id ? null : actual),
      update: anotar("consignacion_ingresos", "update"),
      updateMany: anotar("consignacion_ingresos", "updateMany"),
    },
    autos: { findFirst: async () => auto, update: anotar("autos", "update") },
    consignaciones: { findFirst: async () => ficha, update: anotar("consignaciones", "update") },
    senas: { updateMany: anotar("senas", "updateMany") },
    compraventa_contratos: { update: anotar("compraventa_contratos", "update") },
    consignacion_contratos: { update: anotar("consignacion_contratos", "update") },
  };
  const originales = Object.entries(reemplazos).map(([tabla, metodos]) => [tabla, Object.fromEntries(Object.keys(metodos).map((m) => [m, prisma[tabla][m]]))]);
  const transaccion = prisma.$transaction;

  Object.entries(reemplazos).forEach(([tabla, metodos]) => Object.assign(prisma[tabla], metodos));
  prisma.$transaction = async (arg) => (typeof arg === "function" ? arg(prisma) : Promise.all(arg));
  t.after(() => {
    originales.forEach(([tabla, metodos]) => Object.assign(prisma[tabla], metodos));
    prisma.$transaction = transaccion;
  });
  return escrituras;
}

test("no se marca vendido sin el boleto firmado", async (t) => {
  const escrituras = conBase(t, tramite({ compraventa_contratos: boleto({ firmado_at: null }) }), { auto: { id: 7, vendido_at: null, consignaciones: [] } });
  await assert.rejects(venderAutoDelBoleto(1), (e) => e.status === 409 && /Firmá el boleto/.test(e.message));
  assert.deepEqual(escrituras, []);
});

test("con el boleto firmado se marca vendido", async (t) => {
  const escrituras = conBase(t, tramite(), { auto: { id: 7, vendido_at: null, consignaciones: [] } });
  assert.equal(await venderAutoDelBoleto(1), true);
  assert.ok(escrituras.some((e) => e.tabla === "autos"));
  assert.ok(escrituras.some((e) => e.tabla === "consignacion_ingresos" && e.data.estado === "vendido"));
});

test("no se desfirma el boleto de un trámite vendido", async (t) => {
  const escrituras = conBase(t, tramite({ estado: "vendido" }));
  await assert.rejects(desfirmarCompraventa(1), (e) => e.status === 409 && /deshacé la venta/i.test(e.message));
  assert.deepEqual(escrituras, []);
});

test("no se desfirma el contrato de una consignación vendida", async (t) => {
  const escrituras = conBase(t, consignacion());
  await assert.rejects(desfirmarContrato(1), (e) => e.status === 409 && /deshacé la venta/i.test(e.message));
  assert.deepEqual(escrituras, []);
});

test("no se deshace una venta con financiación activa", async (t) => {
  const escrituras = conBase(t, tramite({ modalidad: "permuta", estado: "vendido", financiaciones: CON_FINANCIACION }), { auto: { id: 7, vendido_at: FIRMA, consignaciones: [] } });
  await assert.rejects(deshacerVentaDelBoleto(1), (e) => e.status === 409 && /financiación/i.test(e.message));
  assert.deepEqual(escrituras, []);
});

test("no se deshace una venta con cobro, entrega o transferencia marcados", async (t) => {
  const escrituras = conBase(t, tramite({ estado: "vendido", tramite_hitos: [{ tipo: "cobrado", fecha: FIRMA }] }), { auto: { id: 7, vendido_at: FIRMA, consignaciones: [] } });
  await assert.rejects(deshacerVentaDelBoleto(1), (e) => e.status === 409 && /desmarc/i.test(e.message));
  assert.deepEqual(escrituras, []);
});

test("un auto en trámite no se vende ni se reabre desde Vehículos", async (t) => {
  const libre = { id: 7, ref: "A7", precio: 100, vendido_at: null, consignaciones: [] };
  const escrituras = conBase(t, tramite(), { auto: libre });
  await assert.rejects(marcarVendido("A7"), (e) => e.status === 409 && /legajo/.test(e.message));
  assert.deepEqual(escrituras, []);

  const vendido = conBase(t, tramite({ estado: "vendido" }), { auto: { ...libre, vendido_at: FIRMA } });
  await assert.rejects(deshacerVenta("A7"), (e) => e.status === 409 && /legajo/.test(e.message));
  assert.deepEqual(vendido, []);
});

test("un auto sin trámite se sigue vendiendo desde Vehículos", async (t) => {
  const escrituras = conBase(t, null, { auto: { id: 7, ref: "A7", precio: 100, vendido_at: null, consignaciones: [] } });
  assert.equal(await marcarVendido("A7"), true);
  assert.ok(escrituras.some((e) => e.tabla === "autos"));
});

test("se deshace la venta de una consignación", async (t) => {
  const escrituras = conBase(t, consignacion(), {
    auto: { id: 7, vendido_at: FIRMA, consignaciones: [{ id: 9, estado: "vendido" }] },
    ficha: { autos: { ref: "A7" } },
  });
  const r = await deshacerVentaIngreso(1);

  assert.equal(r.ref, "A7");
  assert.equal(r.ingreso.estado, "publicado");
  assert.ok(escrituras.some((e) => e.tabla === "autos" && e.data.vendido_at === null));
});

test("una consignación vendida no se publica ni se retira", async (t) => {
  const escrituras = conBase(t, consignacion());
  await assert.rejects(publicarIngreso(1), (e) => e.status === 409 && /figura vendido/.test(e.message));
  await assert.rejects(cambiarEstadoIngreso(1, "retirado"), (e) => e.status === 409 && /figura vendido/.test(e.message));
  assert.deepEqual(escrituras, []);
});

test("cancelar un trámite abierto lo borra de forma lógica y devuelve la seña", async (t) => {
  const escrituras = conBase(t, tramite({ compraventa_contratos: boleto({ firmado_at: null }) }));
  assert.equal(await eliminarIngreso(1), true);

  const borrado = escrituras.find((e) => e.tabla === "consignacion_ingresos");
  assert.ok(borrado.data.deleted_at instanceof Date);
  assert.equal(escrituras.find((e) => e.tabla === "senas").data.estado, "vigente");
});

test("no se cancela un trámite vendido, publicado, firmado o con financiación", async (t) => {
  const sinFirma = boleto({ firmado_at: null });
  const casos = [
    ["vendido", tramite({ estado: "vendido", compraventa_contratos: sinFirma }), /vendido/],
    ["publicado", consignacion({ estado: "publicado", consignacion_contratos: null }), /publicado/i],
    ["boleto firmado", tramite(), /firmado/],
    ["contrato firmado", consignacion({ estado: "recepcion", consignacion_id: null }), /firmado/],
    ["con ficha en la web", consignacion({ estado: "recepcion", consignacion_contratos: null }), /retirado/],
    ["con financiación", tramite({ modalidad: "permuta", compraventa_contratos: sinFirma, financiaciones: CON_FINANCIACION }), /financiación/i],
  ];
  for (const [nombre, fila, motivo] of casos) {
    await t.test(nombre, async (sub) => {
      const escrituras = conBase(sub, fila);
      await assert.rejects(eliminarIngreso(1), (e) => e.status === 409 && motivo.test(e.message));
      assert.deepEqual(escrituras, []);
    });
  }
});

test("cancelar un trámite inexistente no hace nada", async (t) => {
  const escrituras = conBase(t, null);
  assert.equal(await eliminarIngreso(1), false);
  assert.equal(await eliminarIngreso("abc"), false);
  assert.deepEqual(escrituras, []);
});
