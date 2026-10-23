import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma.js";
import { metricasResumen } from "./metricas.service.js";

// El servicio usa el cliente Prisma único: se reemplazan sus consultas por una
// base falsa que no devuelve datos y anota el SQL que recibe.
function anotarSql(t) {
  const sqls = [];
  const { $queryRawUnsafe, $queryRaw } = prisma;
  const { groupBy, count } = prisma.auto_vistas;
  prisma.$queryRawUnsafe = async (sql) => (sqls.push(sql), [{ n: 0 }]);
  prisma.$queryRaw = async () => [{ n: 0 }];
  prisma.auto_vistas.groupBy = async () => [];
  prisma.auto_vistas.count = async () => 0;
  t.after(() => {
    Object.assign(prisma, { $queryRawUnsafe, $queryRaw });
    Object.assign(prisma.auto_vistas, { groupBy, count });
  });
  return sqls;
}

test("el Resumen cuenta solo clientes de fichas vigentes, no las archivadas por una fusión", async (t) => {
  const sqls = anotarSql(t);
  await metricasResumen();
  const deClientes = sqls.filter((sql) => /\bFROM clientes\b/.test(sql));
  assert.equal(deClientes.length, 5, "los de hoy y una serie por período (día, semana, mes, año)");
  for (const sql of deClientes) assert.match(sql, /\bdeleted_at IS NULL\b/);
});
