import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { firmaValida, mensajeDeMeta } from "./whatsapp.js";
import { payloadMeta } from "./meta-de-prueba.js";

const SECRETO = "secreto-de-la-app";
const firmar = (cuerpo, secreto = SECRETO) => `sha256=${createHmac("sha256", secreto).update(cuerpo).digest("hex")}`;

// ── Firma de Meta (X-Hub-Signature-256) ──

test("acepta el cuerpo firmado con el secreto de la app", () => {
  const cuerpo = JSON.stringify(payloadMeta({ type: "text", text: { body: "Hola" } }));
  assert.equal(firmaValida(cuerpo, firmar(cuerpo), SECRETO), true);
});

test("rechaza un cuerpo alterado, otra clave, firma vacía o mal formada", () => {
  const cuerpo = JSON.stringify(payloadMeta({ type: "text", text: { body: "Hola" } }));
  assert.equal(firmaValida(cuerpo.replace("Hola", "Chau"), firmar(cuerpo), SECRETO), false);
  assert.equal(firmaValida(cuerpo, firmar(cuerpo, "otra"), SECRETO), false);
  assert.equal(firmaValida(cuerpo, "", SECRETO), false);
  assert.equal(firmaValida(cuerpo, "sha256=zz", SECRETO), false);
  assert.equal(firmaValida(cuerpo, undefined, SECRETO), false);
});

test("sin secreto configurado, nada es válido", () => {
  const cuerpo = "{}";
  assert.equal(firmaValida(cuerpo, firmar(cuerpo, ""), ""), false);
});

// ── Lectura del mensaje ──

test("mensaje de texto", () => {
  assert.deepEqual(mensajeDeMeta(payloadMeta({ type: "text", text: { body: "¿Tienen camionetas?" } })), {
    telefono: "5493885550101",
    nombre: "Ana",
    wamid: "wamid.ABC123",
    texto: "¿Tienen camionetas?",
    media: null,
  });
});

test("foto con epígrafe: el epígrafe es el texto y el tipo va sin parámetros", () => {
  const m = mensajeDeMeta(payloadMeta({ type: "image", image: { id: "MEDIA1", mime_type: "image/jpeg", caption: "¿Tienen uno así?" } }));
  assert.equal(m.texto, "¿Tienen uno así?");
  assert.deepEqual(m.media, { id: "MEDIA1", tipo: "imagen", mediaType: "image/jpeg" });
});

test("nota de voz", () => {
  const m = mensajeDeMeta(payloadMeta({ type: "audio", audio: { id: "MEDIA2", mime_type: "audio/ogg; codecs=opus", voice: true } }));
  assert.equal(m.texto, null);
  assert.deepEqual(m.media, { id: "MEDIA2", tipo: "audio", mediaType: "audio/ogg" });
});

test("otros tipos (ubicación, sticker, documento) llegan como aviso de texto", () => {
  const m = mensajeDeMeta(payloadMeta({ type: "sticker", sticker: { id: "X" } }));
  assert.equal(m.texto, "[sticker]");
  assert.equal(m.media, null);
});

test("las respuestas a botones se leen como texto", () => {
  const m = mensajeDeMeta(payloadMeta({ type: "button", button: { text: "Quiero info" } }));
  assert.equal(m.texto, "Quiero info");
  const i = mensajeDeMeta(payloadMeta({ type: "interactive", interactive: { type: "button_reply", button_reply: { id: "1", title: "Ver autos" } } }));
  assert.equal(i.texto, "Ver autos");
});

test("avisos de estado (entregado, leído) y payloads raros no son mensajes", () => {
  const estado = payloadMeta({});
  estado.entry[0].changes[0].value = { statuses: [{ status: "read" }] };
  assert.equal(mensajeDeMeta(estado), null);
  assert.equal(mensajeDeMeta({}), null);
  assert.equal(mensajeDeMeta(null), null);
  assert.equal(mensajeDeMeta({ object: "page", entry: [] }), null);
});

// ── Respuesta partida en mensajes cortos, como escribe una persona ──
