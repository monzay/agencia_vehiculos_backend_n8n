import { test } from "node:test";
import assert from "node:assert/strict";
import { TIPOS_VEHICULO, normalizarTipoVehiculo } from "./tipos-vehiculo.js";

test("los tipos de vehículo son auto, camioneta, camion y moto", () => {
  assert.deepEqual(TIPOS_VEHICULO, ["auto", "camioneta", "camion", "moto"]);
});

test("acepta camioneta", () => {
  assert.equal(normalizarTipoVehiculo("camioneta"), "camioneta");
});

test("acepta camión con o sin tilde", () => {
  assert.equal(normalizarTipoVehiculo("Camión"), "camion");
  assert.equal(normalizarTipoVehiculo("camion"), "camion");
  assert.equal(normalizarTipoVehiculo(" CAMIÓN "), "camion");
});

test("ignora mayúsculas y espacios", () => {
  assert.equal(normalizarTipoVehiculo("  Camioneta "), "camioneta");
  assert.equal(normalizarTipoVehiculo("MOTO"), "moto");
});

test("un valor desconocido o vacío queda como auto", () => {
  assert.equal(normalizarTipoVehiculo("utilitario"), "auto");
  assert.equal(normalizarTipoVehiculo(""), "auto");
  assert.equal(normalizarTipoVehiculo(null), "auto");
  assert.equal(normalizarTipoVehiculo(undefined), "auto");
});
