import { test } from "node:test";
import assert from "node:assert/strict";
import { crearBcraSimulado, SEMAFOROS_SIMULADOS } from "./bcra-simulado.js";
import { semaforoCrediticio } from "../../credito/semaforo.js";

test("el BCRA simulado devuelve la respuesta que da cada semáforo elegido, con el nombre de prueba", async () => {
  for (const elegido of ["verde", "amarillo", "rojo", "sin_datos"]) {
    const respuesta = await crearBcraSimulado(elegido).consultar("20123456786");
    assert.equal(respuesta.estado, "ok", elegido);
    assert.equal(semaforoCrediticio(respuesta).semaforo, elegido);
  }
  const { deudas } = await crearBcraSimulado("rojo", "PEREZ ANA").consultar("20123456786");
  assert.equal(deudas.denominacion, "PEREZ ANA");
});

test("el BCRA simulado puede fallar como el real, y no acepta un semáforo que no existe", async () => {
  assert.deepEqual(await crearBcraSimulado("error").consultar("20123456786"), { estado: "error", motivo: "simulado" });
  assert.ok(SEMAFOROS_SIMULADOS.includes("error"));
  assert.throws(() => crearBcraSimulado("violeta"), /semáforo/);
});
