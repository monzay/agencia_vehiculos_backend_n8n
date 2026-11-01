import { test } from "node:test";
import assert from "node:assert/strict";
import { clasificacionDeSesion, mapClienteToLead, mapClienteToLeadDetalle } from "./lead.mapper.js";

// Decisión del 31/10/2026: la consulta nace fría y siempre tiene temperatura
// guardada; el panel muestra esa (las de venta no se clasifican).

test("con temperatura guardada, se muestra esa", () => {
  assert.equal(clasificacionDeSesion({ clasificacion: "CALIENTE", pago_tipo: "contado" }), "CALIENTE");
});

test("sin temperatura guardada no se inventa una (ya no existe \"en calificación\")", () => {
  assert.equal(clasificacionDeSesion({ clasificacion: null, pago_tipo: "financiado", score: 0 }), null);
  assert.equal(clasificacionDeSesion({ clasificacion: null, auto_id: 5, score: 2 }), null);
});

test("quiere vender su auto: no se clasifica", () => {
  assert.equal(clasificacionDeSesion({ tipo_lead: "venta", pago_tipo: "contado" }), null);
});

// ── Datos de contacto: salen de la ficha, no de canal_id ──

const ficha = {
  id: 4,
  nombre: "Ana",
  telefono: "3884708347",
  email: "ana@mail.com",
  canal: "whatsapp",
  created_at: new Date("2026-10-01T12:00:00Z"),
  chat_estado: [],
};

test("el lead trae los datos de contacto de la ficha", () => {
  const lead = mapClienteToLead(ficha);
  assert.deepEqual(
    { id: lead.id, nombre: lead.nombre, telefono: lead.telefono, email: lead.email, canal: lead.canal, creado: lead.creado },
    { id: 4, nombre: "Ana", telefono: "3884708347", email: "ana@mail.com", canal: "whatsapp", creado: "2026-10-01T12:00:00.000Z" }
  );
});

test("sin teléfono queda vacío: canal_id ya no es un respaldo", () => {
  const lead = mapClienteToLead({ ...ficha, telefono: null, canal_id: "5493884708347" });
  assert.equal(lead.telefono, "");
});

test("el lead no expone el identificador del canal (el panel no lo usa)", () => {
  const lead = mapClienteToLead({ ...ficha, canal_id: "5493884708347" });
  assert.equal("canalId" in lead, false);
  assert.equal(lead.canal, "whatsapp", "el canal sí se sigue mostrando");
});

test("el detalle del lead tampoco expone el identificador del canal", () => {
  const detalle = mapClienteToLeadDetalle({ ...ficha, canal_id: "5493884708347", historial_mensajes: [] });
  assert.equal("canalId" in detalle, false);
  assert.equal(detalle.telefono, "3884708347");
});
