import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma.js";
import { eliminarVehiculo } from "./vehiculos.service.js";

function conAutos(t, existente) {
  const escritos = [];
  const consultas = [];
  const { update, findFirst } = prisma.autos;
  prisma.autos.findFirst = async (args) => (consultas.push(args.where), existente);
  prisma.autos.update = async (args) => (escritos.push(args), existente);
  t.after(() => Object.assign(prisma.autos, { update, findFirst }));
  return { escritos, consultas };
}

test("eliminar marca el auto como borrado y no disponible, sin sacarlo de la base", async (t) => {
  const { escritos, consultas } = conAutos(t, { id: 7, ref: "7" });
  assert.equal(await eliminarVehiculo("7"), true);
  assert.deepEqual(consultas, [{ ref: "7", deleted_at: null }]);
  assert.equal(escritos.length, 1);
  assert.deepEqual(escritos[0].where, { id: 7 });
  assert.ok(escritos[0].data.deleted_at instanceof Date);
  assert.equal(escritos[0].data.disponible, false);
});

test("eliminar un auto inexistente o ya eliminado no escribe nada", async (t) => {
  const { escritos } = conAutos(t, null);
  assert.equal(await eliminarVehiculo("999999"), false);
  assert.equal(escritos.length, 0);
});
