import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

// La 085 agrega `fotos_ref` a `historial_mensajes`: el código del auto cuyas fotos salieron con el mensaje.
// Se aplica a mano y tiene que poder correrse dos veces (MySQL no tiene ADD COLUMN IF NOT EXISTS). Tests estáticos.

const CARPETA = new URL("../prisma/migrations_manual/", import.meta.url);
const M085 = "085_historial_fotos_ref.sql";
const SCHEMA = new URL("../prisma/schema.prisma", import.meta.url);

const sentencias = () =>
  readFileSync(new URL(M085, CARPETA), "utf8")
    .split("\n")
    .filter((linea) => !/^\s*--/.test(linea))
    .join("\n")
    .split(";")
    .map((s) => s.replace(/\s+/g, " ").trim().replace(/`/g, "").toUpperCase())
    .filter(Boolean);

test("la migración 085 existe y empieza con SET SESSION lock_wait_timeout = 10", () => {
  assert.ok(existsSync(new URL(M085, CARPETA)));
  assert.equal(sentencias()[0], "SET SESSION LOCK_WAIT_TIMEOUT = 10");
});

test("085: la columna solo se agrega si information_schema no la tiene (conteo, IF, PREPARE, EXECUTE, DEALLOCATE)", () => {
  const todas = sentencias();
  const conteo = todas.find((s) => /^SET @\w+ = \( ?SELECT COUNT\(\*\) FROM INFORMATION_SCHEMA\.COLUMNS WHERE /.test(s));
  assert.ok(conteo, "falta el conteo");
  assert.match(conteo, /TABLE_SCHEMA = DATABASE\(\)/);
  assert.match(conteo, /TABLE_NAME = 'HISTORIAL_MENSAJES'/);
  assert.match(conteo, /COLUMN_NAME = 'FOTOS_REF'/);
  assert.ok(todas.some((s) => /^SET @\w+ = IF\( ?@\w+ = 0, 'ALTER TABLE HISTORIAL_MENSAJES ADD COLUMN FOTOS_REF VARCHAR\(30\) NULL', 'DO 0' ?\)$/.test(s)));
  assert.equal(todas.filter((s) => /^PREPARE /.test(s)).length, 1);
  assert.equal(todas.filter((s) => /^EXECUTE /.test(s)).length, 1);
  assert.equal(todas.filter((s) => /^DEALLOCATE PREPARE /.test(s)).length, 1);
  assert.equal(todas.filter((s) => /^ALTER TABLE/.test(s)).length, 0, "el ALTER nunca va suelto");
});

test("085: no hay GRANT ni REVOKE (el historial lo escribe el backend y agente_ia ya tiene permisos de tabla)", () => {
  assert.equal(sentencias().filter((s) => /^(GRANT|REVOKE)\b/.test(s)).length, 0);
});

test("schema.prisma: historial_mensajes tiene fotos_ref String? @db.VarChar(30)", () => {
  const modelo = readFileSync(SCHEMA, "utf8").match(/model historial_mensajes \{[\s\S]*?\n\}/)[0];
  assert.match(modelo, /fotos_ref\s+String\?\s+@db\.VarChar\(30\)/);
});
