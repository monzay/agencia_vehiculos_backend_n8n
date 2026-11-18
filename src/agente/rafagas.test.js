import { test } from "node:test";
import assert from "node:assert/strict";
import { juntarRafaga, hayMensajesEsperando, combinar } from "./rafagas.js";

const esperar = (ms) => new Promise((listo) => setTimeout(listo, ms));
const mensaje = (texto, wamid, extra = {}) => ({ texto, wamid, imagenes: [], audio: null, ...extra });

test("un mensaje solo sigue como está (sin esperar si la espera es 0)", async () => {
  const lote = await juntarRafaga("5491100000001", mensaje("hola", "w1"), 0);
  assert.equal(lote.texto, "hola");
  assert.deepEqual(lote.partes, [{ texto: "hola", wamid: "w1" }]);
});

test("mensajes seguidos del mismo número: los responde el último, todos juntos", async () => {
  const [primero, segundo, tercero] = await Promise.all([
    juntarRafaga("5491100000002", mensaje("Hola!", "w1"), 40),
    esperar(5).then(() => juntarRafaga("5491100000002", mensaje("vi la Amarok", "w2"), 40)),
    esperar(10).then(() => juntarRafaga("5491100000002", mensaje("sigue disponible?", "w3"), 40)),
  ]);
  assert.equal(primero, null, "el primero no responde: lo junta el último");
  assert.equal(segundo, null);
  assert.equal(tercero.texto, "Hola!\nvi la Amarok\nsigue disponible?");
  assert.deepEqual(tercero.partes.map((p) => p.wamid), ["w1", "w2", "w3"]);
  assert.equal(tercero.wamid, "w3");
});

test("un mensaje con audio no espera: sale ya, con lo que estaba esperando", async () => {
  const audio = { media_type: "audio/ogg", data: "AAAA" };
  const [texto, conAudio] = await Promise.all([
    juntarRafaga("5491100000003", mensaje("escuchá esto", "w1"), 200),
    esperar(5).then(() => juntarRafaga("5491100000003", mensaje(null, "w2", { audio }), 200)),
  ]);
  assert.equal(texto, null);
  assert.equal(conAudio.texto, "escuchá esto");
  assert.deepEqual(conAudio.audio, audio);
  assert.deepEqual(conAudio.partes.map((p) => p.wamid), ["w1", "w2"]);
});

test("números distintos no se mezclan", async () => {
  const [a, b] = await Promise.all([
    juntarRafaga("5491100000004", mensaje("soy A", "wa"), 20),
    juntarRafaga("5491100000005", mensaje("soy B", "wb"), 20),
  ]);
  assert.equal(a.texto, "soy A");
  assert.equal(b.texto, "soy B");
});

test("después de responder, el próximo mensaje arranca una ráfaga nueva", async () => {
  await juntarRafaga("5491100000006", mensaje("hola", "w1"), 10);
  const lote = await juntarRafaga("5491100000006", mensaje("otra cosa", "w2"), 10);
  assert.equal(lote.texto, "otra cosa");
  assert.equal(lote.partes.length, 1);
});

test("el mismo mensaje dos veces dentro de la ráfaga (reintento) se toma una sola vez", async () => {
  const [primero, repetido] = await Promise.all([
    juntarRafaga("5491100000007", mensaje("hola", "w1"), 30),
    esperar(5).then(() => juntarRafaga("5491100000007", mensaje("hola", "w1"), 30)),
  ]);
  assert.equal(repetido, null, "el repetido no hace nada");
  assert.deepEqual(primero.partes, [{ texto: "hola", wamid: "w1" }]);
});

test("hayMensajesEsperando es true mientras el mensaje espera en la ráfaga y false después", async () => {
  const tel = "5491100000008";
  assert.equal(hayMensajesEsperando(tel), false);
  const lote = juntarRafaga(tel, mensaje("hola", "w1"), 30);
  assert.equal(hayMensajesEsperando(tel), true);
  await lote;
  assert.equal(hayMensajesEsperando(tel), false);
});

// ── ajustes-por-chats-reales: las fotos esperan y se juntan ──

const FOTO_A = { media_type: "image/jpeg", data: "QUFB" };
const FOTO_B = { media_type: "image/png", data: "QkJC" };
const FOTO_C = { media_type: "image/webp", data: "Q0ND" };

test("un mensaje con foto espera como un texto: no sale enseguida y hay que esperar el tiempo de la ráfaga", async () => {
  const tel = "5491100000009";
  const inicio = Date.now();
  const lote = juntarRafaga(tel, mensaje(null, "w1", { imagenes: [FOTO_A] }), 60);
  assert.equal(hayMensajesEsperando(tel), true, "la foto queda esperando en la ráfaga");
  const resultado = await lote;
  assert.ok(Date.now() - inicio >= 50, "salió recién cuando terminó la espera");
  assert.deepEqual(resultado.imagenes, [FOTO_A]);
  assert.equal(hayMensajesEsperando(tel), false);
});

test("dos fotos seguidas dentro de la espera: responde el último, una sola vez, con las dos fotos en orden", async () => {
  const [primera, segunda] = await Promise.all([
    juntarRafaga("5491100000010", mensaje(null, "w1", { imagenes: [FOTO_A] }), 60),
    esperar(10).then(() => juntarRafaga("5491100000010", mensaje(null, "w2", { imagenes: [FOTO_B] }), 60)),
  ]);
  assert.equal(primera, null, "la primera no responde: la junta la última");
  assert.deepEqual(segunda.imagenes, [FOTO_A, FOTO_B]);
  assert.deepEqual(segunda.partes.map((p) => p.wamid), ["w1", "w2"]);
  assert.equal(segunda.wamid, "w2");
});

test("un texto y una foto seguidos se responden juntos; después un audio sale ya con todo lo que esperaba", async () => {
  const audio = { media_type: "audio/ogg", data: "AAAA" };
  const [texto, foto, conAudio] = await Promise.all([
    juntarRafaga("5491100000011", mensaje("este es mi Fox", "w1"), 200),
    esperar(5).then(() => juntarRafaga("5491100000011", mensaje(null, "w2", { imagenes: [FOTO_A] }), 200)),
    esperar(10).then(() => juntarRafaga("5491100000011", mensaje(null, "w3", { audio }), 200)),
  ]);
  assert.equal(texto, null);
  assert.equal(foto, null);
  assert.equal(conAudio.texto, "este es mi Fox");
  assert.deepEqual(conAudio.imagenes, [FOTO_A], "la foto que esperaba viaja con el lote");
  assert.deepEqual(conAudio.audio, audio);
});

test("combinar junta en imagenes las fotos de todos los mensajes del lote, en orden", () => {
  const lote = combinar([
    mensaje("mirá", "w1", { imagenes: [FOTO_A, FOTO_B] }),
    mensaje(null, "w2", { imagenes: [] }),
    mensaje("y esta", "w3", { imagenes: [FOTO_C] }),
  ]);
  assert.deepEqual(lote.imagenes, [FOTO_A, FOTO_B, FOTO_C]);
  assert.equal(lote.texto, "mirá\ny esta");
  assert.deepEqual(lote.partes.map((p) => p.wamid), ["w1", "w2", "w3"]);
});

test("combinar con un solo mensaje sin fotos deja imagenes vacío", () => {
  assert.deepEqual(combinar([mensaje("hola", "w1")]).imagenes, []);
});
