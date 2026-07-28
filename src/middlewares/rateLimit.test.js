import { test } from "node:test";
import assert from "node:assert/strict";
import { rateLimit } from "./rateLimit.js";

// Fabrica req/res mínimos para ejercitar el middleware sin levantar Express.
function fake(ip = "1.1.1.1", path = "/x", body = {}) {
  const req = { ip, baseUrl: "", path, body };
  const res = {
    statusCode: 200,
    headers: {},
    payload: null,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.payload = b; return this; },
  };
  return { req, res };
}

test("F1/F4 — permite hasta max y luego responde 429 con Retry-After", () => {
  const mw = rateLimit({ ventanaMs: 60_000, max: 3, clave: () => "cubo-A" });
  let next = 0;

  for (let i = 0; i < 3; i++) {
    const { req, res } = fake();
    mw(req, res, () => next++);
    assert.equal(res.statusCode, 200, `la petición ${i + 1} debería pasar`);
  }
  assert.equal(next, 3, "las 3 permitidas llaman a next()");

  // La 4ª supera el límite.
  const { req, res } = fake();
  mw(req, res, () => next++);
  assert.equal(res.statusCode, 429);
  assert.equal(res.payload.ok, false);
  assert.ok(res.headers["retry-after"], "debe incluir Retry-After");
  assert.equal(next, 3, "la bloqueada NO llama a next()");
});

test("F4 — los cubos son independientes por clave (una IP no afecta a otra)", () => {
  const mw = rateLimit({ ventanaMs: 60_000, max: 1, clave: (r) => `ip-${r.ip}` });
  const noop = () => {};

  const a = fake("10.0.0.1"); mw(a.req, a.res, noop);
  assert.equal(a.res.statusCode, 200);

  const b = fake("10.0.0.2"); mw(b.req, b.res, noop);
  assert.equal(b.res.statusCode, 200, "otra IP arranca con su propio contador");

  const c = fake("10.0.0.1"); mw(c.req, c.res, noop);
  assert.equal(c.res.statusCode, 429, "la IP repetida se bloquea");
});
