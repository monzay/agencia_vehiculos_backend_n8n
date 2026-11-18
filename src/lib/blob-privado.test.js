import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { subirImagenPrivada, firmarImagenes, exigirBlobSimulado } from "./blob-privado.js";

// Ningún test toca Vercel Blob: el SDK es un espía que anota cada llamada y, si se lo pide, revienta.
// Interfaz que fijan estos tests: las funciones reciben al final un objeto de opciones con
//   env     el entorno (por defecto process.env)
//   sdk     { put, issueSignedToken, presignUrl } (por defecto el de @vercel/blob)
//   carpeta donde el modo simulado escribe los archivos (por defecto tmp/blob-simulado)
//   urlBase la base de las URLs locales del modo simulado (por defecto http://localhost:<PORT o 4000>)
function sdkEspia() {
  const llamadas = [];
  const anotar = (nombre, resultado) => async (...args) => {
    llamadas.push({ nombre, args });
    return typeof resultado === "function" ? resultado(...args) : resultado;
  };
  return {
    llamadas,
    put: anotar("put", { url: "https://store.private.blob.vercel-storage.com/x" }),
    issueSignedToken: anotar("issueSignedToken", { validUntil: Date.now() + 3_600_000 }),
    presignUrl: anotar("presignUrl", { presignedUrl: "https://firmada.example/x?sig=1" }),
  };
}

const SIMULADO = { BLOB_SIMULADO: "1", NODE_ENV: "development" };
const PATHNAME = "consultas/7/usado/3f2c1a9e-0000-4000-8000-000000000001.jpg";
const JPG = Buffer.from("contenido-de-la-foto");

async function conCarpeta(t) {
  const carpeta = await mkdtemp(path.join(tmpdir(), "blob-simulado-"));
  t.after(() => rm(carpeta, { recursive: true, force: true }));
  return carpeta;
}

// ── ajustes-por-chats-reales: blob simulado en desarrollo ──

test("con BLOB_SIMULADO=1 fuera de producción, la foto se escribe en la carpeta local y no se llama a ninguna función de @vercel/blob", async (t) => {
  const carpeta = await conCarpeta(t);
  const sdk = sdkEspia();
  await subirImagenPrivada(JPG, "image/jpeg", PATHNAME, { env: SIMULADO, sdk, carpeta });
  assert.deepEqual(await readFile(path.join(carpeta, ...PATHNAME.split("/"))), JPG, "el archivo quedó en <carpeta>/<pathname>");
  assert.deepEqual(sdk.llamadas, [], "ni put, ni issueSignedToken, ni presignUrl");
});

test("en modo simulado no hace falta BLOB_DOCUMENTOS_TOKEN y firmarImagenes devuelve URLs locales del backend, sin tocar el SDK", async (t) => {
  const carpeta = await conCarpeta(t);
  const sdk = sdkEspia();
  const otro = "consultas/7/usado/3f2c1a9e-0000-4000-8000-000000000002.png";
  const urls = await firmarImagenes([PATHNAME, otro], { env: { ...SIMULADO, PORT: "4000" }, sdk, carpeta });
  assert.deepEqual(urls, [`http://localhost:4000/api/dev/blob-simulado/${PATHNAME}`, `http://localhost:4000/api/dev/blob-simulado/${otro}`]);
  assert.deepEqual(sdk.llamadas, []);
});

test("las URLs locales usan la base indicada (urlBase) y firmarImagenes con una lista vacía da []", async (t) => {
  const carpeta = await conCarpeta(t);
  const sdk = sdkEspia();
  const [url] = await firmarImagenes([PATHNAME], { env: SIMULADO, sdk, carpeta, urlBase: "http://127.0.0.1:4100" });
  assert.equal(url, `http://127.0.0.1:4100/api/dev/blob-simulado/${PATHNAME}`);
  assert.deepEqual(await firmarImagenes([], { env: SIMULADO, sdk, carpeta }), []);
});

test("en modo simulado no escribe fuera de la carpeta: un pathname con .. se rechaza y no deja nada", async (t) => {
  const carpeta = await conCarpeta(t);
  const sdk = sdkEspia();
  await assert.rejects(() => subirImagenPrivada(JPG, "image/jpeg", "consultas/7/usado/../../../../escapado.jpg", { env: SIMULADO, sdk, carpeta }));
  assert.deepEqual(await readdir(carpeta), []);
  assert.deepEqual(sdk.llamadas, []);
});

test("con NODE_ENV=production BLOB_SIMULADO se ignora: sube con put del SDK y no escribe ningún archivo local", async (t) => {
  const carpeta = await conCarpeta(t);
  const sdk = sdkEspia();
  const env = { NODE_ENV: "production", BLOB_SIMULADO: "1", BLOB_DOCUMENTOS_TOKEN: "vercel_blob_rw_prueba" };
  await subirImagenPrivada(JPG, "image/jpeg", PATHNAME, { env, sdk, carpeta });
  assert.equal(sdk.llamadas.length, 1);
  assert.equal(sdk.llamadas[0].nombre, "put");
  assert.equal(sdk.llamadas[0].args[0], PATHNAME, "put(pathname, buffer, opciones)");
  assert.deepEqual(sdk.llamadas[0].args[1], JPG);
  assert.equal(sdk.llamadas[0].args[2].access, "private");
  assert.equal(sdk.llamadas[0].args[2].token, "vercel_blob_rw_prueba");
  assert.equal(sdk.llamadas[0].args[2].contentType, "image/jpeg");
  assert.deepEqual(await readdir(carpeta), [], "nada en la carpeta local");
});

test("con NODE_ENV=production y BLOB_SIMULADO=1 pero sin token, falla (no cae al modo simulado) y no escribe nada", async (t) => {
  const carpeta = await conCarpeta(t);
  const sdk = sdkEspia();
  const env = { NODE_ENV: "production", BLOB_SIMULADO: "1" };
  await assert.rejects(() => subirImagenPrivada(JPG, "image/jpeg", PATHNAME, { env, sdk, carpeta }));
  assert.deepEqual(sdk.llamadas, []);
  assert.deepEqual(await readdir(carpeta), []);
});

test("con NODE_ENV=production firmarImagenes ignora BLOB_SIMULADO: firma con el SDK y devuelve la URL firmada, no una local", async (t) => {
  const carpeta = await conCarpeta(t);
  const sdk = sdkEspia();
  const env = { NODE_ENV: "production", BLOB_SIMULADO: "1", BLOB_DOCUMENTOS_TOKEN: "vercel_blob_rw_prueba" };
  const [url] = await firmarImagenes([PATHNAME], { env, sdk, carpeta });
  assert.equal(url, "https://firmada.example/x?sig=1");
  assert.ok(sdk.llamadas.some((l) => l.nombre === "presignUrl"));
});

test("sin BLOB_SIMULADO y sin token no escribe en ninguna carpeta: falla sin tocar nada", async (t) => {
  const carpeta = await conCarpeta(t);
  const sdk = sdkEspia();
  await assert.rejects(() => subirImagenPrivada(JPG, "image/jpeg", PATHNAME, { env: { NODE_ENV: "development" }, sdk, carpeta }));
  assert.deepEqual(sdk.llamadas, []);
  assert.deepEqual(await readdir(carpeta), []);
});

test("exigirBlobSimulado falla cerrado: lanza si falta BLOB_SIMULADO=1 o si hay BLOB_DOCUMENTOS_TOKEN", () => {
  assert.doesNotThrow(() => exigirBlobSimulado({ BLOB_SIMULADO: "1" }));
  assert.doesNotThrow(() => exigirBlobSimulado({ BLOB_SIMULADO: "1", BLOB_DOCUMENTOS_TOKEN: "" }));
  assert.doesNotThrow(() => exigirBlobSimulado({ BLOB_SIMULADO: "1", BLOB_DOCUMENTOS_TOKEN: "   " }));
  assert.throws(() => exigirBlobSimulado({}), /BLOB_SIMULADO/);
  assert.throws(() => exigirBlobSimulado({ BLOB_SIMULADO: "0" }), /BLOB_SIMULADO/);
  assert.throws(() => exigirBlobSimulado({ BLOB_SIMULADO: "" }), /BLOB_SIMULADO/);
  assert.throws(() => exigirBlobSimulado({ BLOB_SIMULADO: "1", BLOB_DOCUMENTOS_TOKEN: "vercel_blob_rw_real" }), /BLOB_DOCUMENTOS_TOKEN/);
  assert.throws(() => exigirBlobSimulado({ BLOB_DOCUMENTOS_TOKEN: "vercel_blob_rw_real" }));
});

test("exigirBlobSimulado también lanza con NODE_ENV=production, aunque BLOB_SIMULADO sea 1 y no haya token", () => {
  assert.throws(() => exigirBlobSimulado({ BLOB_SIMULADO: "1", NODE_ENV: "production" }), /producci/i);
  assert.doesNotThrow(() => exigirBlobSimulado({ BLOB_SIMULADO: "1", NODE_ENV: "development" }));
  assert.doesNotThrow(() => exigirBlobSimulado({ BLOB_SIMULADO: "1" }));
});
