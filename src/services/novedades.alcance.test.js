import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma.js";
import { contarNuevos } from "./novedades.service.js";

function anotarSql(t) {
  const consultas = [];
  const { $queryRawUnsafe } = prisma;
  prisma.$queryRawUnsafe = async (sql, ...parametros) => (consultas.push({ sql, parametros }), [{ n: 1, visto: null }]);
  t.after(() => Object.assign(prisma, { $queryRawUnsafe }));
  return consultas;
}

const ALCANCE_USUARIO = "u.activo = 1 AND u.deleted_at IS NULL";
const ALCANCE_FICHA = "(u.rol = 'admin' OR (s.vendedor_id IS NOT NULL AND s.vendedor_id = u.vendedor_id))";

test("las novedades de consultas y de ventas de un asesor cuentan solo las suyas", async (t) => {
  const consultas = anotarSql(t);
  for (const seccion of ["consultas", "ventas"]) {
    await contarNuevos(seccion, 7);
    const { sql, parametros } = consultas.find((c) => c.sql.includes("FROM sesiones"));
    assert.ok(sql.includes(ALCANCE_USUARIO), `${seccion}: usuario activo y no borrado`);
    assert.ok(sql.includes(ALCANCE_FICHA), `${seccion}: admin o de su ficha`);
    assert.deepEqual(parametros, [7], `${seccion}: nada del request en el SQL`);
    consultas.length = 0;
  }
});

test("las novedades de clientes no cuentan para un asesor", async (t) => {
  const consultas = anotarSql(t);
  await contarNuevos("clientes", 7);
  const { sql, parametros } = consultas[0];
  assert.ok(sql.includes("AND u.rol = 'admin'"));
  assert.deepEqual(parametros, [7]);
});
