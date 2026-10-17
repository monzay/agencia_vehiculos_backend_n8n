import { test, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { crearRouterAvisosCuotas } from "./avisos-cuotas.routes.js";

const SECRETO = "s".repeat(40);

async function levantar({ envios = [{ avisoId: 1, cuerpo: { to: "543885550101" } }], registrado = true } = {}) {
  const resultados = [];
  const app = express();
  app.use(
    "/api/agente/cuotas",
    crearRouterAvisosCuotas({
      secretoAgente: () => SECRETO,
      preparar: async () => envios,
      registrar: async (r) => (resultados.push(r), registrado),
    })
  );
  app.use((err, req, res, next) => res.status(err.status ?? 500).json({ ok: false, error: err.message }));
  const servidor = await new Promise((ok) => {
    const s = app.listen(0, () => ok(s));
  });
  after(() => servidor.close());
  const base = `http://127.0.0.1:${servidor.address().port}/api/agente/cuotas`;
  const post = (ruta, cuerpo, { secreto = SECRETO } = {}) =>
    fetch(`${base}${ruta}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(secreto && { "x-agente-secreto": secreto }) },
      body: JSON.stringify(cuerpo ?? {}),
    }).then(async (r) => ({ status: r.status, json: await r.json() }));
  return { post, resultados };
}

test("sin la clave de n8n no entrega la lista de avisos (tiene teléfonos)", async () => {
  const { post } = await levantar();
  assert.equal((await post("/avisos-del-dia", {}, { secreto: null })).status, 401);
});

test("n8n pide los avisos del día y recibe los mensajes listos para mandar", async () => {
  const { post } = await levantar();
  const r = await post("/avisos-del-dia");
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { ok: true, envios: [{ avisoId: 1, cuerpo: { to: "543885550101" } }] });
});

test("n8n informa el resultado de cada envío", async () => {
  const { post, resultados } = await levantar();
  const r = await post("/avisos/7/resultado", { ok: true, wamid: "wamid.ABC" });
  assert.equal(r.status, 200);
  assert.deepEqual(resultados, [{ avisoId: 7, ok: true, wamid: "wamid.ABC", error: null }]);
});

test("un resultado mal armado se rechaza", async () => {
  const { post, resultados } = await levantar();
  assert.equal((await post("/avisos/abc/resultado", { ok: true })).status, 400);
  assert.equal((await post("/avisos/7/resultado", { ok: "sí" })).status, 400);
  assert.equal(resultados.length, 0);
});

test("un aviso que ya tenía resultado devuelve registrado: false", async () => {
  const { post } = await levantar({ registrado: false });
  assert.deepEqual((await post("/avisos/7/resultado", { ok: false, error: "131026" })).json, { ok: true, registrado: false });
});
