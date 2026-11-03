import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma.js";
import { obtenerConfig, actualizarConfig } from "./config.service.js";

function conBase(t) {
  const escrituras = [];
  const { findMany, upsert } = prisma.configuracion;
  prisma.configuracion.findMany = async () => [];
  prisma.configuracion.upsert = async (args) => (escrituras.push(args), {});
  t.after(() => Object.assign(prisma.configuracion, { findMany, upsert }));
  return escrituras;
}

test("la verificación del BCRA no se puede apagar desde la configuración", async (t) => {
  const escrituras = conBase(t);
  const config = await actualizarConfig({ verificacion_crediticia: false });

  assert.deepEqual(escrituras, []);
  assert.equal("verificacion_crediticia" in config, false);
});

test("la repartición de consultas se sigue configurando", async (t) => {
  const escrituras = conBase(t);
  assert.equal((await obtenerConfig()).reparticion_equitativa, true);

  await actualizarConfig({ reparticion_equitativa: false });
  assert.equal(escrituras[0].where.clave, "reparticion_equitativa");
  assert.equal(escrituras[0].update.valor, "0");
});
