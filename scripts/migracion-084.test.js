import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { baseAutorizada } from "../src/lib/base-local.js";

// La 084 agrega `orden_at` a `sesiones` (modelo Prisma `chat_estado`): la fecha por la que se ordena la lista de
// Consultas. Se aplica a mano, sentencia por sentencia, y tiene que poder correrse dos veces sin error (en MySQL
// no existe ADD COLUMN IF NOT EXISTS). Casi todos los tests son estáticos (leen el .sql y el schema); el último
// la ejecuta de verdad sobre una base temporal del MySQL local.

if (existsSync(".env")) process.loadEnvFile(".env");

const CARPETA = new URL("../prisma/migrations_manual/", import.meta.url);
const M084 = "084_sesiones_orden_at.sql";
const SCHEMA = new URL("../prisma/schema.prisma", import.meta.url);

const normalizar = (texto) => texto.replace(/\s+/g, " ").trim();

const sentencias = (archivo) =>
  readFileSync(new URL(archivo, CARPETA), "utf8")
    .split("\n")
    .filter((linea) => !/^\s*--/.test(linea))
    .join("\n")
    .split(";")
    .map(normalizar)
    .filter(Boolean);

// Mayúsculas y sin comillas invertidas: no importa cómo se escriba, importa qué dice.
const plana = (sentencia) => sentencia.replace(/`/g, "").toUpperCase();
const buscar = (patron) => sentencias(M084).map(plana).filter((s) => patron.test(s));
const unica = (patron) => {
  const encontradas = buscar(patron);
  assert.equal(encontradas.length, 1, `se esperaba exactamente una sentencia que cumpla ${patron}`);
  return encontradas[0];
};

test("la migración 084 existe", () => {
  assert.ok(existsSync(new URL(M084, CARPETA)), `falta prisma/migrations_manual/${M084}: hay que crearla`);
});

test(`${M084}: lo primero que se ejecuta es SET SESSION lock_wait_timeout = 10`, () => {
  assert.equal(plana(sentencias(M084)[0]), "SET SESSION LOCK_WAIT_TIMEOUT = 10");
});

// Idempotencia: la relación completa entre el conteo, el IF y el PREPARE/EXECUTE/DEALLOCATE. Los nombres de las
// variables no se fijan: se extraen y se compara que sean los mismos en cada eslabón.
function cadena({ tabla, conteo, IF }) {
  const todas = sentencias(M084).map(plana);
  const iConteo = todas.findIndex((s) => conteo.test(s));
  assert.ok(iConteo >= 0, `no hay un SET @var = (SELECT COUNT(*) FROM information_schema.${tabla} WHERE ...)`);
  const [, variable, condiciones] = todas[iConteo].match(conteo);

  const iIf = todas.findIndex((s) => IF.test(s));
  assert.ok(iIf > iConteo, "falta el SET @sql = IF(@var = 0, '<DDL>', 'DO 0') después del conteo");
  const [, sql, variableDelIf] = todas[iIf].match(IF);
  assert.equal(variableDelIf, variable, "el IF tiene que usar la misma variable que el conteo");

  const iPrepare = todas.findIndex((s, i) => i > iIf && /^PREPARE \w+ FROM @\w+$/.test(s));
  assert.ok(iPrepare > iIf, "falta el PREPARE después del IF");
  const [, nombre, sqlDelPrepare] = todas[iPrepare].match(/^PREPARE (\w+) FROM @(\w+)$/);
  assert.equal(sqlDelPrepare, sql, "el PREPARE tiene que usar la misma variable de SQL que el IF");

  const iExecute = todas.findIndex((s, i) => i > iPrepare && s === `EXECUTE ${nombre}`);
  assert.ok(iExecute > iPrepare, `falta EXECUTE ${nombre.toLowerCase()} después del PREPARE`);
  const iDealloc = todas.findIndex((s, i) => i > iExecute && s === `DEALLOCATE PREPARE ${nombre}`);
  assert.ok(iDealloc > iExecute, `falta DEALLOCATE PREPARE ${nombre.toLowerCase()} después del EXECUTE`);
  return { condiciones };
}

const CONTEO_COLUMNA = /^SET @(\w+) = \( ?SELECT COUNT\(\*\) FROM INFORMATION_SCHEMA\.COLUMNS WHERE (.*?) ?\)$/;
const IF_COLUMNA =
  /^SET @(\w+) = IF\( ?@(\w+) = 0, 'ALTER TABLE SESIONES ADD COLUMN ORDEN_AT DATETIME NULL', 'DO 0' ?\)$/;
const CONTEO_INDICE = /^SET @(\w+) = \( ?SELECT COUNT\(\*\) FROM INFORMATION_SCHEMA\.STATISTICS WHERE (.*?) ?\)$/;
const IF_INDICE =
  /^SET @(\w+) = IF\( ?@(\w+) = 0, 'CREATE INDEX IDX_ORDEN_AT ON SESIONES ?\( ?ORDEN_AT ?\)', 'DO 0' ?\)$/;

test(`${M084}: la columna solo se agrega si el conteo en information_schema.COLUMNS da 0 (conteo, IF, PREPARE, EXECUTE y DEALLOCATE enlazados)`, () => {
  cadena({ tabla: "COLUMNS", conteo: CONTEO_COLUMNA, IF: IF_COLUMNA });
});

test(`${M084}: el conteo de la columna filtra por esquema actual, tabla sesiones y columna orden_at`, () => {
  const { condiciones } = cadena({ tabla: "COLUMNS", conteo: CONTEO_COLUMNA, IF: IF_COLUMNA });
  assert.match(condiciones, /TABLE_SCHEMA = DATABASE\(\)/);
  assert.match(condiciones, /TABLE_NAME = 'SESIONES'/);
  assert.match(condiciones, /COLUMN_NAME = 'ORDEN_AT'/);
});

test(`${M084}: el índice solo se crea si el conteo en information_schema.STATISTICS da 0 (conteo, IF, PREPARE, EXECUTE y DEALLOCATE enlazados)`, () => {
  cadena({ tabla: "STATISTICS", conteo: CONTEO_INDICE, IF: IF_INDICE });
});

test(`${M084}: el conteo del índice filtra por esquema actual, tabla sesiones e índice idx_orden_at`, () => {
  const { condiciones } = cadena({ tabla: "STATISTICS", conteo: CONTEO_INDICE, IF: IF_INDICE });
  assert.match(condiciones, /TABLE_SCHEMA = DATABASE\(\)/);
  assert.match(condiciones, /TABLE_NAME = 'SESIONES'/);
  assert.match(condiciones, /INDEX_NAME = 'IDX_ORDEN_AT'/);
});

test(`${M084}: hay exactamente dos PREPARE (columna e índice) y dos DEALLOCATE PREPARE`, () => {
  assert.equal(buscar(/^PREPARE /).length, 2);
  assert.equal(buscar(/^DEALLOCATE PREPARE /).length, 2);
});

// La lista hoy ordena por `sesion_inicio DESC` y MySQL deja los NULL al final: con una fecha vieja esas filas
// siguen al final y el orden de antes no cambia.
test(`${M084}: el relleno es COALESCE(sesion_inicio, '1000-01-01 00:00:00') solo donde orden_at es NULL`, () => {
  const sentencia = unica(/^UPDATE SESIONES SET ORDEN_AT/);
  assert.match(
    sentencia,
    /^UPDATE SESIONES SET ORDEN_AT = COALESCE\( ?SESION_INICIO, '1000-01-01 00:00:00' ?\) WHERE ORDEN_AT IS NULL$/,
  );
});

test(`${M084}: la columna se agrega antes del relleno, y el relleno antes de volverla NOT NULL`, () => {
  const todas = sentencias(M084).map(plana);
  const agregar = todas.findIndex((s) => IF_COLUMNA.test(s));
  const rellenar = todas.findIndex((s) => /^UPDATE SESIONES SET ORDEN_AT/.test(s));
  const endurecer = todas.findIndex((s) => /MODIFY (COLUMN )?ORDEN_AT/.test(s));
  assert.ok(agregar >= 0 && rellenar > agregar && endurecer > rellenar);
});

test(`${M084}: la columna queda DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP con MODIFY`, () => {
  const sentencia = unica(/MODIFY (COLUMN )?ORDEN_AT/);
  assert.match(sentencia, /^ALTER TABLE SESIONES MODIFY (COLUMN )?ORDEN_AT DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP$/);
});

test(`${M084}: no hay GRANT ni REVOKE (agente_ia ya lee toda la tabla y orden_at lo escribe el backend)`, () => {
  const todas = sentencias(M084);
  assert.equal(todas.filter((s) => /^(GRANT|REVOKE)\b/i.test(s)).length, 0);
});

test(`${M084}: el ALTER y el CREATE INDEX nunca se ejecutan sueltos (siempre vía PREPARE)`, () => {
  const sueltas = sentencias(M084).filter((s) => /^(ALTER TABLE|CREATE INDEX)\b/i.test(s));
  // El único ALTER directo permitido es el MODIFY, que es idempotente por naturaleza.
  for (const s of sueltas) assert.match(plana(s), /MODIFY (COLUMN )?ORDEN_AT/, `sentencia suelta: ${s}`);
});

test("schema.prisma: model chat_estado tiene orden_at DateTime @default(now()) @db.DateTime(0)", () => {
  const schema = readFileSync(SCHEMA, "utf8");
  const modelo = schema.match(/model chat_estado \{[\s\S]*?\n\}/);
  assert.ok(modelo, "no se encontró model chat_estado");
  assert.match(normalizar(modelo[0]), /orden_at DateTime @default\(now\(\)\) @db\.DateTime\(0\)/);
});

test('schema.prisma: model chat_estado tiene @@index([orden_at], map: "idx_orden_at")', () => {
  const schema = readFileSync(SCHEMA, "utf8");
  const modelo = schema.match(/model chat_estado \{[\s\S]*?\n\}/);
  assert.ok(modelo, "no se encontró model chat_estado");
  assert.match(normalizar(modelo[0]), /@@index\(\[orden_at\], map: "idx_orden_at"\)/);
});

// ---- Ejecución real en el MySQL local, sobre una base temporal (nunca sobre otra) ----

const BASE_TEMPORAL = `agencia_migracion_084_test_${process.pid}_${Date.now()}`;
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
  const args = [
    "--protocol=TCP",
    "-h", u.hostname.replace(/^\[|\]$/g, ""),
    "-P", u.port || "3306",
    "-u", decodeURIComponent(u.username),
    "-N", "-B",
  ];
  if (base) args.push(base);
  const r = spawnSync(MYSQL, args, {
    input: sql,
    encoding: "utf8",
    env: { ...process.env, MYSQL_PWD: decodeURIComponent(u.password) },
  });
  const salida = (r.stdout ?? "").replace(/\r\n/g, "\n").trim();
  return { codigo: r.status, salida, error: (r.stderr ?? "").trim() || String(r.error ?? "") };
}

function ok(sql, opciones) {
  const r = mysql(sql, opciones);
  assert.equal(r.codigo, 0, `mysql falló (código ${r.codigo}): ${r.error}`);
  return r.salida;
}

test(
  `${M084}: aplicada dos veces sobre una copia de sesiones termina bien, deja la columna NOT NULL, UN índice y rellena con sesion_inicio o 1000-01-01`,
  { skip: motivoDeSalto },
  () => {
    let creada = false;
    const baseOrigen = decodeURIComponent(new URL(urlBase).pathname.replace(/^\//, ""));
    try {
      ok(`CREATE DATABASE ${BASE_TEMPORAL};`);
      creada = true;
      ok(`CREATE TABLE sesiones LIKE \`${baseOrigen}\`.sesiones;`, { base: BASE_TEMPORAL });
      // Se simula SIEMPRE el estado de antes de la migración: la base de desarrollo puede estar ya migrada y la
      // copia con LIKE traería el índice y la columna.
      const existe = (consulta) => ok(consulta) !== "0";
      if (existe(`SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = '${BASE_TEMPORAL}' AND TABLE_NAME = 'sesiones' AND INDEX_NAME = 'idx_orden_at';`)) {
        ok("ALTER TABLE sesiones DROP INDEX idx_orden_at;", { base: BASE_TEMPORAL });
      }
      if (existe(`SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = '${BASE_TEMPORAL}' AND TABLE_NAME = 'sesiones' AND COLUMN_NAME = 'orden_at';`)) {
        ok("ALTER TABLE sesiones DROP COLUMN orden_at;", { base: BASE_TEMPORAL });
      }
      ok(
        "INSERT INTO sesiones (cliente_id, sesion_inicio) VALUES (1, '2026-01-01 10:00:00'), (2, '2026-02-02 11:30:00'), (3, NULL);",
        { base: BASE_TEMPORAL },
      );

      const sql = readFileSync(new URL(M084, CARPETA), "utf8");
      ok(sql, { base: BASE_TEMPORAL });
      ok(sql, { base: BASE_TEMPORAL });

      const columna = ok(
        `SELECT IS_NULLABLE, COLUMN_DEFAULT, COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = '${BASE_TEMPORAL}' AND TABLE_NAME = 'sesiones' AND COLUMN_NAME = 'orden_at';`,
      );
      const [nulo, defecto, tipo] = columna.split("\t");
      assert.equal(nulo, "NO");
      assert.match(defecto ?? "", /^CURRENT_TIMESTAMP/i);
      assert.match(tipo ?? "", /^datetime/i);

      const indices = ok(
        `SELECT COUNT(DISTINCT INDEX_NAME), COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = '${BASE_TEMPORAL}' AND TABLE_NAME = 'sesiones' AND INDEX_NAME = 'idx_orden_at';`,
      );
      assert.equal(indices, "1\t1", "tiene que haber un solo índice idx_orden_at, de una sola columna");

      const filas = ok("SELECT cliente_id, orden_at FROM sesiones ORDER BY cliente_id;", { base: BASE_TEMPORAL });
      assert.equal(filas, ["1\t2026-01-01 10:00:00", "2\t2026-02-02 11:30:00", "3\t1000-01-01 00:00:00"].join("\n"));
    } finally {
      if (creada) mysql(`DROP DATABASE IF EXISTS ${BASE_TEMPORAL};`);
    }
  },
);
