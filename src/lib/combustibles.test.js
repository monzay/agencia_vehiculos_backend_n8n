import { test } from "node:test";
import assert from "node:assert/strict";
import { COMBUSTIBLES, normalizarCombustible } from "./combustibles.js";

test("los combustibles son nafta, GNC, nafta y GNC, y diésel", () => {
  assert.deepEqual(COMBUSTIBLES, ["nafta", "gnc", "nafta_gnc", "diesel"]);
});

test("acepta nafta y GNC", () => {
  assert.equal(normalizarCombustible("nafta_gnc"), "nafta_gnc");
});

test("el valor de nafta y GNC entra en la columna de la base", () => {
  const LARGO_COLUMNA = 10;
  assert.ok(COMBUSTIBLES.every((c) => c.length <= LARGO_COLUMNA));
});

test("ignora mayúsculas y espacios", () => {
  assert.equal(normalizarCombustible("  GNC "), "gnc");
});

test("vacío queda sin especificar", () => {
  assert.equal(normalizarCombustible(""), null);
  assert.equal(normalizarCombustible("   "), null);
  assert.equal(normalizarCombustible(null), null);
  assert.equal(normalizarCombustible(undefined), null);
});

test("rechaza un combustible que no está en la lista", () => {
  assert.throws(
    () => normalizarCombustible("hidrogeno"),
    (e) => e.status === 400 && /combustible/i.test(e.message)
  );
});
