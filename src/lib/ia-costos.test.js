import { test } from "node:test";
import assert from "node:assert/strict";
import { costoClaude, costoGroq, estadoTope, inicioMesAR } from "./ia-costos.js";

// Precios de Claude Haiku 5.5 (por millón de tokens): entrada 0,10 · salida 0,50
// · escritura de caché 0,125 · lectura de caché 0,01. Más de 100.000 tokens de
// entrada: 0,50 / 2,50.

test("costo de Claude: solo entrada y salida", () => {
  const costo = costoClaude({ input_tokens: 10_000, output_tokens: 10_000 });
  // 10000×0,10 + 10000×0,50 = 1000 + 5000 = 6000 / 1e6
  assert.equal(costo, 0.006);
});

test("costo de Claude: suma la escritura y la lectura de caché", () => {
  const costo = costoClaude({
    input_tokens: 2_000,
    cache_creation_input_tokens: 4_000,
    cache_read_input_tokens: 10_000,
    output_tokens: 300,
  });
  // 2000×0,10 + 4000×0,125 + 10000×0,01 + 300×0,50 = 200 + 500 + 100 + 150 = 950 / 1e6
  assert.equal(costo, 0.00095);
});

test("costo de Claude: más de 100.000 tokens de entrada usa el precio largo", () => {
  const costo = costoClaude({ input_tokens: 150_000, output_tokens: 1_000 });
  // 150000×0,50 + 1000×2,50 = 75000 + 2500 = 77500 / 1e6
  assert.equal(costo, 0.0775);
});

test("costo de Claude: el umbral cuenta también la caché leída", () => {
  const costo = costoClaude({ input_tokens: 10_000, cache_read_input_tokens: 95_000, output_tokens: 0 });
  // 105.000 tokens de entrada en total → precio largo: 10000×0,50 + 95000×0,05
  assert.equal(costo, 0.00975);
});

test("costo de Claude: campos faltantes cuentan como cero", () => {
  assert.equal(costoClaude({}), 0);
  assert.equal(costoClaude(undefined), 0);
});

test("costo de Groq: segundos por precio, con mínimo por audio", () => {
  // US$0,04 por hora; mínimo 10 segundos por audio.
  assert.equal(costoGroq(3600), 0.04);
  assert.equal(costoGroq(3), costoGroq(10));
});

test("costo de Groq: sin audio no cuesta", () => {
  assert.equal(costoGroq(0), 0);
});

test("estado del tope: normal por debajo del 80%", () => {
  assert.deepEqual(estadoTope({ gastoUsd: 7.42, topeUsd: 10 }), {
    estado: "normal",
    porcentaje: 74.2,
    restanteUsd: 2.58,
  });
});

test("estado del tope: aviso desde el 80%", () => {
  assert.equal(estadoTope({ gastoUsd: 8, topeUsd: 10 }).estado, "aviso");
});

test("estado del tope: tope al llegar o pasar el 100%, sin restante negativo", () => {
  assert.deepEqual(estadoTope({ gastoUsd: 10.02, topeUsd: 10 }), {
    estado: "tope",
    porcentaje: 100.2,
    restanteUsd: 0,
  });
});

test("estado del tope: el porcentaje de aviso es configurable", () => {
  assert.equal(estadoTope({ gastoUsd: 6, topeUsd: 10, avisoPorcentaje: 60 }).estado, "aviso");
});

test("inicio del mes en hora de Argentina (UTC-3)", () => {
  // 10/10/2026 15:00 UTC → 1/10/2026 00:00 AR = 1/10/2026 03:00 UTC
  assert.equal(inicioMesAR(new Date("2026-10-10T15:00:00Z")).toISOString(), "2026-10-01T03:00:00.000Z");
});

test("inicio del mes: la madrugada del día 1 en UTC todavía es el mes anterior en AR", () => {
  // 1/11/2026 01:00 UTC = 31/10/2026 22:00 AR → el mes es octubre
  assert.equal(inicioMesAR(new Date("2026-11-01T01:00:00Z")).toISOString(), "2026-10-01T03:00:00.000Z");
});
