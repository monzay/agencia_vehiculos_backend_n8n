import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { AUTOS, DATOS_CATALOGO, HORARIOS, fotosDe } from "./catalogo.js";

const DOC = fileURLToPath(new URL("../../../../openspec/changes/respuestas-del-bot/chats-simulados.md", import.meta.url));

test("el catálogo tiene los 13 autos de la tabla del documento, con los mismos códigos y precios de lista", () => {
  const filas = readFileSync(DOC, "utf8").split("\n").filter((l) => /^\| \d+ \|/.test(l)).map((l) => l.split("|").map((c) => c.trim()));
  assert.equal(filas.length, 13);
  assert.equal(AUTOS.length, 13);
  for (const f of filas) {
    const auto = AUTOS.find((a) => a.ref === f[1]);
    assert.ok(auto, `falta el auto ${f[1]}`);
    assert.equal(auto.precio, Number(f[3].replace(/\D/g, "")), `precio del ${f[1]}`);
    assert.equal(auto.vendido === true, f[8] === "vendido", `estado del ${f[1]}`);
  }
});

test("cada auto tiene 4 fotos https .jpg y el único vendido es el 90", () => {
  for (const a of AUTOS) {
    assert.equal(fotosDe(a.ref).length, 4);
    assert.ok(fotosDe(a.ref).every((f) => /^https:\/\/\S+\.jpg$/.test(f)));
  }
  assert.deepEqual(AUTOS.filter((a) => a.vendido).map((a) => a.ref), ["90"]);
});

test("los horarios: lunes a viernes 08-21 (miércoles 09), sábado 08-13 y domingo cerrado", () => {
  assert.equal(HORARIOS.length, 7);
  assert.equal(HORARIOS[0].abierto, false);
  assert.equal(HORARIOS[3].apertura, "09:00");
  assert.equal(HORARIOS[6].cierre, "13:00");
});

test("el SQL carga la agencia, los términos, la repartición equitativa y todos los autos", () => {
  assert.match(DATOS_CATALOGO, /Ortega Automotores/);
  assert.match(DATOS_CATALOGO, /INSERT INTO terminos_versiones/);
  assert.match(DATOS_CATALOGO, /reparticion_equitativa/);
  assert.match(DATOS_CATALOGO, /INSERT INTO horarios_atencion/);
  assert.equal((DATOS_CATALOGO.match(/'usado'/g) ?? []).length, 13);
});
