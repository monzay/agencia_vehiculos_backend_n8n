import { test } from "node:test";
import assert from "node:assert/strict";
import { exigirVentaCoherente } from "./vehiculos.service.js";

const vendido = { vendido_at: new Date("2026-10-01T15:00:00Z") };
const aLaVenta = { vendido_at: null };

test("un auto vendido no se puede volver a poner disponible desde la edición", () => {
  assert.throws(() => exigirVentaCoherente(vendido, { disponible: true }), (e) => e.status === 409 && /deshacé la venta/.test(e.message));
});

test("editar otros datos de un auto vendido, o dejarlo no disponible, se permite", () => {
  assert.doesNotThrow(() => exigirVentaCoherente(vendido, { descripcion: "Impecable" }));
  assert.doesNotThrow(() => exigirVentaCoherente(vendido, { disponible: false }));
});

test("un auto a la venta se puede poner disponible o no", () => {
  assert.doesNotThrow(() => exigirVentaCoherente(aLaVenta, { disponible: true }));
  assert.doesNotThrow(() => exigirVentaCoherente(aLaVenta, { disponible: false }));
});
