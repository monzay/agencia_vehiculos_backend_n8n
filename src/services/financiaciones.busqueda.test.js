import { test } from "node:test";
import assert from "node:assert/strict";
import { listarFinanciacionesPaginado } from "./financiaciones.service.js";

// El buscador del listado de Financiación. El teléfono se guarda con 10 dígitos
// (3884708347) y el DNI solo con dígitos, pero se escriben o pegan como vengan.

const plan = (id, cliente) => ({
  id,
  cliente_id: cliente.id,
  cantidad_cuotas: 12,
  precio_cuota: 1000,
  dia_pago: 10,
  activo: true,
  created_at: new Date("2026-10-05T12:00:00Z"),
  clientes: cliente,
  pagos: [],
  alertas: [],
});

const FICHAS = [
  { id: 1, nombre: "Lucía Pérez", telefono: "3884708347", dni: "30125678", email: "lucia@example.com" },
  { id: 2, nombre: "Marcos Gómez", telefono: "3511234567", dni: "20111222", email: "marcos@example.com" },
];
const db = { financiaciones: { findMany: async () => FICHAS.map((c, i) => plan(10 + i, c)) } };
const buscar = async (q) => (await listarFinanciacionesPaginado({ q }, db)).items.map((f) => f.clienteId);

test("el teléfono se encuentra escrito como se escriba: con +54 9, con 0 y 15, con guiones o espacios", async () => {
  for (const q of ["3884708347", "+54 9 388 470-8347", "0388 15 470-8347", "388 470 8347", "5493884708347"]) {
    assert.deepEqual(await buscar(q), [1], `no encontró "${q}"`);
  }
});

test("un pedazo del número sigue encontrando, y un número que no está no trae a nadie", async () => {
  assert.deepEqual(await buscar("4708347"), [1]);
  assert.deepEqual(await buscar("3519999999"), []);
});

test("el DNI se encuentra con o sin puntos", async () => {
  assert.deepEqual(await buscar("30.125.678"), [1]);
  assert.deepEqual(await buscar("30125678"), [1]);
});

test("nombre y email se siguen buscando sin importar mayúsculas", async () => {
  assert.deepEqual(await buscar("lucía"), [1]);
  assert.deepEqual(await buscar("MARCOS@"), [2]);
});

test("una búsqueda que no es texto (?q=a&q=b) no rompe: se lista todo", async () => {
  const { total, items } = await listarFinanciacionesPaginado({ q: ["a", "b"] }, db);
  assert.equal(total, 2);
  assert.equal(items.length, 2);
});
