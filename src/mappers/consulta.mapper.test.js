import { test } from "node:test";
import assert from "node:assert/strict";
import { construirRespuestas, mapConsultaResumen } from "./consulta.mapper.js";

const respuesta = (lista, pregunta) => lista.find((r) => r.pregunta === pregunta)?.respuesta;

test("muestra el usado completo que entrega: marca, modelo, año, km, estado y cuánto pide", () => {
  const r = construirRespuestas({ entrega_usado: 1 }, [
    { contexto: "trade_in", marca: "Volkswagen", modelo: "Gol Trend", anio: 2015, kms: "98000", detalles: "Service al día, un rayón", precio_pedido: "6000000" },
  ]);
  assert.equal(respuesta(r, "Marca del usado que entrega"), "Volkswagen");
  assert.equal(respuesta(r, "Kilómetros del usado"), "98000");
  assert.equal(respuesta(r, "Estado del usado"), "Service al día, un rayón");
  assert.equal(respuesta(r, "Cuánto pide por el usado"), "6000000");
});

test("si no sabe cuánto pedir por el usado, se muestra así", () => {
  const r = construirRespuestas({ entrega_usado: 1 }, [{ contexto: "trade_in", marca: "Fiat", precio_pedido: "No sabe" }]);
  assert.equal(respuesta(r, "Cuánto pide por el usado"), "No sabe");
});

test("muestra la visita propuesta al final, después de cuándo puede venir", () => {
  const r = construirRespuestas({ disponibilidad: "esta_semana", visita_propuesta: "sábado a la mañana" });
  const preguntas = r.map((x) => x.pregunta);
  assert.equal(respuesta(r, "Visita propuesta"), "sábado a la mañana");
  assert.ok(preguntas.indexOf("Visita propuesta") > preguntas.indexOf("¿Cuándo puede venir?"));
});

test("sin visita ni detalles, no agrega filas vacías", () => {
  const r = construirRespuestas({ entrega_usado: 1 }, [{ contexto: "trade_in", marca: "Fiat", detalles: "  " }]);
  assert.equal(respuesta(r, "Estado del usado"), undefined);
  assert.equal(respuesta(r, "Visita propuesta"), undefined);
});

// ── Aviso al vendedor en la lista de Consultas ──

test("la consulta trae el aviso al vendedor con su motivo y la visita propuesta", () => {
  const at = new Date("2026-10-11T15:00:00Z");
  const r = mapConsultaResumen(
    { id: 9, cliente_id: 1, requiere_vendedor: true, requiere_vendedor_motivo: "Visita propuesta: sábado a la mañana", requiere_vendedor_at: at, visita_propuesta: "sábado a la mañana" },
    { id: 1, nombre: "Ana" },
    null,
    null
  );
  assert.deepEqual(r.requiereVendedor, { motivo: "Visita propuesta: sábado a la mañana", at: at.toISOString() });
  assert.equal(r.visitaPropuesta, "sábado a la mañana");
});

test("sin aviso, no lo trae", () => {
  const r = mapConsultaResumen({ id: 9, cliente_id: 1, requiere_vendedor: false }, { id: 1 }, null, null);
  assert.equal(r.requiereVendedor, null);
  assert.equal(r.visitaPropuesta, null);
});
