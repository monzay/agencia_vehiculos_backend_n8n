import { test } from "node:test";
import assert from "node:assert/strict";

import { PARA_DETALLE } from "./ingresos.service.js";

// El detalle del ingreso muestra la financiación del saldo de la parte de pago.
// Un pago anulado (`deleted_at`) no es un pago: el include trae solo los vigentes.

test("el include del detalle del ingreso pide solo los pagos vigentes de la financiación", () => {
  const { pagos } = PARA_DETALLE.financiaciones.include;
  assert.deepEqual(pagos.where, { deleted_at: null });
  assert.deepEqual(pagos.orderBy, { numero: "asc" }, "sigue en orden de cuota");
});
