import { test } from "node:test";
import assert from "node:assert/strict";
import { duracionOgg, transcribirConGroq, MODELO_GROQ } from "./audio.js";
import { notaDeVoz } from "./ogg-de-prueba.js";

// ── Duración de una nota de voz de WhatsApp (ogg/opus) ──

test("lee la duración de una nota de voz sin transcribirla", () => {
  assert.equal(duracionOgg(notaDeVoz(30)), 30);
  assert.equal(duracionOgg(notaDeVoz(185.5)), 185.5);
});

test("si no es un ogg válido, no hay duración", () => {
  assert.equal(duracionOgg(Buffer.from("ID3 esto es un mp3")), null);
  assert.equal(duracionOgg(Buffer.from("OggS")), null, "página cortada");
  const corrupto = notaDeVoz(1);
  corrupto.writeBigUInt64LE(0xffffffffffffffffn, corrupto.length - 21);
  assert.equal(duracionOgg(corrupto), null, "posición -1 = sin dato");
});

// ── Transcripción con Groq ──

function fetchFalso(respuesta, status = 200) {
  const pedidos = [];
  const fetch = async (url, opciones) => {
    pedidos.push({ url, opciones });
    return { ok: status < 400, status, json: async () => respuesta };
  };
  return { fetch, pedidos };
}

const audio = { buffer: notaDeVoz(5), mediaType: "audio/ogg" };

test("transcribe con Whisper turbo de Groq, en español", async () => {
  const { fetch, pedidos } = fetchFalso({ text: "  Hola, ¿tienen camionetas?  ", duration: 4.8 });
  const r = await transcribirConGroq(audio, { apiKey: "gsk_prueba", fetch });
  assert.deepEqual(r, { texto: "Hola, ¿tienen camionetas?", segundos: 4.8 });

  const { url, opciones } = pedidos[0];
  assert.equal(url, "https://api.groq.com/openai/v1/audio/transcriptions");
  assert.equal(opciones.method, "POST");
  assert.equal(opciones.headers.Authorization, "Bearer gsk_prueba");
  assert.equal(opciones.body.get("model"), MODELO_GROQ);
  assert.equal(MODELO_GROQ, "whisper-large-v3-turbo");
  assert.equal(opciones.body.get("language"), "es");
  assert.equal(opciones.body.get("file").name, "audio.ogg");
  assert.ok(opciones.signal, "tiene timeout");
});

test("si Groq no informa la duración, la toma del último segmento", async () => {
  const { fetch } = fetchFalso({ text: "Hola", segments: [{ end: 1.2 }, { end: 3.5 }] });
  const r = await transcribirConGroq(audio, { apiKey: "k", fetch });
  assert.equal(r.segundos, 3.5);
});

test("un error de Groq lanza sin mostrar la clave", async () => {
  const { fetch } = fetchFalso({ error: { message: "rate limit" } }, 429);
  await assert.rejects(transcribirConGroq(audio, { apiKey: "gsk_secreta", fetch }), (err) => {
    assert.match(err.message, /429/);
    assert.doesNotMatch(err.message, /gsk_secreta/);
    return true;
  });
});

test("sin GROQ_API_KEY no llama a nadie", async () => {
  const { fetch, pedidos } = fetchFalso({ text: "x" });
  await assert.rejects(transcribirConGroq(audio, { apiKey: "", fetch }), /GROQ_API_KEY/);
  assert.equal(pedidos.length, 0);
});
