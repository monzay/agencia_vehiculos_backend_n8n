import { test } from "node:test";
import assert from "node:assert/strict";
import { LIMITES, decidirAtencion, audioPermitido, historialParaClaude } from "./limites.js";

// ── Límites acordados ──

test("los límites son los acordados con la agencia", () => {
  assert.equal(LIMITES.mensajesPorDia, 25);
  assert.equal(LIMITES.herramientasPorMensaje, 5);
  assert.equal(LIMITES.segundosAudioMax, 120);
  assert.equal(LIMITES.bytesAudioMax, 2_000_000);
  assert.equal(LIMITES.gastoUsdClienteDia, 0.5);
  assert.equal(LIMITES.margenTope, 1.1);
  assert.equal(LIMITES.caracteresMensaje, 1500);
  assert.equal(LIMITES.caracteresHistorial, 8000);
});

// ── Quién atiende: la IA o el mensaje fijo ──

const base = { gastoMesUsd: 2, topeUsd: 10, mensajesHoy: 3, clienteHabloHoy: false, gastoClienteHoyUsd: 0.01 };

test("con cupo y dentro del límite: atiende la IA", () => {
  assert.deepEqual(decidirAtencion(base), { conIA: true });
});

test("tope alcanzado y cliente nuevo: mensaje fijo", () => {
  assert.deepEqual(decidirAtencion({ ...base, gastoMesUsd: 10 }), { conIA: false, motivo: "tope" });
});

test("tope alcanzado pero el cliente ya venía hablando hoy: sigue la IA", () => {
  assert.deepEqual(decidirAtencion({ ...base, gastoMesUsd: 10.02, clienteHabloHoy: true }), { conIA: true });
});

test("el mensaje 26 del día del mismo cliente: mensaje fijo, aunque haya cupo", () => {
  assert.deepEqual(decidirAtencion({ ...base, mensajesHoy: 25 }), { conIA: false, motivo: "limite_cliente" });
  assert.deepEqual(decidirAtencion({ ...base, mensajesHoy: 24 }), { conIA: true });
});

test("el límite por cliente gana también al que ya venía hablando", () => {
  assert.equal(decidirAtencion({ ...base, gastoMesUsd: 10, clienteHabloHoy: true, mensajesHoy: 25 }).conIA, false);
});

test("pasado el 110% del tope corta a todos, aunque vinieran hablando", () => {
  assert.deepEqual(decidirAtencion({ ...base, gastoMesUsd: 11, clienteHabloHoy: true }), { conIA: false, motivo: "tope" });
  assert.equal(decidirAtencion({ ...base, gastoMesUsd: 10.99, clienteHabloHoy: true }).conIA, true);
});

test("un cliente que ya gastó US$ 0,50 hoy pasa a un vendedor", () => {
  assert.deepEqual(decidirAtencion({ ...base, gastoClienteHoyUsd: 0.5 }), { conIA: false, motivo: "gasto_cliente" });
  assert.equal(decidirAtencion({ ...base, gastoClienteHoyUsd: 0.49 }).conIA, true);
});

// ── Audios ──

test("audios de hasta 2 minutos", () => {
  assert.equal(audioPermitido(120), true);
  assert.equal(audioPermitido(121), false);
  assert.equal(audioPermitido(0), false);
});

// ── Historial para Claude ──

test("convierte el historial a turnos de usuario y asistente", () => {
  const filas = [
    { direccion: "entrante", mensaje: "Hola" },
    { direccion: "saliente", mensaje: "¡Hola! ¿En qué te ayudo?" },
  ];
  assert.deepEqual(historialParaClaude(filas), [
    { role: "user", content: "Hola" },
    { role: "assistant", content: "¡Hola! ¿En qué te ayudo?" },
  ]);
});

test("une mensajes seguidos de la misma persona", () => {
  const filas = [
    { direccion: "entrante", mensaje: "Hola" },
    { direccion: "entrante", mensaje: "¿Tenés camionetas?" },
  ];
  assert.deepEqual(historialParaClaude(filas), [{ role: "user", content: "Hola\n¿Tenés camionetas?" }]);
});

test("descarta las respuestas del bot que quedaron antes del primer mensaje del cliente", () => {
  const filas = [
    { direccion: "saliente", mensaje: "Recordatorio: ¿seguís interesado?" },
    { direccion: "entrante", mensaje: "Sí" },
  ];
  assert.deepEqual(historialParaClaude(filas), [{ role: "user", content: "Sí" }]);
});

test("ignora mensajes vacíos", () => {
  const filas = [
    { direccion: "entrante", mensaje: "  " },
    { direccion: "entrante", mensaje: null },
    { direccion: "entrante", mensaje: "Hola" },
  ];
  assert.deepEqual(historialParaClaude(filas), [{ role: "user", content: "Hola" }]);
});

test("recorta cada mensaje largo del historial", () => {
  const largo = "a".repeat(5000);
  const [turno] = historialParaClaude([{ direccion: "entrante", mensaje: largo }]);
  assert.equal(turno.content.length, LIMITES.caracteresMensaje);
});

test("si el historial es muy largo, quedan solo los mensajes más recientes", () => {
  const filas = Array.from({ length: 20 }, (_, i) => ({ direccion: i % 2 ? "saliente" : "entrante", mensaje: `${i}-` + "x".repeat(1400) }));
  const turnos = historialParaClaude(filas);
  const total = turnos.reduce((n, t) => n + t.content.length, 0);
  assert.ok(total <= LIMITES.caracteresHistorial + turnos.length, "no pasa el máximo de caracteres");
  assert.match(turnos.at(-1).content, /^19-/, "conserva el último mensaje");
  assert.equal(turnos[0].role, "user");
});
