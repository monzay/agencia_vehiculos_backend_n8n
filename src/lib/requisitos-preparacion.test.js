import { test } from "node:test";
import assert from "node:assert/strict";
import { requisitosPreparacion, etapaDe } from "./requisitos-preparacion.js";

const papel = (tipo, extra = {}) => ({ tipo, tenencia: "original", vencido: false, diferencias: [], datos: {}, ...extra });
const PAPELES = [papel("titulo"), papel("formulario_08"), papel("informe_dominio", { datos: { prenda: false, embargo: false, inhibicion: false } })];
const COMPLETO = { documentos: PAPELES, fotos: ["https://x/a.webp"], precioVenta: 9000000 };

const faltan = (entrada) => requisitosPreparacion(entrada).items.filter((i) => !i.cumplido).map((i) => i.clave);
const conInforme = (extra) => [papel("titulo"), papel("formulario_08"), papel("informe_dominio", extra)];

test("con todo cargado se puede publicar", () => {
  const r = requisitosPreparacion(COMPLETO);
  assert.equal(r.habilitado, true);
  assert.deepEqual(r.items.map((i) => i.clave), ["titulo", "formulario_08", "informe_dominio", "foto", "precio"]);
});

test("sin papeles, foto ni precio no se puede publicar", () => {
  assert.equal(requisitosPreparacion({ documentos: [], fotos: [], precioVenta: null }).habilitado, false);
  assert.deepEqual(faltan({ documentos: [], fotos: [], precioVenta: null }), ["titulo", "formulario_08", "informe_dominio", "foto", "precio"]);
});

test("un papel que la agencia no tiene no cuenta", () => {
  const documentos = [papel("titulo", { tenencia: "no_recibido" }), papel("formulario_08"), PAPELES[2]];
  assert.deepEqual(faltan({ ...COMPLETO, documentos }), ["titulo"]);
  const copia = [papel("titulo", { tenencia: "copia" }), papel("formulario_08"), PAPELES[2]];
  assert.deepEqual(faltan({ ...COMPLETO, documentos: copia }), []);
});

test("el informe de dominio no puede tener prenda, embargo, inhibición ni denuncia de robo", () => {
  for (const campo of ["prenda", "embargo", "inhibicion", "denuncia_robo"]) {
    const documentos = conInforme({ datos: { [campo]: true } });
    assert.deepEqual(faltan({ ...COMPLETO, documentos }), ["informe_dominio"], campo);
  }
});

test("un informe vencido o de otro auto no cuenta", () => {
  assert.deepEqual(faltan({ ...COMPLETO, documentos: conInforme({ vencido: true }) }), ["informe_dominio"]);
  assert.deepEqual(faltan({ ...COMPLETO, documentos: conInforme({ diferencias: [{ campo: "dominio" }] }) }), ["informe_dominio"]);
});

test("la etapa sale de la ficha del catálogo, y si no tiene, del avance", () => {
  assert.equal(etapaDe({ estado: "recibido", auto: null }), "recibido");
  assert.equal(etapaDe({ estado: "listo", auto: { disponible: true, vendido_at: null, deleted_at: null } }), "publicado");
  assert.equal(etapaDe({ estado: "listo", auto: { disponible: false, vendido_at: new Date(), deleted_at: null } }), "vendido");
  assert.equal(etapaDe({ estado: "listo", auto: { disponible: false, vendido_at: null, deleted_at: null } }), "listo", "despublicado");
  assert.equal(etapaDe({ estado: "listo", auto: { disponible: true, vendido_at: null, deleted_at: new Date() } }), "listo", "ficha borrada");
});
