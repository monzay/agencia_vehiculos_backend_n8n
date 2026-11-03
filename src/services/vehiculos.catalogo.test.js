import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma.js";
import { SIN_TRAMITE_ABIERTO } from "../lib/senas.js";
import { whereDisponible } from "../agente/auto-publico.js";
import { listarVehiculos, obtenerVehiculoPorRef, listarMarcas } from "./vehiculos.service.js";

function conAutos(t) {
  const pedidos = [];
  const { findMany, findFirst } = prisma.autos;
  prisma.autos.findMany = async (args) => (pedidos.push(args.where), []);
  prisma.autos.findFirst = async (args) => (pedidos.push(args.where), null);
  t.after(() => Object.assign(prisma.autos, { findMany, findFirst }));
  return pedidos;
}

test("el catálogo público excluye los autos con trámite abierto", async (t) => {
  const pedidos = conAutos(t);
  await listarVehiculos();
  await obtenerVehiculoPorRef("A1");
  await listarMarcas();

  assert.equal(pedidos.length, 3);
  for (const where of pedidos) {
    assert.deepEqual(where.tramites_interes, SIN_TRAMITE_ABIERTO.tramites_interes);
    assert.deepEqual(where.permutas, SIN_TRAMITE_ABIERTO.permutas);
  }
});

test("un auto sacado de la web tampoco se abre por enlace directo", async (t) => {
  const pedidos = conAutos(t);
  await obtenerVehiculoPorRef("A1");
  assert.equal(pedidos[0].disponible, true);
});

test("la web y el agente usan el mismo filtro", () => {
  const delAgente = whereDisponible();
  assert.deepEqual(delAgente.tramites_interes, SIN_TRAMITE_ABIERTO.tramites_interes);
  assert.deepEqual(delAgente.permutas, SIN_TRAMITE_ABIERTO.permutas);
});
