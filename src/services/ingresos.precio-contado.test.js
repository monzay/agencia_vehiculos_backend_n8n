import { test } from "node:test";
import assert from "node:assert/strict";
import { PARA_DETALLE } from "./ingresos.service.js";

test("el detalle del trámite pide el precio al contado del auto", () => {
  assert.equal(PARA_DETALLE.auto_interes.select.precio_contado, true);
});
