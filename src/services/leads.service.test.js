import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma.js";
import { listarLeads, listarLeadsPaginado, obtenerLead, resumenLeads } from "./leads.service.js";

// El servicio usa el cliente Prisma único: se le cambian las lecturas de
// `clientes` por una base falsa en memoria que respeta `id` y `deleted_at`.
function conFichas(t, fichas) {
  const pedidos = [];
  const coincide = (where = {}) => (c) =>
    (where.id === undefined || c.id === where.id) &&
    (where.deleted_at === undefined || (c.deleted_at ?? null) === where.deleted_at);
  const { findMany, findFirst, findUnique } = prisma.clientes;
  prisma.clientes.findMany = async (args) => (pedidos.push(args), fichas.filter(coincide(args.where)));
  prisma.clientes.findFirst = async (args) => (pedidos.push(args), fichas.find(coincide(args.where)) ?? null);
  prisma.clientes.findUnique = prisma.clientes.findFirst;
  t.after(() => Object.assign(prisma.clientes, { findMany, findFirst, findUnique }));
  return pedidos;
}

const ficha = (id, extra = {}) => ({
  id,
  nombre: `Cliente ${id}`,
  telefono: `388400000${id}`,
  email: null,
  canal: "whatsapp",
  created_at: new Date("2026-10-01T12:00:00Z"),
  deleted_at: null,
  chat_estado: [],
  historial_mensajes: [],
  ...extra,
});

// Ficha que quedó archivada al fusionarse con otra de la misma persona.
const archivada = (id, fusionadoEn) => ficha(id, { deleted_at: new Date("2026-10-18T10:00:00Z"), fusionado_en_id: fusionadoEn });

test("la lista de clientes pide solo las fichas vigentes", async (t) => {
  const pedidos = conFichas(t, [ficha(1)]);
  await listarLeads();
  assert.equal(pedidos[0].where?.deleted_at, null);
});

test("una ficha archivada por una fusión no aparece en la lista de clientes", async (t) => {
  conFichas(t, [ficha(1), archivada(2, 1)]);
  const leads = await listarLeads();
  assert.deepEqual(leads.map((l) => l.id), [1]);
});

test("la página, la búsqueda y el resumen del panel tampoco la cuentan", async (t) => {
  conFichas(t, [ficha(1), archivada(2, 1)]);
  const pagina = await listarLeadsPaginado({ q: "cliente", limite: 10 });
  assert.equal(pagina.total, 1);
  assert.deepEqual(pagina.items.map((l) => l.id), [1]);

  const resumen = await resumenLeads();
  assert.equal(resumen.total, 1);
  assert.deepEqual(resumen.recientes.map((l) => l.id), [1]);
});

test("el detalle de una ficha archivada no se muestra, el de una vigente sí", async (t) => {
  conFichas(t, [ficha(1), archivada(2, 1)]);
  assert.equal(await obtenerLead(2), null);
  assert.equal((await obtenerLead(1)).id, 1);
});

// ── Búsqueda por teléfono: el guardado tiene 10 dígitos, el usuario lo pega como quiera ──

const idsDeLaBusqueda = async (q) => (await listarLeadsPaginado({ q })).items.map((l) => l.id);

test("buscar por un número pegado con otro formato encuentra el teléfono guardado de 10 dígitos", async (t) => {
  conFichas(t, [ficha(1, { telefono: "3884708347" }), ficha(2, { telefono: "3884000002" })]);
  for (const q of ["+54 9 388 470-8347", "5493884708347", "0388 15 470-8347", "388 470-8347", "3884708347"]) {
    assert.deepEqual(await idsDeLaBusqueda(q), [1], q);
  }
});

test("buscar por un número parcial sigue funcionando", async (t) => {
  conFichas(t, [ficha(1, { telefono: "3884708347" }), ficha(2, { telefono: "3884000002" })]);
  assert.deepEqual(await idsDeLaBusqueda("4708"), [1]);
});

test("buscar por otro número no trae al cliente que solo comparte el prefijo", async (t) => {
  conFichas(t, [ficha(1, { telefono: "3884708347" })]);
  assert.deepEqual(await idsDeLaBusqueda("+54 9 388 470-8348"), []);
});

test("buscar un texto con pocos dígitos no trae a quien los tiene en el teléfono", async (t) => {
  conFichas(t, [ficha(1, { telefono: "3882015000" })]);
  assert.deepEqual(await idsDeLaBusqueda("gol 2015"), []);
});
