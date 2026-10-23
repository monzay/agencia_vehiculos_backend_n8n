import { test } from "node:test";
import assert from "node:assert/strict";
import { telefonosParaBuscar } from "./busqueda-telefono.js";

test("un número parcial se busca tal cual, sin normalizar", () => {
  assert.deepEqual(telefonosParaBuscar("4708"), ["4708"]);
  assert.deepEqual(telefonosParaBuscar("388 47"), ["388 47"]);
  assert.deepEqual(telefonosParaBuscar("3884708"), ["3884708"], "7 dígitos no llegan a un nacional: no se inventa uno");
});

test("el número nacional de 10 dígitos no se repite", () => {
  assert.deepEqual(telefonosParaBuscar("3884708347"), ["3884708347"]);
});

test("un número con el formato del panel también se busca por sus dígitos", () => {
  assert.deepEqual(telefonosParaBuscar("388 470-8347"), ["388 470-8347", "3884708347"]);
});

test("un número con 54 y 9 se busca además por el nacional de 10 dígitos, que es como se guarda", () => {
  assert.deepEqual(telefonosParaBuscar("+54 9 388 470-8347"), ["+54 9 388 470-8347", "5493884708347", "3884708347"]);
  assert.deepEqual(telefonosParaBuscar("5493884708347"), ["5493884708347", "3884708347"]);
});

test("un número con el 0 y el 15 de la marcación vieja también llega al nacional", () => {
  assert.deepEqual(telefonosParaBuscar("0388 15 470-8347"), ["0388 15 470-8347", "0388154708347", "3884708347"]);
});

test("un número que no es argentino se busca por sus dígitos, sin inventarle un nacional", () => {
  assert.deepEqual(telefonosParaBuscar("+1 415 555 2671"), ["+1 415 555 2671", "14155552671"]);
});

test("un texto con pocos dígitos no suma nada: un 500 suelto no trae a todos los que lo tienen en el teléfono", () => {
  assert.deepEqual(telefonosParaBuscar("Fiat 500"), ["Fiat 500"]);
  assert.deepEqual(telefonosParaBuscar("juan"), ["juan"]);
});

test("sin texto no hay nada que buscar: un contains vacío traería a todos", () => {
  assert.deepEqual(telefonosParaBuscar(""), []);
  assert.deepEqual(telefonosParaBuscar("   "), []);
  assert.deepEqual(telefonosParaBuscar(null), []);
  assert.deepEqual(telefonosParaBuscar(undefined), []);
});

test("acepta un número ya convertido a texto por quien llama", () => {
  assert.deepEqual(telefonosParaBuscar(3884708347), ["3884708347"]);
});
