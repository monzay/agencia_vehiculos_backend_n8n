// Tests del resumen del reporte masivo (tarea 10 de huecos-del-bot): cobertura por eje y criterio de cierre.
import { test } from "node:test";
import assert from "node:assert/strict";
import { EJES, generarCasos } from "./generar.js";
import { resumir, cumpleCriterio } from "./resumen.js";

const BASE = { tiempo: "mismo_dia", asesor: "sin_link", autos: "uno_solo", atencion: "pendiente", medios: "texto", pausa: "sin_pausa", conducta: "normal", manipulacion: "ninguna" };
const caso = (id, cambios = {}) => ({ id, telefono: `54938855${id}`, ejes: { ...BASE, ...cambios }, turnos: [], esperado: {} });

let cacheBueno;
const resultadosBuenos = () => (cacheBueno ??= generarCasos({ cantidad: 1200 }).map((c) => ({ caso: c, ok: true, fallas: [] })));
const resumenBueno = () => resumir(resultadosBuenos());

test("resumir cuenta total, ok y fallidos", () => {
  const r = resumir([
    { caso: caso("a"), ok: true, fallas: [] },
    { caso: caso("b"), ok: false, fallas: ["consultas: se esperaban 1 y hay 2"] },
    { caso: caso("c"), ok: true, fallas: [] },
  ]);
  assert.equal(r.total, 3);
  assert.equal(r.ok, 2);
  assert.equal(r.fallidos, 1);
});

test("resumir cuenta los casos por eje y valor, y deja en 0 los que no aparecen", () => {
  const r = resumir([
    { caso: caso("a", { tiempo: "31_dias" }), ok: true, fallas: [] },
    { caso: caso("b", { tiempo: "31_dias", asesor: "link_otro" }), ok: false, fallas: ["x"] },
    { caso: caso("c"), ok: true, fallas: [] },
  ]);
  assert.equal(r.cobertura.tiempo["31_dias"], 2, "los fallidos también cuentan como cubiertos");
  assert.equal(r.cobertura.tiempo.mismo_dia, 1);
  assert.equal(r.cobertura.tiempo["1_anio"], 0);
  assert.equal(r.cobertura.asesor.link_otro, 1);
  assert.equal(r.cobertura.asesor.sin_link, 2);
  for (const [eje, valores] of Object.entries(EJES)) {
    assert.deepEqual(Object.keys(r.cobertura[eje]).sort(), [...valores].sort(), `la cobertura de ${eje} trae todos sus valores`);
  }
});

test("resumir lista los fallidos con id, ejes y fallas", () => {
  const r = resumir([
    { caso: caso("a"), ok: true, fallas: [] },
    { caso: caso("b", { autos: "cambia_1" }), ok: false, fallas: ["autoFinal: se esperaba SIM-02 y quedó SIM-01", "consultas: se esperaban 1 y hay 2"] },
  ]);
  assert.deepEqual(r.fallas, [
    {
      id: "b",
      ejes: { ...BASE, autos: "cambia_1" },
      fallas: ["autoFinal: se esperaba SIM-02 y quedó SIM-01", "consultas: se esperaban 1 y hay 2"],
    },
  ]);
});

test("un caso que lanzó un error cuenta como fallido y su error figura en la lista", () => {
  const r = resumir([{ caso: caso("a"), ok: false, fallas: [], error: "Número de WhatsApp inválido." }]);
  assert.equal(r.fallidos, 1);
  assert.equal(r.fallas.length, 1);
  assert.equal(r.fallas[0].id, "a");
  assert.match(JSON.stringify(r.fallas[0].fallas), /Número de WhatsApp inválido\./);
});

test("sin resultados: total 0 y nada fallido", () => {
  const r = resumir([]);
  assert.equal(r.total, 0);
  assert.equal(r.fallidos, 0);
  assert.deepEqual(r.fallas, []);
});

test("cumpleCriterio es verdadero con más de 1000 casos, todo cubierto, 0 fallidos y 0 intentos de red", () => {
  const r = resumenBueno();
  assert.ok(r.total > 1000);
  assert.equal(r.fallidos, 0);
  assert.equal(cumpleCriterio(r, { intentosDeRed: 0 }), true);
});

test("cumpleCriterio es falso con 1000 casos exactos", () => {
  assert.equal(cumpleCriterio({ ...resumenBueno(), total: 1000 }, { intentosDeRed: 0 }), false);
});

test("cumpleCriterio es falso si algún valor de algún eje quedó en 0", () => {
  const r = resumenBueno();
  const sinUno = { ...r, cobertura: { ...r.cobertura, tiempo: { ...r.cobertura.tiempo, "1_anio": 0 } } };
  assert.equal(cumpleCriterio(sinUno, { intentosDeRed: 0 }), false);
  const sinOtro = { ...r, cobertura: { ...r.cobertura, manipulacion: { ...r.cobertura.manipulacion, codigo_en_audio: 0 } } };
  assert.equal(cumpleCriterio(sinOtro, { intentosDeRed: 0 }), false);
});

test("cumpleCriterio es falso si falta un valor en la cobertura", () => {
  const r = resumenBueno();
  const { groq_falla, ...resto } = r.cobertura.medios;
  assert.equal(cumpleCriterio({ ...r, cobertura: { ...r.cobertura, medios: resto } }, { intentosDeRed: 0 }), false);
});

test("cumpleCriterio es falso con un caso fallido", () => {
  assert.equal(cumpleCriterio({ ...resumenBueno(), fallidos: 1 }, { intentosDeRed: 0 }), false);
});

test("cumpleCriterio es falso con un intento de red", () => {
  assert.equal(cumpleCriterio(resumenBueno(), { intentosDeRed: 1 }), false);
});
