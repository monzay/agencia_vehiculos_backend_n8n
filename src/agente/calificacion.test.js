import { test } from "node:test";
import assert from "node:assert/strict";
import { puntaje, clasificar, pendientes, respondido } from "./calificacion.js";

// Reglas del bot actual: auto de la web +2 · contado +3 / financiado 0 ·
// recibo +2 / sin recibo −2 · usado +1 · decide solo +2 / consulta −1 ·
// esta semana +3 / próximas +1 / no sabe −1 · nunca baja de 0.
// Temperatura: ≥7 caliente, ≥3 tibio; financiado con recibo → caliente y
// financiado sin recibo → frío (las dos pisan el puntaje).

test("sesión sin respuestas: puntaje 0 y frío", () => {
  assert.equal(puntaje({}), 0);
  assert.equal(clasificar({}), "FRIO");
});

test("cada respuesta suma sus puntos", () => {
  assert.equal(puntaje({ auto_id: 5 }), 2);
  assert.equal(puntaje({ pago_tipo: "contado" }), 3);
  assert.equal(puntaje({ pago_tipo: "financiado", credito_ok: 1 }), 2);
  assert.equal(puntaje({ entrega_usado: true }), 1);
  assert.equal(puntaje({ decisor: "solo" }), 2);
  assert.equal(puntaje({ disponibilidad: "esta_semana" }), 3);
  assert.equal(puntaje({ disponibilidad: "proximas" }), 1);
});

test("el puntaje nunca baja de 0", () => {
  assert.equal(puntaje({ pago_tipo: "financiado", credito_ok: 0, decisor: "consulta", disponibilidad: "no_sabe" }), 0);
});

test("contado, decide solo y viene esta semana: caliente", () => {
  const s = { pago_tipo: "contado", decisor: "solo", disponibilidad: "esta_semana" };
  assert.equal(puntaje(s), 8);
  assert.equal(clasificar(s), "CALIENTE");
});

test("puntaje entre 3 y 6: tibio", () => {
  assert.equal(clasificar({ pago_tipo: "contado", entrega_usado: false }), "TIBIO");
});

test("puntaje menor a 3: frío", () => {
  assert.equal(clasificar({ pago_tipo: "contado", decisor: "consulta", disponibilidad: "no_sabe" }), "FRIO");
});

// Decisión del 31/10/2026: la consulta nace fría y la temperatura se adapta con
// cada respuesta, aunque todavía no haya dicho cómo paga.

test("sin la forma de pago se califica por el puntaje que lleva", () => {
  assert.equal(clasificar({ auto_id: 5 }), "FRIO");
  assert.equal(clasificar({ auto_id: 5, entrega_usado: true }), "TIBIO");
  assert.equal(clasificar({ auto_id: 5, decisor: "solo", disponibilidad: "esta_semana" }), "CALIENTE");
});

test("financia y todavía no dijo si tiene recibo: se califica por el puntaje", () => {
  assert.equal(clasificar({ pago_tipo: "financiado", entrega_usado: true }), "FRIO");
  assert.equal(clasificar({ pago_tipo: "financiado", auto_id: 5, entrega_usado: true }), "TIBIO");
});

test("contado solo ya es tibio", () => {
  assert.equal(clasificar({ pago_tipo: "contado" }), "TIBIO");
});

test("con recibo aunque lo consulte con alguien: caliente", () => {
  const s = { pago_tipo: "financiado", credito_ok: 1, decisor: "consulta" };
  assert.equal(clasificar(s), "CALIENTE");
});

test("con recibo o garante es caliente, sume lo que sume", () => {
  assert.equal(clasificar({ pago_tipo: "financiado", credito_ok: 1 }), "CALIENTE");
  assert.equal(clasificar({ auto_id: 5, pago_tipo: "financiado", credito_ok: 1 }), "CALIENTE");
  assert.equal(clasificar({ pago_tipo: "financiado", credito_ok: 1, decisor: "solo", disponibilidad: "proximas" }), "CALIENTE");
});

test("con recibo aunque no sepa cuándo viene: caliente", () => {
  assert.equal(clasificar({ pago_tipo: "financiado", credito_ok: 1, disponibilidad: "no_sabe" }), "CALIENTE");
});

test("financiado sin recibo ni garante: frío aunque sume mucho", () => {
  const s = { auto_id: 1, pago_tipo: "financiado", credito_ok: 0, decisor: "solo", disponibilidad: "esta_semana", entrega_usado: true };
  assert.equal(clasificar(s), "FRIO");
});

test("el resultado no depende del orden en que respondió", () => {
  const a = { decisor: "solo", pago_tipo: "contado", disponibilidad: "proximas" };
  const b = { disponibilidad: "proximas", pago_tipo: "contado", decisor: "solo" };
  assert.equal(puntaje(a), puntaje(b));
  assert.equal(clasificar(a), clasificar(b));
});

// ── Qué le falta preguntar (recorrido de calificación) ──

const completa = {
  auto_id: 5,
  pago_tipo: "contado",
  entrega_usado: 0,
  decisor: "solo",
  disponibilidad: "esta_semana",
  visita_propuesta: "sábado a la mañana",
};

test("con todo respondido no falta nada", () => {
  assert.deepEqual(pendientes(completa, null), []);
});

test("sin nada, falta todo en el orden del recorrido", () => {
  assert.deepEqual(pendientes({}, null), [
    "auto de interés",
    "forma de pago",
    "si entrega un usado",
    "quién decide",
    "cuándo puede venir a la agencia (día, hora, semana o fecha)",
  ]);
});

test("si financia, pide anticipo y recibo o garante", () => {
  assert.deepEqual(pendientes({ ...completa, pago_tipo: "financiado" }, null), ["anticipo", "recibo o garante"]);
  assert.deepEqual(pendientes({ ...completa, pago_tipo: "financiado", anticipo: "5 millones", credito_ok: 1 }, null), []);
});

test("si entrega usado, pide solo marca, modelo y año y después cuánto pide (km y estado se ven en la agencia)", () => {
  const conUsado = { ...completa, entrega_usado: 1 };
  assert.deepEqual(pendientes(conUsado, null), [
    "marca, modelo y año del usado",
    "cuánto pide por el usado (o si no sabe)",
  ]);
  const usadoCompleto = { marca: "Volkswagen", modelo: "Gol Trend", anio: 2015, kms: null, detalles: null, precio_pedido: "No sabe" };
  assert.deepEqual(pendientes(conUsado, usadoCompleto), []);
  assert.deepEqual(pendientes(conUsado, { ...usadoCompleto, anio: null }), ["marca, modelo y año del usado"]);
});

test("la visita: con día acordado está completa; si no sabe cuándo, no se insiste", () => {
  assert.deepEqual(pendientes({ ...completa, visita_propuesta: null }, null), ["cuándo puede venir a la agencia (día, hora, semana o fecha)"]);
  assert.deepEqual(pendientes({ ...completa, disponibilidad: "no_sabe", visita_propuesta: null }, null), []);
});

// ── Lo que el cliente ya respondió (para no volver a preguntarlo) ──

test("resume lo ya respondido, usado incluido", () => {
  const sesion = {
    pago_tipo: "financiado", anticipo: "5 millones", credito_ok: 1, entrega_usado: 1,
    decisor: "consulta", decisor_con: "marido", disponibilidad: "proximas", visita_propuesta: "martes a la tarde",
  };
  const usado = { marca: "Volkswagen", modelo: "Gol", anio: 2015, kms: "98000", detalles: "service al día", precio_pedido: "No sabe" };
  assert.deepEqual(respondido(sesion, usado), [
    "paga financiado",
    'anticipo: "5 millones"',
    "tiene recibo de sueldo o garante",
    'entrega un usado: "Volkswagen Gol 2015, 98000 km, service al día, pide: No sabe"',
    'lo decide con "marido"',
    "puede venir en las próximas semanas",
    'visita propuesta: "martes a la tarde"',
  ]);
});

test("sin respuestas no hay nada que resumir; sin usado lo dice", () => {
  assert.deepEqual(respondido({}, null), []);
  assert.deepEqual(respondido({ pago_tipo: "financiado", entrega_usado: 0, credito_ok: 0, decisor: "solo" }, null), [
    "paga financiado",
    "no tiene recibo de sueldo ni garante",
    "no entrega usado",
    "decide solo",
  ]);
});

test("si paga de contado, el recibo y el anticipo no cuentan (ni para la temperatura)", () => {
  const contado = { pago_tipo: "contado", credito_ok: 0, anticipo: "algo", decisor: "solo", disponibilidad: "esta_semana" };
  assert.equal(clasificar(contado), "CALIENTE");
  assert.equal(puntaje(contado), 8);
  assert.deepEqual(respondido(contado, null), ["paga contado", "decide solo", "puede venir esta semana"]);
});

test("con la visita acordada alcanza, aunque no haya guardado la disponibilidad", () => {
  assert.deepEqual(pendientes({ ...completa, disponibilidad: null, visita_propuesta: "jueves a la tarde" }, null), []);
});
