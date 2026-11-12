import { test, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";

// La lista y el detalle de clientes son solo del admin. Los rechazos ocurren antes de tocar la base.
process.env.JWT_SECRET ??= "s".repeat(40);
const { default: leads } = await import("./leads.routes.js");
const { firmarToken } = await import("../lib/auth.js");

const app = express();
app.use(express.json());
app.use("/api/leads", leads);
const servidor = await new Promise((ok) => {
  const s = app.listen(0, () => ok(s));
});
after(() => servidor.close());
const base = `http://127.0.0.1:${servidor.address().port}`;
const pedir = (ruta, token) =>
  fetch(`${base}/api/leads${ruta}`, { headers: token ? { authorization: `Bearer ${token}` } : {} }).then((r) => r.status);

test("un asesor no puede ver la lista ni el detalle de clientes", async () => {
  const token = firmarToken({ id: 2, rol: "asesor", nombre: "Asesor" });
  assert.equal(await pedir("", token), 403);
  assert.equal(await pedir("/15", token), 403);
});

test("sin sesión, tampoco puede ver clientes", async () => {
  assert.equal(await pedir(""), 401);
  assert.equal(await pedir("/15"), 401);
});
