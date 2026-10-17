import { test, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";

// Las rutas con datos de clientes son solo del admin. Estos rechazos ocurren
// antes de tocar la base.
process.env.JWT_SECRET ??= "s".repeat(40);
const { default: rutas } = await import("./entregas.routes.js");
const { firmarToken } = await import("../lib/auth.js");

const app = express();
app.use(express.json());
app.use("/api/entregas", rutas);
const servidor = await new Promise((ok) => {
  const s = app.listen(0, () => ok(s));
});
after(() => servidor.close());
const base = `http://127.0.0.1:${servidor.address().port}/api/entregas`;
const pedir = (ruta, token) => fetch(base + ruta, { headers: token ? { authorization: `Bearer ${token}` } : {} }).then((r) => r.status);
const asesor = firmarToken({ id: 2, rol: "asesor", nombre: "Asesor" });

test("sin sesión no se ven las entregas con su cliente ni se buscan clientes", async () => {
  assert.equal(await pedir("/gestion"), 401);
  assert.equal(await pedir("/clientes?q=juan"), 401);
});

test("un asesor tampoco: es información del admin", async () => {
  assert.equal(await pedir("/gestion", asesor), 403);
  assert.equal(await pedir("/clientes?q=juan", asesor), 403);
});
