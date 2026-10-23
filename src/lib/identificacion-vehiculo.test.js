import { test } from "node:test";
import assert from "node:assert/strict";

import { normalizarDominio, normalizarIdentificacion, identificacionParaBoleto, difiereDeLaFicha } from "./identificacion-vehiculo.js";

// Dominio, motor y chasis del auto que vende la agencia. El alta del vehículo no
// los pide: el boleto los completa (o corrige) y quedan en la ficha.

const FICHA_VACIA = { dominio: null, motor: null, chasis: null };
const FICHA_COMPLETA = { dominio: "AB123CD", motor: "CFZ123456", chasis: "9BWAB45U0HT012345" };

test("el dominio se guarda en mayúsculas y sin espacios ni guiones", () => {
  assert.equal(normalizarDominio(" ab 123-cd "), "AB123CD");
});

test("motor y chasis se guardan en mayúsculas, sin espacios de más y con su tope", () => {
  assert.equal(normalizarIdentificacion("  cfz123456 ", 40), "CFZ123456");
  assert.equal(normalizarIdentificacion("x".repeat(50), 40).length, 40);
});

test("un valor vacío o ausente queda en null", () => {
  assert.equal(normalizarDominio(""), null);
  assert.equal(normalizarDominio(null), null);
  assert.equal(normalizarIdentificacion("   ", 40), null);
  assert.equal(normalizarIdentificacion(undefined, 40), null);
});

test("lo que no es texto no se guarda como basura: cuenta como vacío", () => {
  assert.equal(normalizarDominio({}), null);
  assert.equal(normalizarIdentificacion(["a"], 40), null);
  assert.equal(normalizarIdentificacion(true, 40), null);
  assert.throws(() => identificacionParaBoleto({ dominio: {}, motor: "M1", chasis: "C1" }, FICHA_VACIA), /falta el dominio del/);
});

test("con la ficha vacía, el boleto toma lo que se cargó en el formulario", () => {
  const datos = identificacionParaBoleto({ dominio: "ab-123-cd", motor: "cfz123456", chasis: "9bwab45u0ht012345" }, FICHA_VACIA);
  assert.deepEqual(datos, FICHA_COMPLETA);
});

test("si el formulario no los manda, se usan los de la ficha", () => {
  assert.deepEqual(identificacionParaBoleto({}, FICHA_COMPLETA), FICHA_COMPLETA);
});

test("lo que se carga en el boleto corrige lo que tenía la ficha", () => {
  const datos = identificacionParaBoleto({ dominio: "AC987ZZ" }, FICHA_COMPLETA);
  assert.deepEqual(datos, { ...FICHA_COMPLETA, dominio: "AC987ZZ" });
});

test("sin dominio, motor ni chasis no se arma el boleto y el error dice qué falta", () => {
  assert.throws(
    () => identificacionParaBoleto({}, FICHA_VACIA),
    (e) => {
      assert.equal(e.status, 400);
      assert.match(e.message, /el dominio, el número de motor y el número de chasis/);
      return true;
    }
  );
});

test("motor y chasis son obligatorios aunque el dominio esté", () => {
  assert.throws(() => identificacionParaBoleto({ dominio: "AB123CD" }, FICHA_VACIA), /el número de motor y el número de chasis/);
  assert.throws(() => identificacionParaBoleto({ dominio: "AB123CD", motor: "M1" }, FICHA_VACIA), /falta el número de chasis del/);
});

test("vaciar en el formulario un dato que la ficha tenía no se acepta", () => {
  assert.throws(() => identificacionParaBoleto({ motor: "" }, FICHA_COMPLETA), /falta el número de motor del/);
});

test("difiereDeLaFicha dice si hay que actualizar la ficha del auto", () => {
  assert.equal(difiereDeLaFicha(FICHA_COMPLETA, FICHA_COMPLETA), false);
  assert.equal(difiereDeLaFicha(FICHA_COMPLETA, FICHA_VACIA), true);
  assert.equal(difiereDeLaFicha({ ...FICHA_COMPLETA, chasis: "OTRO" }, FICHA_COMPLETA), true);
});
