import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma.js";
import { marcarHito, desmarcarHito } from "./tramite-hitos.service.js";

const HOY = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
const FOTO = "https://abc.public.blob.vercel-storage.com/vehiculos/entrega.webp";

const vendida = (extra = {}) => ({ id: 1, modalidad: "contado", estado: "vendido", cliente_id: 5, tramite_hitos: [], entregas: [], ...extra });

// Reemplaza las tablas de Prisma por una base en memoria: ninguna escritura llega a
// la base real, y `escrituras` anota lo que el servicio intentó guardar.
function conBase(t, fila, { desmarcados = 1 } = {}) {
  const escrituras = [];
  const anotar = (tabla, metodo, respuesta = {}) => async (args) => {
    escrituras.push({ tabla, metodo, ...args });
    return respuesta;
  };
  const reemplazos = {
    consignacion_ingresos: { findFirst: async () => fila },
    tramite_hitos: { upsert: anotar("tramite_hitos", "upsert"), updateMany: anotar("tramite_hitos", "updateMany", { count: desmarcados }) },
    entregas: { create: anotar("entregas", "create"), updateMany: anotar("entregas", "updateMany", { count: 1 }) },
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

test("marca un hito con su fecha y devuelve el legajo", async (t) => {
  const escrituras = conBase(t, vendida());
  const legajo = await marcarHito(1, "cobrado", { fecha: HOY }, 9);

  const [hito] = escrituras;
  assert.deepEqual(hito.where, { ingreso_id_tipo: { ingreso_id: 1, tipo: "cobrado" } });
  assert.equal(hito.create.fecha.toISOString().slice(0, 10), HOY);
  assert.equal(hito.create.creado_por, 9);
  assert.equal(legajo.id, 1);
});

test("volver a marcar reactiva el hito y corrige la fecha", async (t) => {
  const escrituras = conBase(t, vendida());
  await marcarHito(1, "entregado", { fecha: HOY }, 9);
  const [hito] = escrituras;
  assert.equal(hito.update.deleted_at, null);
  assert.equal(hito.update.fecha.toISOString().slice(0, 10), HOY);
});

test("un hito que no existe no se marca ni se desmarca", async (t) => {
  const escrituras = conBase(t, vendida());
  await assert.rejects(marcarHito(1, "pintado", { fecha: HOY }), (e) => e.status === 404);
  await assert.rejects(desmarcarHito(1, "pintado"), (e) => e.status === 404);
  assert.deepEqual(escrituras, []);
});

test("la fecha es obligatoria y no puede ser futura", async (t) => {
  const escrituras = conBase(t, vendida());
  const manana = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
  for (const fecha of [undefined, "", "ayer", manana]) {
    await assert.rejects(marcarHito(1, "cobrado", { fecha }), (e) => e.status === 400, String(fecha));
  }
  assert.deepEqual(escrituras, []);
});

test("sin vender no se marca nada", async (t) => {
  const escrituras = conBase(t, vendida({ estado: "recepcion" }));
  await assert.rejects(marcarHito(1, "entregado", { fecha: HOY }), (e) => e.status === 409 && /vendido/.test(e.message));
  assert.deepEqual(escrituras, []);
});

test("compra y consignación no llevan estos hitos", async (t) => {
  for (const modalidad of ["compra", "consignacion"]) {
    const escrituras = conBase(t, vendida({ modalidad }));
    await assert.rejects(marcarHito(1, "entregado", { fecha: HOY }), (e) => e.status === 409, modalidad);
    assert.deepEqual(escrituras, []);
  }
});

test("un trámite inexistente no se marca", async (t) => {
  conBase(t, null);
  await assert.rejects(marcarHito(1, "cobrado", { fecha: HOY }), (e) => e.status === 404);
  await assert.rejects(marcarHito("abc", "cobrado", { fecha: HOY }), (e) => e.status === 404);
});

test("la entrega guarda la foto a nombre del cliente y del trámite", async (t) => {
  const escrituras = conBase(t, vendida());
  await marcarHito(1, "entregado", { fecha: HOY, fotoUrl: FOTO }, 9);
  const foto = escrituras.find((e) => e.tabla === "entregas");
  assert.deepEqual(foto.data, { url: FOTO, cliente_id: 5, ingreso_id: 1 });
});

test("la foto es opcional, y solo se guarda en la entrega", async (t) => {
  const sinFoto = conBase(t, vendida());
  await marcarHito(1, "entregado", { fecha: HOY }, 9);
  assert.equal(sinFoto.some((e) => e.tabla === "entregas"), false);

  const cobro = conBase(t, vendida());
  await marcarHito(1, "cobrado", { fecha: HOY, fotoUrl: FOTO }, 9);
  assert.equal(cobro.some((e) => e.tabla === "entregas"), false);
});

test("una foto de otro sitio se rechaza sin guardar nada", async (t) => {
  const escrituras = conBase(t, vendida());
  await assert.rejects(marcarHito(1, "entregado", { fecha: HOY, fotoUrl: "https://otro.com/x.jpg" }), (e) => e.status === 400);
  assert.deepEqual(escrituras, []);
});

test("desmarcar borra el hito de forma lógica", async (t) => {
  const escrituras = conBase(t, vendida());
  await desmarcarHito(1, "cobrado");
  const [hito] = escrituras;
  assert.deepEqual(hito.where, { ingreso_id: 1, tipo: "cobrado", deleted_at: null });
  assert.ok(hito.data.deleted_at instanceof Date);
  assert.equal(escrituras.some((e) => e.tabla === "entregas"), false);
});

test("desmarcar la entrega saca su foto de la galería", async (t) => {
  const escrituras = conBase(t, vendida());
  await desmarcarHito(1, "entregado");
  const foto = escrituras.find((e) => e.tabla === "entregas");
  assert.deepEqual(foto.where, { ingreso_id: 1, deleted_at: null });
  assert.ok(foto.data.deleted_at instanceof Date);
});

test("desmarcar lo que no está marcado da 404", async (t) => {
  conBase(t, vendida(), { desmarcados: 0 });
  await assert.rejects(desmarcarHito(1, "cobrado"), (e) => e.status === 404);
});
