import { test } from "node:test";
import assert from "node:assert/strict";
import { semaforoCrediticio } from "./semaforo.js";

// Respuestas sintéticas con la forma de la API de la Central de Deudores del BCRA.
const entidad = (situacion, extra = {}) => ({
  entidad: "BANCO DE PRUEBA",
  situacion,
  monto: 120,
  refinanciaciones: false,
  recategorizacionOblig: false,
  situacionJuridica: false,
  irrecDisposicionTecnica: false,
  enRevision: false,
  procesoJud: false,
  ...extra,
});
const deudas = (...periodos) => ({ identificacion: 20123456786, denominacion: "PERSONA DE PRUEBA", periodos });
const periodo = (codigo, ...entidades) => ({ periodo: codigo, entidades });
const cheques = (...detalle) => ({ causales: [{ causal: "SIN FONDOS", entidades: [{ entidad: 11, detalle }] }] });
const cheque = (fechaPago) => ({ nroCheque: 1, fechaRechazo: "2026-05-02", monto: 50000, fechaPago });

test("todas las deudas en situación 1 y sin cheques: verde", () => {
  const r = semaforoCrediticio({ deudas: deudas(periodo("202609", entidad(1), entidad(1))), cheques: null });
  assert.deepEqual(r, { semaforo: "verde", peorSituacion: 1, periodo: "202609" });
});

test("situación 2, refinanciación o recategorización: amarillo", () => {
  for (const e of [entidad(2), entidad(1, { refinanciaciones: true }), entidad(1, { recategorizacionOblig: true })]) {
    const r = semaforoCrediticio({ deudas: deudas(periodo("202609", entidad(1), e)), cheques: null });
    assert.equal(r.semaforo, "amarillo");
  }
});

test("situación 3 o peor, proceso judicial o situación jurídica: rojo", () => {
  const rojos = [
    entidad(3),
    entidad(5),
    entidad(1, { procesoJud: true }),
    entidad(1, { situacionJuridica: true }),
    entidad(1, { irrecDisposicionTecnica: true }),
  ];
  for (const e of rojos) {
    const r = semaforoCrediticio({ deudas: deudas(periodo("202609", entidad(2), e)), cheques: null });
    assert.equal(r.semaforo, "rojo");
  }
  assert.equal(semaforoCrediticio({ deudas: deudas(periodo("202609", entidad(4))), cheques: null }).peorSituacion, 4);
});

test("cheque sin fondos impago: rojo; pagado no cuenta", () => {
  const limpio = deudas(periodo("202609", entidad(1)));
  assert.equal(semaforoCrediticio({ deudas: limpio, cheques: cheques(cheque(null)) }).semaforo, "rojo");
  assert.equal(semaforoCrediticio({ deudas: limpio, cheques: cheques(cheque("2026-06-10")) }).semaforo, "verde");
  const porDefectoFormal = { causales: [{ causal: "DEFECTOS FORMALES", entidades: [{ entidad: 11, detalle: [cheque(null)] }] }] };
  assert.equal(semaforoCrediticio({ deudas: limpio, cheques: porDefectoFormal }).semaforo, "verde");
});

test("sin deudas ni cheques: sin_datos", () => {
  assert.deepEqual(semaforoCrediticio({ deudas: null, cheques: null }), { semaforo: "sin_datos", peorSituacion: null, periodo: null });
  assert.equal(semaforoCrediticio({ deudas: deudas(), cheques: { causales: [] } }).semaforo, "sin_datos");
  assert.equal(semaforoCrediticio({ deudas: null, cheques: cheques(cheque("2026-06-10")) }).semaforo, "sin_datos");
  // Un cheque sin fondos impago es dato aunque no tenga deudas.
  assert.equal(semaforoCrediticio({ deudas: null, cheques: cheques(cheque(null)) }).semaforo, "rojo");
});

test("cuenta solo el último período informado", () => {
  const r = semaforoCrediticio({
    deudas: deudas(periodo("202607", entidad(4)), periodo("202609", entidad(1)), periodo("202608", entidad(3))),
    cheques: null,
  });
  assert.deepEqual(r, { semaforo: "verde", peorSituacion: 1, periodo: "202609" });
});

test("una deuda en revisión no empeora el semáforo", () => {
  const r = semaforoCrediticio({ deudas: deudas(periodo("202609", entidad(1, { enRevision: true }))), cheques: null });
  assert.equal(r.semaforo, "verde");
});
