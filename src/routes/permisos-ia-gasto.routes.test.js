import { test, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";

// Límites de costos (gasto de IA y mensajes de WhatsApp del mes) es solo del
// admin, también leyendo la API directo. Los rechazos ocurren antes de tocar la base.
process.env.JWT_SECRET ??= "s".repeat(40);
const { default: ia } = await import("./ia.routes.js");
const { firmarToken } = await import("../lib/auth.js");

const app = express();
app.use(express.json());
app.use("/api/ia", ia);
const servidor = await new Promise((ok) => {
  const s = app.listen(0, () => ok(s));
});
after(() => servidor.close());
const base = `http://127.0.0.1:${servidor.address().port}`;
const pedir = (token) => fetch(`${base}/api/ia/gasto`, { headers: token ? { authorization: `Bearer ${token}` } : {} }).then((r) => r.status);

test("un asesor no puede ver los límites de costos", async () => {
  assert.equal(await pedir(firmarToken({ id: 2, rol: "asesor", nombre: "Asesor" })), 403);
});

test("sin sesión, tampoco", async () => {
  assert.equal(await pedir(), 401);
});
