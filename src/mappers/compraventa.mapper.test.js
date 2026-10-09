import { test } from "node:test";
import assert from "node:assert/strict";

import { montoAPagar, mapCompraventa } from "./compraventa.mapper.js";

// Parte de pago: `precio` = valor del usado, `entregadoValor` = auto de la agencia.

test("sin seña, el cliente paga el auto menos el usado", () => {
  assert.deepEqual(montoAPagar(12_000_000, 20_000_000), { pagador: "cliente", monto: 8_000_000 });
});

test("la seña se descuenta de lo que paga el cliente", () => {
  assert.deepEqual(montoAPagar(12_000_000, 20_000_000, 500_000), { pagador: "cliente", monto: 7_500_000 });
});

test("si el usado y la seña cubren el auto justo, no paga nadie", () => {
  assert.deepEqual(montoAPagar(19_500_000, 20_000_000, 500_000), { pagador: null, monto: 0 });
});

test("si el usado vale más, la agencia devuelve la diferencia más la seña", () => {
  assert.deepEqual(montoAPagar(21_000_000, 20_000_000, 500_000), { pagador: "agencia", monto: 1_500_000 });
});

test("en una compra la seña no aplica", () => {
  assert.deepEqual(montoAPagar(10_000_000, null, 500_000), { pagador: "agencia", monto: 10_000_000 });
});

const boleto = {
  id: 1,
  precio: 12_000_000,
  entregado_valor: 20_000_000,
  auto_entregado: { ref: "7" },
  pago_en_acto: 3_000_000,
  forma_pago: "transferencia",
  transferencia_dias: 30,
};

test("el boleto muestra la seña y el saldo ya descontado", () => {
  const { pago } = mapCompraventa(boleto, { monto: 500_000, fecha: "2026-10-01T12:00:00Z" });
  assert.equal(pago.sena, 500_000);
  assert.equal(pago.monto, 7_500_000);
  assert.equal(pago.saldo, 4_500_000);
});

test("sin seña el boleto queda como antes", () => {
  const { pago } = mapCompraventa(boleto);
  assert.equal(pago.sena, 0);
  assert.equal(pago.senaFecha, null);
  assert.equal(pago.saldo, 5_000_000);
});
