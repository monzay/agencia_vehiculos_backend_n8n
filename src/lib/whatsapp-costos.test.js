import { test } from "node:test";
import assert from "node:assert/strict";
import { estadoWhatsApp, MENSAJES_GRATIS_MES, PRECIO_MENSAJE_USD } from "./whatsapp-costos.js";

test("los primeros 1.000 mensajes del mes son gratis y el precio es el de Meta para Argentina", () => {
  assert.equal(MENSAJES_GRATIS_MES, 1000);
  assert.equal(PRECIO_MENSAJE_USD, 0.026);
});

test("dentro de los 1.000 gratis no se paga nada", () => {
  assert.deepEqual(estadoWhatsApp({ enviados: 320 }), {
    enviados: 320,
    gratisMes: 1000,
    gratisUsados: 320,
    gratisRestantes: 680,
    cobrados: 0,
    precioUsd: 0.026,
    costoEstimadoUsd: 0,
    porcentajeGratis: 32,
  });
});

test("pasados los 1.000, cada mensaje se cobra", () => {
  const e = estadoWhatsApp({ enviados: 1500 });
  assert.equal(e.gratisUsados, 1000);
  assert.equal(e.gratisRestantes, 0);
  assert.equal(e.cobrados, 500);
  assert.equal(e.costoEstimadoUsd, 13);
  assert.equal(e.porcentajeGratis, 100);
});

test("sin datos cuenta cero", () => {
  assert.equal(estadoWhatsApp({ enviados: undefined }).enviados, 0);
  assert.equal(estadoWhatsApp({}).costoEstimadoUsd, 0);
});
