import { test } from "node:test";
import assert from "node:assert/strict";
import { clasificacionDeSesion } from "./lead.mapper.js";

// Decisión del 11/10/2026: una consulta que ya está respondiendo preguntas pero
// todavía no tiene temperatura se muestra "En calificación", no fría.

test("con temperatura guardada, se muestra esa", () => {
  assert.equal(clasificacionDeSesion({ clasificacion: "CALIENTE", pago_tipo: "contado" }), "CALIENTE");
});

test("respondiendo preguntas sin temperatura todavía: en calificación", () => {
  assert.equal(clasificacionDeSesion({ clasificacion: null, pago_tipo: "financiado", score: 0 }), "EN_CALIFICACION");
  assert.equal(clasificacionDeSesion({ clasificacion: null, auto_id: 5, score: 2 }), "EN_CALIFICACION");
});

test("solo saludó: consulta general (sin clasificar)", () => {
  assert.equal(clasificacionDeSesion({ clasificacion: null, score: 0 }), null);
});

test("quiere vender su auto: no se clasifica", () => {
  assert.equal(clasificacionDeSesion({ tipo_lead: "venta", pago_tipo: "contado" }), null);
});
