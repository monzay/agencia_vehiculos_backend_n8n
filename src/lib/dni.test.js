import { test } from "node:test";
import assert from "node:assert/strict";
import { claveDni, validarDni } from "./dni.js";

test("claveDni guarda el DNI sin puntos, espacios ni guiones", () => {
  for (const escrito of ["30.125.678", " 30 125 678 ", "30-125-678", "30125678", 30125678]) {
    assert.equal(claveDni(escrito), "30125678", `con ${JSON.stringify(escrito)}`);
  }
});

test("claveDni no le saca las letras a un documento: dos pasaportes distintos no quedan iguales", () => {
  assert.equal(claveDni("ab-123456"), "AB123456");
  assert.notEqual(claveDni("AB123456"), claveDni("CD123456"));
});

test("claveDni de algo vacío es null", () => {
  for (const vacio of [null, undefined, "", "   ", " . - "]) assert.equal(claveDni(vacio), null, `con ${JSON.stringify(vacio)}`);
});

test("validarDni acepta de 7 a 9 dígitos, con o sin puntos, y devuelve solo los dígitos", () => {
  assert.equal(validarDni("30.125.678"), "30125678");
  assert.equal(validarDni("1234567"), "1234567");
  assert.equal(validarDni("123456789"), "123456789");
  assert.equal(validarDni(30125678), "30125678");
});

const rechaza = (valor, mensaje) =>
  assert.throws(() => validarDni(valor), (e) => e.status === 400 && mensaje.test(e.message), `debería rechazar ${JSON.stringify(valor)}`);

test("validarDni rechaza con 400 un DNI vacío", () => {
  for (const vacio of [undefined, null, "", "   "]) rechaza(vacio, /obligatorio/);
});

test("validarDni rechaza letras: un pasaporte no se convierte en un DNI de mentira", () => {
  for (const conLetras of ["AB1234567", "DNI 30125678", "30125678x"]) rechaza(conLetras, /solo números/);
});

test("validarDni rechaza menos de 7 o más de 9 dígitos", () => {
  for (const largo of ["123456", "0", "1", "1234567890"]) rechaza(largo, /entre 7 y 9/);
});

test("validarDni rechaza un DNI con todos los dígitos iguales", () => {
  for (const repetido of ["0000000", "11111111", "999999999"]) rechaza(repetido, /no es válido/);
});

test("validarDni rechaza lo que no es texto ni número entero (un objeto de ?dni[a]=b)", () => {
  for (const raro of [{ not: "x" }, ["30125678"], 3.5, true]) rechaza(raro, /solo números|obligatorio/);
});
