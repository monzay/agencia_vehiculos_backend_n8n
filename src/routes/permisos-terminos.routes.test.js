import { test, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";

// Publicar la política de privacidad es solo del admin: los consentimientos del bot apuntan
// a la versión vigente. Los rechazos ocurren antes de tocar la base.
process.env.JWT_SECRET ??= "s".repeat(40);
const { default: terminos } = await import("./terminos.routes.js");
const { firmarToken } = await import("../lib/auth.js");

const app = express();
app.use(express.json());
app.use("/api/privacidad", terminos);
const servidor = await new Promise((ok) => {
  const s = app.listen(0, () => ok(s));
});
after(() => servidor.close());
const base = `http://127.0.0.1:${servidor.address().port}`;
const publicar = (token) =>
  fetch(`${base}/api/privacidad`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ texto: "Texto de prueba" }),
  }).then((r) => r.status);

test("un asesor no puede publicar la política de privacidad", async () => {
  assert.equal(await publicar(firmarToken({ id: 2, rol: "asesor", nombre: "Asesor" })), 403);
});

test("sin sesión, tampoco", async () => {
  assert.equal(await publicar(), 401);
});
