import { test } from "node:test";
import assert from "node:assert/strict";
import { aPublico } from "./financiaciones.service.js";

// Regresión de F1: la consulta pública por DNI NO debe filtrar identidad ni
// contacto de la persona, solo el plan de cuotas. Si alguien vuelve a dejar
// pasar `nombre`, `dni` o `telefonoAlt` en la vista pública, este test falla.
test("F1 — la vista pública no expone PII, solo el plan", () => {
  const completo = {
    id: 1,
    clienteId: 9,
    nombre: "Juan Pérez",
    dni: "30111222",
    telefono: "3510000000",
    telefonoAlt: "3511111111",
    email: "juan@example.com",
    cantidadCuotas: 12,
    precioCuota: 1000,
    montoTotal: 12000,
    saldo: 8000,
    cronograma: [{ numero: 1, vencimiento: "2026-01-10", pagado: true }],
  };

  const pub = aPublico(completo);

  for (const prohibido of ["nombre", "dni", "telefono", "telefonoAlt", "email", "clienteId"]) {
    assert.ok(!(prohibido in pub), `la vista pública NO debe exponer "${prohibido}"`);
  }

  // Y sigue devolviendo lo que el cliente necesita ver de su plan.
  assert.equal(pub.cantidadCuotas, 12);
  assert.equal(pub.saldo, 8000);
  assert.ok(Array.isArray(pub.cronograma));
});

test("la vista pública tampoco muestra las respuestas del cliente ni la baja de avisos (son del admin)", () => {
  const pub = aPublico({ id: 1, cantidadCuotas: 12, respuestas: [{ tipo: "transferencia" }], avisosBaja: "2026-10-01", proximoAviso: { numero: 1 } });
  for (const prohibido of ["respuestas", "avisosBaja", "proximoAviso"]) {
    assert.ok(!(prohibido in pub), `la vista pública NO debe exponer "${prohibido}"`);
  }
});
