import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Las migraciones de la fase 1 (una persona = una ficha) se aplican a mano, sentencia por sentencia, sobre
// `clientes`, que usa todo el sistema. Se mira solo lo que se ejecuta (sin los comentarios del encabezado).

const CARPETA = new URL("../prisma/migrations_manual/", import.meta.url);
const M072 = "072_financiacion_pagos_borrado_logico.sql";
const M073 = "073_clientes_una_ficha.sql";
const M074 = "074_clientes_dni_unico_sin_canal_id.sql";

const sentencias = (archivo) =>
  readFileSync(new URL(archivo, CARPETA), "utf8")
    .split("\n")
    .filter((linea) => !/^\s*--/.test(linea))
    .join("\n")
    .split(";")
    .map((sentencia) => sentencia.replace(/\s+/g, " ").trim())
    .filter(Boolean);

// La 072 (pagos de cuotas con borrado lógico) tampoco está en producción y se aplica igual, a mano.
for (const archivo of [M072, M073, M074]) {
  // Como comentario no hace nada: el default de MySQL es un año, y un ALTER esperando el bloqueo de metadatos frena
  // todas las consultas nuevas a la tabla.
  test(`${archivo}: lo primero que se ejecuta es SET SESSION lock_wait_timeout = 10`, () => {
    assert.equal(sentencias(archivo)[0], "SET SESSION lock_wait_timeout = 10");
  });
}

test(`${M073}: el SET, el ALTER de clientes, las dos tablas nuevas y la copia de los identificadores, en ese orden`, () => {
  const comienzos = sentencias(M073).map((sentencia) => sentencia.split(" ").slice(0, 3).join(" "));

  assert.deepEqual(comienzos, [
    "SET SESSION lock_wait_timeout",
    "ALTER TABLE `clientes`",
    "CREATE TABLE `cliente_canales`",
    "CREATE TABLE `cliente_fusiones`",
    "INSERT INTO `cliente_canales`",
  ]);
});

// Entre los dos ALTER el estado es seguro (el backend nuevo no escribe `canal_id`). `DROP INDEX uq_canal` y
// `DROP COLUMN canal_id` van en el mismo: borrar solo la columna dejaría el UNIQUE reducido a `canal`.
test(`${M074}: primero el índice único del DNI y después, en otro ALTER, el UNIQUE viejo junto con la columna`, () => {
  assert.deepEqual(sentencias(M074).slice(1), [
    "ALTER TABLE `clientes` ADD UNIQUE INDEX `uq_clientes_dni_vigente` ((IF(`deleted_at` IS NULL, `dni`, NULL)))",
    "ALTER TABLE `clientes` DROP INDEX `uq_canal`, DROP COLUMN `canal_id`",
  ]);
});
