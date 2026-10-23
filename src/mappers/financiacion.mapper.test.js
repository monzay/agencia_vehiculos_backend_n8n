import { test } from "node:test";
import assert from "node:assert/strict";

import { mapFinanciacion } from "./financiacion.mapper.js";

// Un pago anulado (`deleted_at`) no es un pago: la cuota sigue impaga y el
// saldo no baja, aunque algún `include` traiga todas las filas.

const ANULADO = new Date("2026-10-10T12:00:00Z");

const financiacion = (pagos, cuotas = 4) => ({
  id: 1,
  cliente_id: 7,
  cantidad_cuotas: cuotas,
  precio_cuota: 1000,
  dia_pago: 10,
  activo: true,
  created_at: new Date("2026-05-05T15:00:00Z"),
  clientes: { nombre: "Juan Pérez", telefono: "3885550101", dni: "30111222", email: "j@x.com" },
  pagos,
});

test("un pago anulado no marca la cuota como paga ni baja el saldo", () => {
  // La 3 llega sin `deleted_at`, como sale de un `select: { numero: true }`.
  const f = mapFinanciacion(financiacion([{ numero: 1, deleted_at: null }, { numero: 2, deleted_at: ANULADO }, { numero: 3 }]));
  assert.deepEqual(f.cronograma.map((c) => c.pagado), [true, false, true, false]);
  assert.equal(f.cuotasPagadas, 2);
  assert.equal(f.cuotasRestantes, 2);
  assert.equal(f.montoPagado, 2000);
  assert.equal(f.saldo, 2000);
  assert.equal(f.proximaCuota.numero, 2, "la anulada vuelve a ser la próxima a pagar");
});

test("anular el último pago reabre una financiación completada", () => {
  const completa = mapFinanciacion(financiacion([{ numero: 1, deleted_at: null }, { numero: 2, deleted_at: null }], 2));
  assert.equal(completa.completada, true);
  assert.equal(completa.saldo, 0);

  const reabierta = mapFinanciacion(financiacion([{ numero: 1, deleted_at: null }, { numero: 2, deleted_at: ANULADO }], 2));
  assert.equal(reabierta.completada, false);
  assert.equal(reabierta.saldo, 1000);
});

test("una cuota con un pago anulado y otro vigente figura paga una sola vez", () => {
  const f = mapFinanciacion(financiacion([{ numero: 2, deleted_at: ANULADO }, { numero: 2, deleted_at: null }]));
  assert.equal(f.cronograma[1].pagado, true);
  assert.equal(f.cuotasPagadas, 1);
});
