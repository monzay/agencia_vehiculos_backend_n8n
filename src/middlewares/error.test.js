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

// ── Reglas de la base (migración 071): 409 con un mensaje claro, sin internals ──

const errorDeRegla = (regla) =>
  Object.assign(new Error(`ConnectorError(... MysqlError { code: 3819, message: "Check constraint '${regla}' is violated." })`), {
    name: "PrismaClientUnknownRequestError",
  });

test("una regla de la base rota responde 409 con un mensaje para el usuario", () => {
  const res = fakeRes();
  errorHandler(errorDeRegla("chk_auto_vendido_no_disponible"), {}, res, () => {});
  assert.equal(res.statusCode, 409);
  assert.equal(res.payload.error, "Un vehículo vendido no puede quedar disponible.");
  assert.doesNotMatch(JSON.stringify(res.payload), /MysqlError|ConnectorError|chk_/);
});

test("cada regla tiene su mensaje y una desconocida igual da 409 genérico", () => {
  const mensaje = (regla) => {
    const res = fakeRes();
    errorHandler(errorDeRegla(regla), {}, res, () => {});
    return [res.statusCode, res.payload.error];
  };
  assert.deepEqual(mensaje("chk_auto_precio_venta_vendido"), [409, "Solo un vehículo vendido puede tener precio de venta."]);
  assert.deepEqual(mensaje("chk_sena_convertida_con_tramite"), [409, "Una seña que pasó a trámite tiene que figurar como convertida."]);
  assert.deepEqual(mensaje("chk_entrega_vigente_con_cliente"), [409, "Cada entrega tiene que tener un cliente."]);
  assert.deepEqual(mensaje("chk_otra"), [409, "Los datos no cumplen una regla de la base."]);
});

test("un dato único repetido responde 409; el email de usuario tiene su mensaje", () => {
  const unico = (target) => Object.assign(new Error("Unique constraint failed"), { code: "P2002", meta: { target } });
  const res = fakeRes();
  errorHandler(unico("uq_usuarios_email_activo"), {}, res, () => {});
  assert.deepEqual([res.statusCode, res.payload.error], [409, "Ya existe un usuario con ese email."]);
  const otro = fakeRes();
  errorHandler(unico("ref"), {}, otro, () => {});
  assert.deepEqual([otro.statusCode, otro.payload.error], [409, "Ya existe un registro con esos datos."]);
});

test("también entiende el formato de las consultas SQL directas y deja registro del bug", () => {
  const res = fakeRes();
  const registros = [];
  const orig = console.error;
  console.error = (...a) => registros.push(a.join(" "));
  try {
    const crudo = new Error("Raw query failed. Code: `3819`. Message: `Check constraint 'chk_auto_vendido_no_disponible' is violated.`");
    errorHandler(crudo, { method: "PATCH", originalUrl: "/api/vehiculos/12?x=secreto" }, res, () => {});
  } finally {
    console.error = orig;
  }
  assert.deepEqual([res.statusCode, res.payload.error], [409, "Un vehículo vendido no puede quedar disponible."]);
  assert.equal(registros.length, 1, "queda en el log del servidor");
  assert.match(registros[0], /chk_auto_vendido_no_disponible/);
  assert.match(registros[0], /PATCH \/api\/vehiculos\/12/);
  assert.doesNotMatch(registros[0], /secreto/, "sin la query string");
});
