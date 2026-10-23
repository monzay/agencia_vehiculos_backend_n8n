import { test } from "node:test";
import assert from "node:assert/strict";
import { crearEntrega, listarEntregas, listarEntregasGestion, buscarClientesParaEntrega } from "./entregas.service.js";

const FOTO = "https://abc123.public.blob.vercel-storage.com/vehiculos/imagen-x1Y2.jpg";
const juan = { id: 7, nombre: "Juan Pérez", telefono: "3884001122" };
// Ficha que quedó archivada al fusionarse con otra de la misma persona.
const archivada = { id: 8, nombre: "Juan Pérez", telefono: "3884001122", deleted_at: new Date("2026-10-18T10:00:00Z") };

function baseFalsa({ clientes = [juan], entregas = [] } = {}) {
  const creadas = [];
  const incluidos = [];
  // Respeta el `id` y el `deleted_at` del where, se lea como se lea.
  const buscarCliente = async ({ where }) =>
    clientes.find((c) => c.id === where.id && (where.deleted_at === undefined || (c.deleted_at ?? null) === where.deleted_at)) ?? null;
  return {
    creadas,
    incluidos,
    clientes: { findFirst: buscarCliente, findUnique: buscarCliente },
    entregas: {
      create: async ({ data, include }) => {
        incluidos.push(include);
        const fila = { id: 1, created_at: new Date("2026-10-16T12:00:00Z"), deleted_at: null, ...data };
        creadas.push(fila);
        return include?.clientes ? { ...fila, clientes: clientes.find((c) => c.id === data.cliente_id) } : fila;
      },
      findMany: async ({ include }) => {
        incluidos.push(include);
        return entregas.map((e) => (include?.clientes ? e : { ...e, clientes: undefined }));
      },
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

test("una ficha archivada por una fusión no puede recibir una entrega nueva", async () => {
  const db = baseFalsa({ clientes: [juan, archivada] });
  await assert.rejects(crearEntrega({ url: FOTO, clienteId: 8 }, db), (e) => e.status === 404);
  assert.equal(db.creadas.length, 0);
});

test("se guarda atada al cliente y vuelve con su nombre para el panel", async () => {
  const db = baseFalsa();
  const e = await crearEntrega({ url: FOTO, clienteId: 7 }, db);
  assert.equal(db.creadas[0].cliente_id, 7);
  assert.deepEqual(e.cliente, { id: 7, nombre: "Juan Pérez", telefono: "3884001122" });
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
  assert.deepEqual(e.cliente, { id: 7, nombre: "Juan Pérez", telefono: "3884001122" });
  assert.equal(e.url, "https://blob/a.jpg");
});

test("del cliente de la entrega solo se piden id, nombre y teléfono", async () => {
  const db = baseFalsa({ entregas: [fila] });
  await crearEntrega({ url: FOTO, clienteId: 7 }, db);
  await listarEntregasGestion(db);
  assert.equal(db.incluidos.length, 2);
  for (const include of db.incluidos) assert.deepEqual(include.clientes.select, { id: true, nombre: true, telefono: true });
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
  assert.deepEqual(r, [{ id: 7, nombre: "Juan Pérez", telefono: "3884001122" }]);
  assert.ok(pedidos[0].take <= 10);
  assert.deepEqual(Object.keys(pedidos[0].select).sort(), ["id", "nombre", "telefono"]);
  assert.match(JSON.stringify(pedidos[0].where), /"juan"/);
});

// Lo que se le pide a la base al buscar `texto`.
async function pedidoDeBusqueda(texto) {
  const pedidos = [];
  const db = { clientes: { findMany: async (args) => (pedidos.push(args), []) } };
  await buscarClientesParaEntrega(texto, db);
  return pedidos[0];
}

test("buscar cliente: solo fichas vigentes, no las archivadas por una fusión", async () => {
  const { where } = await pedidoDeBusqueda("juan");
  assert.equal(where.deleted_at, null);
});

test("buscar cliente: por nombre y por los dígitos del teléfono, escrito como se escriba", async () => {
  const { where } = await pedidoDeBusqueda("388 400-1122");
  assert.deepEqual(where.OR, [{ nombre: { contains: "388 400-1122" } }, { telefono: { contains: "3884001122" } }]);
});

test("buscar cliente: un nombre no busca por teléfono (un contains vacío traería a todos)", async () => {
  const { where } = await pedidoDeBusqueda("juan");
  assert.deepEqual(where.OR, [{ nombre: { contains: "juan" } }]);
});

test("buscar cliente: un solo dígito suelto no alcanza para buscar por teléfono", async () => {
  const { where } = await pedidoDeBusqueda("j7");
  assert.deepEqual(where.OR, [{ nombre: { contains: "j7" } }]);
});

test("buscar cliente: ya no mira canal_id", async () => {
  assert.doesNotMatch(JSON.stringify(await pedidoDeBusqueda("3884001122")), /canal_id/);
});

// El teléfono se guarda con 10 dígitos; el usuario lo pega como lo tenga.
test("buscar cliente: un número pegado con +54 9 también busca por el teléfono guardado, de 10 dígitos", async () => {
  const { where } = await pedidoDeBusqueda("+54 9 388 400-1122");
  assert.deepEqual(where.OR, [
    { nombre: { contains: "+54 9 388 400-1122" } },
    { telefono: { contains: "5493884001122" } },
    { telefono: { contains: "3884001122" } },
  ]);
});

test("buscar cliente: el 0 y el 15 de la marcación vieja también llegan al teléfono guardado", async () => {
  const { where } = await pedidoDeBusqueda("0388 15 400-1122");
  assert.deepEqual(where.OR, [
    { nombre: { contains: "0388 15 400-1122" } },
    { telefono: { contains: "0388154001122" } },
    { telefono: { contains: "3884001122" } },
  ]);
});

test("buscar cliente: un número parcial se busca tal cual, sin normalizar", async () => {
  const { where } = await pedidoDeBusqueda("4001");
  assert.deepEqual(where.OR, [{ nombre: { contains: "4001" } }, { telefono: { contains: "4001" } }]);
});

test("buscar cliente: un número extranjero se busca por sus dígitos, sin inventarle un nacional", async () => {
  const { where } = await pedidoDeBusqueda("+1 415 555 2671");
  assert.deepEqual(where.OR, [{ nombre: { contains: "+1 415 555 2671" } }, { telefono: { contains: "14155552671" } }]);
});

test("buscar cliente: uno sin teléfono se muestra sin número", async () => {
  const db = { clientes: { findMany: async () => [{ id: 9, nombre: "Ana", telefono: null, canal_id: "5493884001122" }] } };
  assert.deepEqual(await buscarClientesParaEntrega("ana", db), [{ id: 9, nombre: "Ana", telefono: "" }]);
});
