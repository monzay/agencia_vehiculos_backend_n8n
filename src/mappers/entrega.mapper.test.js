import { test } from "node:test";
import assert from "node:assert/strict";
import { mapEntrega, mapEntregaGestion } from "./entrega.mapper.js";

const entrega = { id: 3, url: "https://blob/a.jpg", created_at: new Date("2026-10-16T12:00:00Z") };

test("el panel ve el cliente de la entrega con el teléfono de su ficha", () => {
  const e = mapEntregaGestion({ ...entrega, clientes: { id: 7, nombre: "Juan Pérez", telefono: "3884001122" } });
  assert.deepEqual(e.cliente, { id: 7, nombre: "Juan Pérez", telefono: "3884001122" });
  assert.equal(e.url, "https://blob/a.jpg");
});

test("sin teléfono queda vacío: canal_id ya no es un respaldo", () => {
  const e = mapEntregaGestion({ ...entrega, clientes: { id: 7, nombre: "Juan Pérez", telefono: null, canal_id: "5493884001122" } });
  assert.equal(e.cliente.telefono, "");
});

test("un cliente sin nombre se muestra como 'Sin nombre'", () => {
  const e = mapEntregaGestion({ ...entrega, clientes: { id: 7, nombre: null, telefono: "3884001122" } });
  assert.equal(e.cliente.nombre, "Sin nombre");
});

test("una entrega sin cliente asociado sale con cliente null", () => {
  assert.equal(mapEntregaGestion({ ...entrega, clientes: null }).cliente, null);
});

test("la entrega pública no lleva datos del cliente", () => {
  const e = mapEntrega({ ...entrega, clientes: { id: 7, nombre: "Juan Pérez", telefono: "3884001122" } });
  assert.deepEqual(Object.keys(e).sort(), ["creado", "id", "url"]);
});
