import { test } from "node:test";
import assert from "node:assert/strict";
import { traeCuil, crearExclusion } from "./cuil.js";

const chat = (...textos) => ({ pasos: textos.map((texto) => ({ tipo: "mensaje", texto })) });

test("traeCuil detecta un CUIL con o sin guiones en los mensajes del cliente", () => {
  assert.equal(traeCuil(chat("hola", "20-12345678-6")), true);
  assert.equal(traeCuil(chat("20123456786")), true);
  assert.equal(traeCuil(chat("tengo 4 millones", "decido yo solo")), false);
  assert.equal(traeCuil({ pasos: [{ tipo: "espera", minutos: 10 }] }), false);
});

test("crearExclusion corre las tareas de a una, en orden, aunque una falle", async () => {
  const exclusion = crearExclusion();
  const orden = [];
  const tarea = (nombre, ms, falla = false) => async () => {
    orden.push(`${nombre}+`);
    await new Promise((listo) => setTimeout(listo, ms));
    orden.push(`${nombre}-`);
    if (falla) throw new Error(nombre);
  };
  const resultados = await Promise.allSettled([exclusion(tarea("a", 20, true)), exclusion(tarea("b", 5)), exclusion(tarea("c", 1))]);
  assert.deepEqual(orden, ["a+", "a-", "b+", "b-", "c+", "c-"]);
  assert.deepEqual(resultados.map((r) => r.status), ["rejected", "fulfilled", "fulfilled"]);
});
