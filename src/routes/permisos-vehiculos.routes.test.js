import { test, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";

// Eliminar un vehículo es solo del admin. Los rechazos ocurren antes de tocar la base.
process.env.JWT_SECRET ??= "s".repeat(40);
const { default: vehiculos } = await import("./vehiculos.routes.js");
const { firmarToken } = await import("../lib/auth.js");

const app = express();
app.use(express.json());
app.use("/api/vehiculos", vehiculos);
const servidor = await new Promise((ok) => {
  const s = app.listen(0, () => ok(s));
});
after(() => servidor.close());
const base = `http://127.0.0.1:${servidor.address().port}`;
const eliminar = (token) =>
  fetch(`${base}/api/vehiculos/1`, {
    method: "DELETE",
    headers: token ? { authorization: `Bearer ${token}` } : {},
  }).then((r) => r.status);

test("un asesor no puede eliminar un vehículo", async () => {
  assert.equal(await eliminar(firmarToken({ id: 2, rol: "asesor", nombre: "Asesor" })), 403);
});

test("sin sesión, tampoco puede eliminar un vehículo", async () => {
  assert.equal(await eliminar(), 401);
});
