import { test } from "node:test";
import assert from "node:assert/strict";
import { juntarRafaga, hayMensajesEsperando } from "./rafagas.js";

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

test("un mensaje con foto o audio no espera: sale ya, con lo que estaba esperando", async () => {
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
