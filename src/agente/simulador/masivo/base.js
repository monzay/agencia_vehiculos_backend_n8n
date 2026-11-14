// Prepara la base local `agencia_simulacion` de cero: la borra, la crea, le pone el esquema de Prisma,
// los permisos del usuario del agente y los datos que usan los casos. No importa Prisma al cargarse.
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { verificarBases, BASE_SIMULACION } from "./guardas.js";

const RAIZ = fileURLToPath(new URL("../../../../", import.meta.url));
const MIGRACIONES = path.join(RAIZ, "prisma", "migrations_manual");
const MYSQL_POR_DEFECTO = "C:\\Program Files\\MySQL\\MySQL Server 9.5\\bin\\mysql.exe";

// mysql.exe contra el MySQL local con las credenciales de `urlRoot`: la clave viaja por MYSQL_PWD, sin shell.
function ejecutorMysql(urlRoot) {
  const u = new URL(urlRoot);
  return async (sql, { base } = {}) => {
    const args = ["--protocol=TCP", "-h", u.hostname.replace(/^\[|\]$/g, ""), "-P", u.port || "3306", "-u", decodeURIComponent(u.username), "-N", "-B"];
    if (base) args.push(base);
    const r = spawnSync(process.env.MYSQL_BIN || MYSQL_POR_DEFECTO, args, {
      input: sql,
      encoding: "utf8",
      env: { ...process.env, MYSQL_PWD: decodeURIComponent(u.password) },
    });
    if (r.status !== 0) throw new Error(`mysql falló (código ${r.status}): ${(r.stderr ?? "").trim() || String(r.error ?? "")}`);
    return (r.stdout ?? "").trim();
  };
}

// Los GRANT/REVOKE de las migraciones manuales, apuntados a la base de simulación (sin CREATE USER).
function permisosDelAgente() {
  const sentencias = [];
  for (const archivo of readdirSync(MIGRACIONES).filter((f) => f.endsWith(".sql")).sort()) {
    const sinComentarios = readFileSync(path.join(MIGRACIONES, archivo), "utf8")
      .split("\n")
      .filter((linea) => !/^\s*--/.test(linea))
      .join("\n");
    for (const s of sinComentarios.split(";").map((x) => x.trim())) {
      if (/^(GRANT|REVOKE)\b/i.test(s)) sentencias.push(s.replaceAll("`agencia`.", `\`${BASE_SIMULACION}\`.`));
    }
  }
  return sentencias;
}

// El CLI de Prisma no tiene que salir a internet: sin telemetría ni avisos, y con las claves de IA vacías (dotenv no pisa variables que ya existen).
function aplicarEsquema(urlRoot) {
  const env = { ...process.env, DATABASE_URL: urlRoot, CHECKPOINT_DISABLE: "1", PRISMA_HIDE_UPDATE_MESSAGE: "1", ANTHROPIC_API_KEY: "", GROQ_API_KEY: "" };
  const cli = path.join(RAIZ, "node_modules", "prisma", "build", "index.js");
  const r = spawnSync(process.execPath, [cli, "db", "push", "--skip-generate", "--accept-data-loss"], { cwd: RAIZ, env, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`prisma db push falló (código ${r.status}): ${(r.stderr || r.stdout || String(r.error ?? "")).trim().slice(0, 2000)}`);
}

const DATOS = `
INSERT INTO vendedores (nombre, slug, activo, recibe_consultas) VALUES
  ('Juan Simulado', 'juan', 1, 1),
  ('Pepito Simulado', 'pepito', 1, 1),
  ('Ana Simulada', 'ana', 1, 1),
  ('Inactivo Simulado', 'inactivo', 0, 1);
INSERT INTO ubicacion (id, nombre, direccion) VALUES (1, 'Agencia Simulada', 'Calle Falsa 123, Jujuy');
INSERT INTO configuracion (clave, valor) VALUES ('reparticion_equitativa', '1');
INSERT INTO autos (ref, marca, modelo, anio, tipo, precio, disponible, vendido_at) VALUES
  ('SIM-01', 'Toyota', 'Corolla', 2019, 'usado', 18000000, 1, NULL),
  ('SIM-02', 'Volkswagen', 'Gol Trend', 2018, 'usado', 11000000, 1, NULL),
  ('SIM-03', 'Ford', 'Fiesta', 2017, 'usado', 9500000, 1, NULL),
  ('SIM-04', 'Chevrolet', 'Onix', 2021, 'usado', 16000000, 1, NULL),
  ('SIM-05', 'Renault', 'Sandero', 2020, 'usado', 12500000, 1, NULL),
  ('SIM-06', 'Fiat', 'Cronos', 2022, 'usado', 17000000, 0, NOW());
`;

export async function prepararBase({ urlRoot, urlAgente } = {}, { prohibidas, ejecutar } = {}) {
  // Lo primero, antes de ejecutar nada: si las URLs no son las de simulación, se aborta.
  verificarBases({ backend: urlRoot, agente: urlAgente }, { prohibidas });
  const sql = ejecutar ?? ejecutorMysql(urlRoot);

  await sql(`DROP DATABASE IF EXISTS \`${BASE_SIMULACION}\``);
  await sql(`CREATE DATABASE \`${BASE_SIMULACION}\``);
  aplicarEsquema(urlRoot);
  for (const permiso of permisosDelAgente()) await sql(permiso);
  await sql(DATOS, { base: BASE_SIMULACION });
}
