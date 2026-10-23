import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma.js";
import { contarNuevos } from "./novedades.service.js";

// El servicio usa el cliente Prisma único: se reemplaza su SQL crudo por una
// base falsa que anota lo que recibe.
function anotarSql(t) {
  const consultas = [];
  const { $queryRawUnsafe } = prisma;
  prisma.$queryRawUnsafe = async (sql, ...parametros) => (consultas.push({ sql, parametros }), [{ n: 2, visto: null }]);
  t.after(() => Object.assign(prisma, { $queryRawUnsafe }));
  return consultas;
}

test("las novedades de Clientes cuentan solo fichas vigentes, no las archivadas por una fusión", async (t) => {
  const consultas = anotarSql(t);
  const r = await contarNuevos("clientes", 5);
  assert.equal(r.nuevas, 2);
  const { sql, parametros } = consultas[0];
  assert.match(sql, /\bJOIN clientes\b/);
  assert.match(sql, /\bdeleted_at IS NULL\b/);
  assert.deepEqual(parametros, [5]);
});
