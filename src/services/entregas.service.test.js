import { test } from "node:test";
import assert from "node:assert/strict";
import { crearEntrega, listarEntregas, listarEntregasGestion, buscarClientesParaEntrega } from "./entregas.service.js";

const FOTO = "https://abc123.public.blob.vercel-storage.com/vehiculos/imagen-x1Y2.jpg";
const juan = { id: 7, nombre: "Juan Pérez", telefono: null, canal_id: "5493884001122" };

function baseFalsa({ clientes = [juan], entregas = [] } = {}) {
  const creadas = [];
  return {
    creadas,
    clientes: { findUnique: async ({ where }) => clientes.find((c) => c.id === where.id) ?? null },
    entregas: {
      create: async ({ data, include }) => {
        const fila = { id: 1, created_at: new Date("2026-10-16T12:00:00Z"), deleted_at: null, ...data };
        creadas.push(fila);
        return include?.clientes ? { ...fila, clientes: clientes.find((c) => c.id === data.cliente_id) } : fila;
      },
      findMany: async ({ include }) => entregas.map((e) => (include?.clientes ? e : { ...e, clientes: undefined })),
    },
  };
}

test("una entrega nueva necesita el cliente que la recibió", async () => {
  await assert.rejects(crearEntrega({ url: FOTO }, baseFalsa()), (e) => e.status === 400 && /cliente/.test(e.message));
  await assert.rejects(crearEntrega({ url: FOTO, clienteId: "abc" }, baseFalsa()), (e) => e.status === 400);
});

test("si el cliente no existe, no se crea", async () => {
  const db = baseFalsa();
  await assert.rejects(crearEntrega({ url: FOTO, clienteId: 99 }, db), (e) => e.status === 404);
  assert.equal(db.creadas.length, 0);
});

test("se guarda atada al cliente y vuelve con su nombre para el panel", async () => {
  const db = baseFalsa();
  const e = await crearEntrega({ url: FOTO, clienteId: 7 }, db);
  assert.equal(db.creadas[0].cliente_id, 7);
  assert.deepEqual(e.cliente, { id: 7, nombre: "Juan Pérez", telefono: "5493884001122" });
});

test("la URL sigue validándose", async () => {
  await assert.rejects(crearEntrega({ url: "javascript:alert(1)", clienteId: 7 }, baseFalsa()), (e) => e.status === 400);
});

const fila = { id: 3, url: "https://blob/a.jpg", cliente_id: 7, created_at: new Date("2026-10-16T12:00:00Z"), deleted_at: null, clientes: juan };

test("la galería pública del home no muestra datos del cliente", async () => {
  const [e] = await listarEntregas(baseFalsa({ entregas: [fila] }));
  assert.deepEqual(Object.keys(e).sort(), ["creado", "id", "url"]);
});

test("el panel ve de quién es cada entrega", async () => {
  const [e] = await listarEntregasGestion(baseFalsa({ entregas: [fila] }));
  assert.deepEqual(e.cliente, { id: 7, nombre: "Juan Pérez", telefono: "5493884001122" });
  assert.equal(e.url, "https://blob/a.jpg");
});

test("solo se aceptan fotos subidas a nuestro Blob o las del sitio (/images)", async () => {
  const db = baseFalsa();
  await assert.doesNotReject(crearEntrega({ url: FOTO, clienteId: 7 }, db));
  await assert.doesNotReject(crearEntrega({ url: "/images/cliente1.jpeg", clienteId: 7 }, db));
  for (const url of ["https://evil.com/x.jpg", "//evil.com/x.jpg", "/\evil.com/x.jpg", "https://evil.com/vehiculos/x.public.blob.vercel-storage.com", "/images/../x"]) {
    await assert.rejects(crearEntrega({ url, clienteId: 7 }, db), (e) => e.status === 400, url);
  }
});

test("buscar cliente para la entrega: por nombre o teléfono, pocos resultados y solo lo necesario", async () => {
  const pedidos = [];
  const db = { clientes: { findMany: async (args) => (pedidos.push(args), [juan]) } };
  assert.deepEqual(await buscarClientesParaEntrega("j", db), [], "con menos de 2 letras no busca");
  assert.equal(pedidos.length, 0);
  const r = await buscarClientesParaEntrega("  juan ", db);
  assert.deepEqual(r, [{ id: 7, nombre: "Juan Pérez", telefono: "5493884001122" }]);
  assert.ok(pedidos[0].take <= 10);
  assert.deepEqual(Object.keys(pedidos[0].select).sort(), ["canal_id", "id", "nombre", "telefono"]);
  assert.match(JSON.stringify(pedidos[0].where), /"juan"/);
});
