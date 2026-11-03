import { test } from "node:test";
import assert from "node:assert/strict";
import { validarCuil, esCuilDelDni, formatearCuil } from "./cuil.js";

// CUILs sintéticos con el dígito verificador bien calculado (pesos 5,4,3,2,7,6,5,4,3,2).
const CUIL_VALIDO = "20123456786";
const CUIL_MUJER = "27301256782";

test("acepta un CUIL válido con o sin separadores y devuelve los 11 dígitos", () => {
  assert.equal(validarCuil(CUIL_VALIDO), CUIL_VALIDO);
  assert.equal(validarCuil("20-12345678-6"), CUIL_VALIDO);
  assert.equal(validarCuil(" 27.30125678.2 "), CUIL_MUJER);
  assert.equal(validarCuil("27 30125678 2"), CUIL_MUJER);
});

test("rechaza largo, prefijo de empresa o dígito verificador incorrectos", () => {
  assert.equal(validarCuil("2012345678"), null);
  assert.equal(validarCuil("201234567861"), null);
  assert.equal(validarCuil("20123456787"), null);
  assert.equal(validarCuil("30123456781"), null);
  assert.equal(validarCuil("20-1234567a-6"), null);
  assert.equal(validarCuil(""), null);
  assert.equal(validarCuil(null), null);
  assert.equal(validarCuil(20123456786), null);
});

test("el CUIL contiene el DNI de la persona, con o sin cero adelante", () => {
  assert.equal(esCuilDelDni(CUIL_VALIDO, "12345678"), true);
  assert.equal(esCuilDelDni(CUIL_VALIDO, "12.345.678"), true);
  assert.equal(esCuilDelDni(CUIL_VALIDO, "87654321"), false);
  // DNI de 7 dígitos: en el CUIL va con un 0 adelante.
  assert.equal(esCuilDelDni("20012345675", "1234567"), true);
});

test("formatearCuil pone los guiones y deja igual lo que no tiene 11 dígitos", () => {
  assert.equal(formatearCuil(CUIL_VALIDO), "20-12345678-6");
  assert.equal(formatearCuil("123"), "123");
});
