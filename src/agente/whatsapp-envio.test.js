import { test } from "node:test";
import assert from "node:assert/strict";
import { crearEnvioWhatsapp } from "./whatsapp-envio.js";

// fetch falso: guarda la llamada y devuelve la respuesta que se le configure.
function fetchFalso(respuesta = { ok: true, json: async () => ({ messages: [{ id: "wamid.OUT1" }] }) }) {
  const llamadas = [];
  const fetch = async (url, opciones) => (llamadas.push({ url, opciones }), respuesta);
  return { fetch, llamadas };
}

const config = (fetch) => ({ fetch, token: "TOK", phoneNumberId: "123456", version: "v21.0" });

test("falta WA_TOKEN o WA_PHONE_NUMBER_ID: no llama a Meta y avisa", async () => {
  const { fetch, llamadas } = fetchFalso();
  const sinToken = crearEnvioWhatsapp({ fetch, token: "", phoneNumberId: "123" });
  await assert.rejects(sinToken.enviarTexto({ telefono: "549388", texto: "hola" }), /WA_TOKEN|WA_PHONE_NUMBER_ID/);
  const sinId = crearEnvioWhatsapp({ fetch, token: "TOK", phoneNumberId: "" });
  await assert.rejects(sinId.enviarTexto({ telefono: "549388", texto: "hola" }), /WA_TOKEN|WA_PHONE_NUMBER_ID/);
  assert.equal(llamadas.length, 0, "nunca llama a Meta sin configuración");
});

test("arma el cuerpo de un mensaje de texto de la Cloud API, con el teléfono del cliente", async () => {
  const { fetch, llamadas } = fetchFalso();
  const envio = crearEnvioWhatsapp(config(fetch));

  const r = await envio.enviarTexto({ telefono: "5493885550101", texto: "Hola, te atiende Juan" });

  assert.equal(llamadas[0].url, "https://graph.facebook.com/v21.0/123456/messages");
  assert.equal(llamadas[0].opciones.method, "POST");
  assert.match(llamadas[0].opciones.headers.authorization, /^Bearer TOK$/);
  assert.deepEqual(JSON.parse(llamadas[0].opciones.body), {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: "5493885550101",
    type: "text",
    text: { body: "Hola, te atiende Juan" },
  });
  assert.equal(r.wamid, "wamid.OUT1");
});

test("si Meta rechaza el envío, lanza con el estado", async () => {
  const { fetch } = fetchFalso({ ok: false, status: 400, text: async () => "mensaje fuera de la ventana" });
  const envio = crearEnvioWhatsapp(config(fetch));
  await assert.rejects(envio.enviarTexto({ telefono: "549388", texto: "hola" }), (err) => {
    assert.equal(err.status, 400);
    assert.match(err.message, /WhatsApp respondió 400/);
    return true;
  });
});
