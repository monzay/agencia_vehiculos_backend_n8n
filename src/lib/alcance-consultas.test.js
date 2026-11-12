import { test } from "node:test";
import assert from "node:assert/strict";
import { alcanceDeConsultas, TODAS, NINGUNA } from "./alcance-consultas.js";

// Base falsa: devuelve `fila` y anota lo que se le pide.
function baseCon(fila) {
  const pedidos = [];
  const db = { usuarios: { findUnique: async (args) => (pedidos.push(args), fila) } };
  return { db, pedidos };
}

const usuarioDe = (extra = {}) => ({ rol: "asesor", vendedor_id: 4, activo: true, deleted_at: null, ...extra });

test("el admin ve todas las consultas", async () => {
  const { db } = baseCon(usuarioDe({ rol: "admin", vendedor_id: null }));
  assert.equal(await alcanceDeConsultas({ id: 1, rol: "admin" }, db), TODAS);
  assert.deepEqual(TODAS, {});
});

test("un asesor ve solo las consultas de su ficha", async () => {
  const { db, pedidos } = baseCon(usuarioDe());
  assert.deepEqual(await alcanceDeConsultas({ id: 7, rol: "asesor" }, db), { vendedor_id: 4 });
  assert.deepEqual(pedidos[0].where, { id: 7 });
  assert.deepEqual(pedidos[0].select, { rol: true, vendedor_id: true, activo: true, deleted_at: true });
});

test("un asesor sin ficha de asesor no ve ninguna consulta", async () => {
  const { db } = baseCon(usuarioDe({ vendedor_id: null }));
  assert.equal(await alcanceDeConsultas({ id: 7, rol: "asesor" }, db), NINGUNA);
  assert.deepEqual(NINGUNA, { id: { in: [] } });
});

test("un usuario inactivo, borrado o inexistente no ve ninguna consulta", async () => {
  const casos = [
    usuarioDe({ activo: false }),
    usuarioDe({ deleted_at: new Date() }),
    usuarioDe({ rol: "admin", activo: false }),
    usuarioDe({ rol: "admin", deleted_at: new Date() }),
    null,
  ];
  for (const fila of casos) {
    const { db } = baseCon(fila);
    assert.equal(await alcanceDeConsultas({ id: 7, rol: "admin" }, db), NINGUNA);
  }
  const { db, pedidos } = baseCon(usuarioDe());
  assert.equal(await alcanceDeConsultas(undefined, db), NINGUNA);
  assert.equal(await alcanceDeConsultas({ id: "abc", rol: "admin" }, db), NINGUNA);
  assert.deepEqual(pedidos, [], "sin usuario válido no consulta la base");
});

test("el rol del token no cuenta: manda el de la base", async () => {
  const { db } = baseCon(usuarioDe({ rol: "asesor" }));
  assert.deepEqual(await alcanceDeConsultas({ id: 7, rol: "admin" }, db), { vendedor_id: 4 });
});

test("las constantes de alcance están congeladas", () => {
  assert.ok(Object.isFrozen(TODAS) && Object.isFrozen(NINGUNA) && Object.isFrozen(NINGUNA.id));
});
