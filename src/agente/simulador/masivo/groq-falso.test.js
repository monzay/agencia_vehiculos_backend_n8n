import { test } from "node:test";
import assert from "node:assert/strict";
import { crearGroqFalso } from "./groq-falso.js";

const AUDIO = { buffer: Buffer.from("x"), mediaType: "audio/ogg" };

test("devuelve la siguiente respuesta en cada llamada", async () => {
  const transcribir = crearGroqFalso([
    { texto: "hola quiero el auto", segundos: 4 },
    { texto: "dale", segundos: 1 },
  ]);
  assert.deepEqual(await transcribir(AUDIO), { texto: "hola quiero el auto", segundos: 4 });
  assert.deepEqual(await transcribir(AUDIO), { texto: "dale", segundos: 1 });
});

test("tira error cuando la respuesta es { error }", async () => {
  const transcribir = crearGroqFalso([{ error: "Groq caído" }]);
  await assert.rejects(() => transcribir(AUDIO), /Groq caído/);
});

test("después de un error sigue con la respuesta siguiente", async () => {
  const transcribir = crearGroqFalso([{ error: "falló" }, { texto: "ok", segundos: 2 }]);
  await assert.rejects(() => transcribir(AUDIO));
  assert.deepEqual(await transcribir(AUDIO), { texto: "ok", segundos: 2 });
});

test("cuenta las llamadas, también las que fallan", async () => {
  const transcribir = crearGroqFalso([{ texto: "a", segundos: 1 }, { error: "x" }]);
  assert.equal(transcribir.llamadas, 0);
  await transcribir(AUDIO);
  await assert.rejects(() => transcribir(AUDIO));
  assert.equal(transcribir.llamadas, 2);
});

test("es una función, no un objeto", () => {
  assert.equal(typeof crearGroqFalso([]), "function");
});

test("sin respuestas pendientes, tira un error claro en vez de inventar una", async () => {
  const transcribir = crearGroqFalso([]);
  await assert.rejects(() => transcribir(AUDIO), /guion|respuesta|sin/i);
});
