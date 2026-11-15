import { test } from "node:test";
import assert from "node:assert/strict";
import { crearLectorDeGuardado } from "./guardado.js";

function prismaFalso(sesion, { permisos = 0, costo = null } = {}) {
  return {
    cliente_canales: { findUniqueOrThrow: async () => ({ cliente_id: 7 }) },
    chat_estado: { findFirst: async () => sesion },
    autos: { findUnique: async () => ({ ref: "69" }) },
    consentimientos: { count: async () => permisos },
    ia_consumos: { aggregate: async () => ({ _sum: { costo_usd: costo } }) },
  };
}

test("lee lo anotado de la última consulta, el auto por su código, los permisos y el costo", async () => {
  const sesion = { pago_tipo: "financiado", anticipo: "4 millones", entrega_usado: 0, auto_id: 5, visita_propuesta: "martes", requiere_vendedor: 1, cuil_informado: "20123456786" };
  const r = await crearLectorDeGuardado(prismaFalso(sesion, { permisos: 1, costo: "0.0123" }))("5490001");
  assert.deepEqual(r.guardado, { pago_tipo: "financiado", anticipo: "4 millones", entrega_usado: false, auto: "69", visita: "martes", requiere_vendedor: true, permisos: 1, cuil: "20123456786" });
  assert.equal(r.costoUsd, 0.0123);
});

test("lo que no se anotó queda en null y el costo en 0", async () => {
  const r = await crearLectorDeGuardado(prismaFalso({ auto_id: null, entrega_usado: null }))("5490001");
  assert.equal(r.guardado.entrega_usado, null);
  assert.equal(r.guardado.auto, null);
  assert.equal(r.guardado.pago_tipo, null);
  assert.equal(r.guardado.requiere_vendedor, false);
  assert.equal(r.costoUsd, 0);
});
