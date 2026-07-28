import { test } from "node:test";
import assert from "node:assert/strict";
import { errorHandler } from "./error.js";

function fakeRes() {
  return {
    statusCode: 200,
    payload: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.payload = b; return this; },
  };
}

// Regresión de F6: un fallo inesperado (5xx) no debe filtrar el mensaje interno
// (que puede traer detalle de SQL/Prisma) y debe entregar un correlationId.
test("F6 — un 500 devuelve mensaje genérico + correlationId, sin filtrar internals", () => {
  const res = fakeRes();
  const orig = console.error;
  console.error = () => {}; // silenciar el log durante el test
  try {
    errorHandler(new Error("SELECT * FROM usuarios WHERE password_hash='...'"), {}, res, () => {});
  } finally {
    console.error = orig;
  }
  assert.equal(res.statusCode, 500);
  assert.ok(res.payload.correlationId, "debe incluir correlationId");
  assert.doesNotMatch(res.payload.error, /SELECT|password/, "no debe filtrar el detalle interno");
});

// Los errores esperados (4xx) sí muestran su mensaje: son validaciones para el usuario.
test("F6 — un 4xx conserva su mensaje y no lleva correlationId", () => {
  const res = fakeRes();
  const err = new Error("El DNI es obligatorio");
  err.status = 400;
  errorHandler(err, {}, res, () => {});
  assert.equal(res.statusCode, 400);
  assert.equal(res.payload.error, "El DNI es obligatorio");
  assert.equal(res.payload.correlationId, undefined);
});
