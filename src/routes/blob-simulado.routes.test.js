// ajustes-por-chats-reales, tarea 7: la ruta que sirve las fotos del Blob simulado existe solo fuera de producción,
// nunca sale de su carpeta y no necesita ninguna API real.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import express from "express";
import { crearRutaBlobSimulado } from "./blob-simulado.routes.js";

function conCarpeta(t) {
  const carpeta = mkdtempSync(path.join(tmpdir(), "blob-simulado-"));
  t.after(() => rmSync(carpeta, { recursive: true, force: true }));
  mkdirSync(path.join(carpeta, "consultas", "1", "usado"), { recursive: true });
  writeFileSync(path.join(carpeta, "consultas", "1", "usado", "a.jpg"), Buffer.from([0xff, 0xd8, 0xff, 0x00]));
  writeFileSync(path.join(path.dirname(carpeta), `secreto-${path.basename(carpeta)}.txt`), "no");
  t.after(() => rmSync(path.join(path.dirname(carpeta), `secreto-${path.basename(carpeta)}.txt`), { force: true }));
  return carpeta;
}

async function servir(t, router) {
  const app = express();
  app.use("/api/dev/blob-simulado", router);
  const servidor = await new Promise((listo) => {
    const s = app.listen(0, "127.0.0.1", () => listo(s));
  });
  t.after(() => servidor.close());
  return `http://127.0.0.1:${servidor.address().port}/api/dev/blob-simulado`;
}

test("en producción la ruta no existe: crearRutaBlobSimulado devuelve null aunque BLOB_SIMULADO sea 1", (t) => {
  const carpeta = conCarpeta(t);
  assert.equal(crearRutaBlobSimulado({ carpeta, env: { NODE_ENV: "production", BLOB_SIMULADO: "1" } }), null);
});

test("sin BLOB_SIMULADO=1 la ruta tampoco existe", (t) => {
  const carpeta = conCarpeta(t);
  assert.equal(crearRutaBlobSimulado({ carpeta, env: { NODE_ENV: "development" } }), null);
});

test("fuera de producción y con BLOB_SIMULADO=1 sirve la foto guardada", async (t) => {
  const carpeta = conCarpeta(t);
  const base = await servir(t, crearRutaBlobSimulado({ carpeta, env: { NODE_ENV: "development", BLOB_SIMULADO: "1" } }));
  const r = await fetch(`${base}/consultas/1/usado/a.jpg`);
  assert.equal(r.status, 200);
  assert.deepEqual([...new Uint8Array(await r.arrayBuffer())].slice(0, 3), [0xff, 0xd8, 0xff]);
});

test("no sale de su carpeta: un pathname con .. (también codificado) no se sirve", async (t) => {
  const carpeta = conCarpeta(t);
  const base = await servir(t, crearRutaBlobSimulado({ carpeta, env: { NODE_ENV: "development", BLOB_SIMULADO: "1" } }));
  for (const intento of [`../secreto-${path.basename(carpeta)}.txt`, `..%2Fsecreto-${path.basename(carpeta)}.txt`, `consultas/..%2F..%2F..%2Fsecreto-${path.basename(carpeta)}.txt`]) {
    const r = await fetch(`${base}/${intento}`);
    assert.ok(r.status === 400 || r.status === 404, `${intento} → ${r.status}`);
    assert.notEqual(await r.text(), "no");
  }
});

test("un archivo que no existe da 404", async (t) => {
  const carpeta = conCarpeta(t);
  const base = await servir(t, crearRutaBlobSimulado({ carpeta, env: { NODE_ENV: "development", BLOB_SIMULADO: "1" } }));
  const r = await fetch(`${base}/consultas/1/usado/no-existe.jpg`);
  assert.equal(r.status, 404);
});
