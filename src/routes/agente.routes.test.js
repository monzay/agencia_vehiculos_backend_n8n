import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import express from "express";
import { z } from "zod";
import { crearRouterAgente } from "./agente.routes.js";
import { payloadMeta } from "../agente/meta-de-prueba.js";

const SECRETO_AGENTE = "s".repeat(40);
const SECRETO_META = "secreto-de-la-app";
const firmar = (cuerpo) => `sha256=${createHmac("sha256", SECRETO_META).update(cuerpo).digest("hex")}`;

// App mínima con la ruta real y un orquestador simulado que guarda lo que recibe.
async function levantar({ secretoAgente = SECRETO_AGENTE, respuesta = { texto: "¡Hola!", fotos: [], conIA: true }, atender } = {}) {
  const recibidos = [];
  const app = express();
  app.use(
    "/api/agente",
    crearRouterAgente({
      atender: atender ?? (async (entrada) => (recibidos.push(entrada), respuesta)),
      secretoAgente: () => secretoAgente,
      secretoMeta: () => SECRETO_META,
    })
  );
  app.use((err, req, res, next) => res.status(err.status ?? 500).json({ ok: false, error: err.message }));
  const servidor = await new Promise((ok) => {
    const s = app.listen(0, () => ok(s));
  });
  after(() => servidor.close());
  const url = `http://127.0.0.1:${servidor.address().port}/api/agente/mensaje`;
  const enviar = (cuerpo, { secreto = SECRETO_AGENTE } = {}) =>
    fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...(secreto && { "x-agente-secreto": secreto }) },
      body: JSON.stringify(cuerpo),
    }).then(async (r) => ({ status: r.status, json: await r.json() }));
  return { enviar, recibidos };
}

// Lo que manda n8n: el cuerpo crudo de Meta, su firma y, si hay, el archivo.
const pedido = (mensaje, extra = {}) => {
  const cuerpo = JSON.stringify(payloadMeta(mensaje));
  return { cuerpo, firma: firmar(cuerpo), ...extra };
};
const texto = (t) => pedido({ type: "text", text: { body: t } });

// ── Quién puede llamar ──

test("sin la clave de n8n, o con otra, 401 y no se atiende nada", async () => {
  const { enviar, recibidos } = await levantar();
  assert.equal((await enviar(texto("Hola"), { secreto: null })).status, 401);
  assert.equal((await enviar(texto("Hola"), { secreto: "x".repeat(40) })).status, 401);
  assert.equal(recibidos.length, 0);
});

test("si el backend no tiene AGENTE_SECRETO (o es corto), no atiende: 503", async () => {
  const { enviar } = await levantar({ secretoAgente: "corta" });
  assert.equal((await enviar(texto("Hola"), { secreto: "corta" })).status, 503);
});

test("con la firma de Meta inválida, 401 aunque la clave de n8n esté bien", async () => {
  const { enviar, recibidos } = await levantar();
  const p = texto("Hola");
  assert.equal((await enviar({ ...p, cuerpo: p.cuerpo.replace("Hola", "Chau") })).status, 401);
  assert.equal(recibidos.length, 0);
});

test("pedido sin los campos o con un cuerpo que no es JSON: 400", async () => {
  const { enviar } = await levantar();
  assert.equal((await enviar({})).status, 400);
  assert.equal((await enviar({ cuerpo: "no json", firma: firmar("no json") })).status, 400);
});

// ── Mensajes ──

test("un aviso de estado (entregado, leído) no se responde", async () => {
  const { enviar, recibidos } = await levantar();
  const cuerpo = JSON.stringify({ object: "whatsapp_business_account", entry: [{ changes: [{ value: { statuses: [{}] } }] }] });
  const r = await enviar({ cuerpo, firma: firmar(cuerpo) });
  assert.deepEqual(r.json, { ok: true, responder: false });
  assert.equal(recibidos.length, 0);
});

test("texto: lo atiende el agente y devuelve a quién y los mensajes ya armados para WhatsApp", async () => {
  const envios = [{ type: "text", text: { body: "¡Hola Ana!" } }];
  const { enviar, recibidos } = await levantar({ respuesta: { texto: "¡Hola Ana!", fotos: [], envios, conIA: true } });
  const r = await enviar(texto("Hola"));
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { ok: true, responder: true, para: "5493885550101", texto: "¡Hola Ana!", envios });
  assert.deepEqual(recibidos[0], { telefono: "5493885550101", nombre: "Ana", wamid: "wamid.ABC123", texto: "Hola", imagenes: [], audio: null });
});

test("nunca toma `ahora` ni `topeUsd` de lo que llega", async () => {
  const { enviar, recibidos } = await levantar();
  await enviar({ ...texto("Hola"), ahora: "2020-01-01", topeUsd: 99999 });
  assert.equal("ahora" in recibidos[0], false);
  assert.equal("topeUsd" in recibidos[0], false);
});

test("foto: pasa el archivo que bajó n8n, si es el del mensaje firmado", async () => {
  const { enviar, recibidos } = await levantar();
  const foto = { type: "image", image: { id: "MEDIA1", mime_type: "image/jpeg", caption: "¿Tienen uno así?" } };
  assert.equal((await enviar(pedido(foto, { media: { id: "OTRO", data: "aGVsbG8=" } }))).status, 400, "archivo de otro mensaje");
  assert.equal((await enviar(pedido(foto))).status, 400, "falta el archivo");
  await enviar(pedido(foto, { media: { id: "MEDIA1", data: "aGVsbG8=" } }));
  assert.deepEqual(recibidos[0].imagenes, [{ media_type: "image/jpeg", data: "aGVsbG8=" }]);
  assert.equal(recibidos[0].texto, "¿Tienen uno así?");
});

test("nota de voz: pasa el audio", async () => {
  const { enviar, recibidos } = await levantar();
  const voz = { type: "audio", audio: { id: "MEDIA2", mime_type: "audio/ogg; codecs=opus", voice: true } };
  await enviar(pedido(voz, { media: { id: "MEDIA2", data: "aGVsbG8=" } }));
  assert.deepEqual(recibidos[0].audio, { media_type: "audio/ogg", data: "aGVsbG8=" });
});

test("un mensaje que se juntó con otro de la misma ráfaga no responde (responde el último)", async () => {
  const { enviar } = await levantar({ respuesta: { juntado: true, texto: null, fotos: [], envios: [], conIA: false } });
  assert.deepEqual((await enviar(texto("Hola"))).json, { ok: true, responder: false });
});

test("sin nada para mandar no se responde", async () => {
  const { enviar } = await levantar({ respuesta: { texto: null, fotos: [], envios: [], conIA: false } });
  assert.deepEqual((await enviar(texto("Hola"))).json, { ok: true, responder: false });
});

test("un reintento ya procesado no se responde", async () => {
  const { enviar } = await levantar({ respuesta: { duplicado: true, texto: null, fotos: [], conIA: false } });
  assert.deepEqual((await enviar(texto("Hola"))).json, { ok: true, responder: false });
});

test("si el orquestador rechaza la entrada (p. ej. un formato de audio que no se lee), 400", async () => {
  const { enviar } = await levantar({ atender: async () => z.object({ x: z.string() }).parse({}) });
  assert.equal((await enviar(texto("Hola"))).status, 400);
});

