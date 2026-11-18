import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { baseAutorizada } from "../src/lib/base-local.js";

// ajustes-por-chats-reales, tarea 5. La 086 agrega a `sesiones` (modelo Prisma `chat_estado`):
//   nombre_pedido_at       DATETIME NULL  -> cuándo la asesora le pidió el nombre (una sola vez por consulta)
//   fotos_usado_pedidas_at DATETIME NULL  -> cuándo le pidió las fotos del usado (abre la ventana de 24 h)
//   fotos_usado_json       JSON NULL      -> pathnames del Blob privado de las fotos del usado
// Se aplica a mano, tiene que poder correrse dos veces, no toca filas existentes y no suma GRANT: lo nuevo lo
// escribe el usuario del backend, no agente_ia.

const CARPETA = new URL("../prisma/migrations_manual/", import.meta.url);
const M086 = "086_nombre_y_fotos_del_usado.sql";
const SCHEMA = new URL("../prisma/schema.prisma", import.meta.url);
const COLUMNAS = [
  ["nombre_pedido_at", "DATETIME NULL"],
  ["fotos_usado_pedidas_at", "DATETIME NULL"],
  ["fotos_usado_json", "JSON NULL"],
];

const sentencias = () =>
  readFileSync(new URL(M086, CARPETA), "utf8")
    .split("\n")
    .filter((linea) => !/^\s*--/.test(linea))
    .join("\n")
    .split(";")
    .map((s) => s.replace(/\s+/g, " ").trim().replace(/`/g, "").toUpperCase())
    .filter(Boolean);

test("la migración 086 existe y empieza con SET SESSION lock_wait_timeout = 10", () => {
  assert.ok(existsSync(new URL(M086, CARPETA)), `falta prisma/migrations_manual/${M086}`);
  assert.equal(sentencias()[0], "SET SESSION LOCK_WAIT_TIMEOUT = 10");
});

for (const [columna, tipo] of COLUMNAS) {
  test(`086: ${columna} se agrega solo si information_schema no la tiene, como ${tipo}`, () => {
    const todas = sentencias();
    const conteo = todas.find((s) => s.includes(`COLUMN_NAME = '${columna.toUpperCase()}'`) && /SELECT COUNT\(\*\) FROM INFORMATION_SCHEMA\.COLUMNS/.test(s));
    assert.ok(conteo, `falta el conteo de ${columna}`);
    assert.match(conteo, /TABLE_SCHEMA = DATABASE\(\)/);
    assert.match(conteo, /TABLE_NAME = 'SESIONES'/);
    const alter = new RegExp(`^SET @\\w+ = IF\\( ?@\\w+ = 0, 'ALTER TABLE SESIONES ADD COLUMN ${columna.toUpperCase()} ${tipo}', 'DO 0' ?\\)$`);
    assert.ok(todas.some((s) => alter.test(s)), `falta el IF del ALTER de ${columna}`);
  });
}

test("086: tres PREPARE, tres EXECUTE y tres DEALLOCATE; ningún ALTER suelto", () => {
  const todas = sentencias();
  assert.equal(todas.filter((s) => /^PREPARE /.test(s)).length, 3);
  assert.equal(todas.filter((s) => /^EXECUTE /.test(s)).length, 3);
  assert.equal(todas.filter((s) => /^DEALLOCATE PREPARE /.test(s)).length, 3);
  assert.equal(todas.filter((s) => /^ALTER TABLE/.test(s)).length, 0, "el ALTER nunca va suelto");
});

test("086: no toca datos ni permisos (sin UPDATE, DELETE, INSERT, GRANT ni REVOKE)", () => {
  assert.equal(sentencias().filter((s) => /^(UPDATE|DELETE|INSERT|GRANT|REVOKE)\b/.test(s)).length, 0);
});

test("086: los textos van entre comillas simples (el sql_mode de producción es ANSI: las dobles son identificadores)", () => {
  const sinComentarios = readFileSync(new URL(M086, CARPETA), "utf8").split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");
  assert.doesNotMatch(sinComentarios, /"/);
});

test("schema.prisma: chat_estado tiene nombre_pedido_at, fotos_usado_pedidas_at (DateTime? @db.DateTime(0)) y fotos_usado_json (Json?)", () => {
  const modelo = readFileSync(SCHEMA, "utf8").match(/model chat_estado \{[\s\S]*?\n\}/)[0];
  assert.match(modelo, /nombre_pedido_at\s+DateTime\?\s+@db\.DateTime\(0\)/);
  assert.match(modelo, /fotos_usado_pedidas_at\s+DateTime\?\s+@db\.DateTime\(0\)/);
  assert.match(modelo, /fotos_usado_json\s+Json\?/);
});

// ---- Ejecución real en el MySQL local, sobre una base temporal (nunca sobre otra), con el sql_mode de producción ----

const BASE_TEMPORAL = `agencia_migracion_086_test_${process.pid}_${Date.now()}`;
const urlBase = process.env.DATABASE_URL;
const MYSQL = process.env.MYSQL_BIN || "C:\\Program Files\\MySQL\\MySQL Server 9.5\\bin\\mysql.exe";
const motivoDeSalto = !urlBase
  ? "falta DATABASE_URL"
  : !baseAutorizada(urlBase)
    ? "DATABASE_URL no apunta a una base local"
    : !existsSync(MYSQL)
      ? `no existe el cliente mysql (${MYSQL}); definir MYSQL_BIN`
      : false;

// La clave viaja por MYSQL_PWD del proceso hijo, nunca en los argumentos; sin shell.
function mysql(sql, { base } = {}) {
  const u = new URL(urlBase);
  const args = ["--protocol=TCP", "-h", u.hostname.replace(/^\[|\]$/g, ""), "-P", u.port || "3306", "-u", decodeURIComponent(u.username), "-N", "-B"];
  if (base) args.push(base);
  const r = spawnSync(MYSQL, args, { input: sql, encoding: "utf8", env: { ...process.env, MYSQL_PWD: decodeURIComponent(u.password) } });
  return { codigo: r.status, salida: (r.stdout ?? "").replace(/\r\n/g, "\n").trim(), error: (r.stderr ?? "").trim() || String(r.error ?? "") };
}

function ok(sql, opciones) {
  const r = mysql(sql, opciones);
  assert.equal(r.codigo, 0, `mysql falló (código ${r.codigo}): ${r.error}`);
  return r.salida;
}

test(
  `${M086}: aplicada dos veces con sql_mode ANSI sobre una copia de sesiones, agrega las tres columnas nulas y no cambia las filas`,
  { skip: motivoDeSalto },
  () => {
    let creada = false;
    const baseOrigen = decodeURIComponent(new URL(urlBase).pathname.replace(/^\//, ""));
    try {
      ok(`CREATE DATABASE ${BASE_TEMPORAL};`);
      creada = true;
      ok(`CREATE TABLE sesiones LIKE \`${baseOrigen}\`.sesiones;`, { base: BASE_TEMPORAL });
      // Siempre el estado de antes de la migración: la base de desarrollo puede estar ya migrada.
      for (const [columna] of COLUMNAS) {
        const hay = ok(`SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = '${BASE_TEMPORAL}' AND TABLE_NAME = 'sesiones' AND COLUMN_NAME = '${columna}';`);
        if (hay !== "0") ok(`ALTER TABLE sesiones DROP COLUMN ${columna};`, { base: BASE_TEMPORAL });
      }
      ok("INSERT INTO sesiones (cliente_id, sesion_inicio, nombre_declarado) VALUES (1, '2026-01-01 10:00:00', 'Claudia'), (2, '2026-02-02 11:30:00', NULL);", { base: BASE_TEMPORAL });
      // Todas las columnas que había antes de la migración, para comparar las filas enteras.
      const columnasPrevias = ok(`SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY ORDINAL_POSITION) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = '${BASE_TEMPORAL}' AND TABLE_NAME = 'sesiones';`);
      const filasCompletas = () => ok(`SELECT ${columnasPrevias} FROM sesiones ORDER BY id;`, { base: BASE_TEMPORAL });
      const antes = filasCompletas();

      const sql = `SET SESSION sql_mode = 'ANSI';\n${readFileSync(new URL(M086, CARPETA), "utf8")}`;
      ok(sql, { base: BASE_TEMPORAL });
      ok(sql, { base: BASE_TEMPORAL });

      for (const [columna, tipo] of COLUMNAS) {
        const fila = ok(`SELECT IS_NULLABLE, DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = '${BASE_TEMPORAL}' AND TABLE_NAME = 'sesiones' AND COLUMN_NAME = '${columna}';`);
        assert.equal(fila, `YES\t${tipo.split(" ")[0].toLowerCase()}`, columna);
      }
      assert.equal(filasCompletas(), antes, "las filas existentes no cambian (todas las columnas de antes)");
      assert.equal(ok("SELECT COUNT(*) FROM sesiones WHERE nombre_pedido_at IS NOT NULL OR fotos_usado_pedidas_at IS NOT NULL OR fotos_usado_json IS NOT NULL;", { base: BASE_TEMPORAL }), "0");
    } finally {
      if (creada) mysql(`DROP DATABASE IF EXISTS ${BASE_TEMPORAL};`);
    }
  },
);
