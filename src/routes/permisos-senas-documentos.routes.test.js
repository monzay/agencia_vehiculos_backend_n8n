import { test, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";

// Señas y Documentos (trámites: DNI, CUIT, CBU, contratos, montos) son solo
// del admin, también para leer. Los rechazos ocurren antes de tocar la base.
process.env.JWT_SECRET ??= "s".repeat(40);
const { default: senas } = await import("./senas.routes.js");
const { default: ingresos } = await import("./ingresos.routes.js");
const { firmarToken } = await import("../lib/auth.js");

const app = express();
app.use(express.json());
app.use("/api/senas", senas);
app.use("/api/ingresos", ingresos);
const servidor = await new Promise((ok) => {
  const s = app.listen(0, () => ok(s));
});
after(() => servidor.close());
const base = `http://127.0.0.1:${servidor.address().port}`;
const pedir = (metodo, ruta, token) =>
  fetch(base + ruta, { method: metodo, headers: { "content-type": "application/json", ...(token && { authorization: `Bearer ${token}` }) }, body: metodo === "GET" ? undefined : "{}" }).then((r) => r.status);
const asesor = firmarToken({ id: 2, rol: "asesor", nombre: "Asesor" });

const LECTURAS = [
  ["GET", "/api/senas"],
  ["GET", "/api/senas/1"],
  ["GET", "/api/ingresos"],
  ["GET", "/api/ingresos/1"],
  ["GET", "/api/ingresos/catalogo"],
  ["GET", "/api/ingresos/personas?q=juan"],
  ["GET", "/api/ingresos/1/documentos"],
  ["POST", "/api/ingresos/1/documentos/firmar"],
  ["GET", "/api/ingresos/1/contrato"],
  ["GET", "/api/ingresos/1/impresos"],
];

test("un asesor no puede ver señas ni documentos (ni leyendo la API directo)", async () => {
  for (const [metodo, ruta] of LECTURAS) {
    assert.equal(await pedir(metodo, ruta, asesor), 403, `${metodo} ${ruta}`);
  }
});

test("un asesor tampoco puede cambiar nada", async () => {
  assert.equal(await pedir("POST", "/api/senas", asesor), 403);
  assert.equal(await pedir("POST", "/api/ingresos", asesor), 403);
});

test("sin sesión, nada", async () => {
  assert.equal(await pedir("GET", "/api/senas"), 401);
  assert.equal(await pedir("GET", "/api/ingresos"), 401);
});
