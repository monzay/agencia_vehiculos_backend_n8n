// Aplica a la base de PRODUCCION las migraciones que le faltan (055..056).
//
// Antes de tocar nada hace un backup y verifica que sirva. Si el backup falla,
// no sigue. Si una migracion falla, se detiene ahi y te dice cual: las que ya
// entraron quedan aplicadas, y como son aditivas el sistema sigue funcionando
// con el codigo viejo.
//
// Uso (desde web/backend):
//   MYSQL_PWD="<password de avnadmin>" node prisma/desplegar-produccion.mjs
//
// Agregar --aplicar para que escriba de verdad. Sin ese flag solo informa que
// haria, sin tocar la base.

import { execFileSync } from "node:child_process";
import { readdirSync, statSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const AQUI = dirname(fileURLToPath(import.meta.url));
const HOST = "mysql-313d9fe5-agenciaautomatizacion1.j.aivencloud.com";
const PUERTO = "26884";
const USUARIO = "avnadmin";
const BASE = "agencia";
const CA = join(AQUI, "aiven-ca.pem");
const MYSQLDUMP = process.env.MYSQLDUMP || "C:/Program Files/MySQL/MySQL Server 9.5/bin/mysqldump.exe";

const APLICAR = process.argv.includes("--aplicar");
const URL = `mysql://${USUARIO}@${HOST}:${PUERTO}/${BASE}?sslaccept=strict&sslcert=${CA}`;

if (!process.env.MYSQL_PWD) {
  console.error("Falta MYSQL_PWD. Uso:\n  MYSQL_PWD=\"<password>\" node prisma/desplegar-produccion.mjs --aplicar");
  process.exit(1);
}

const urlConClave = URL.replace(`${USUARIO}@`, `${USUARIO}:${encodeURIComponent(process.env.MYSQL_PWD)}@`);
const prisma = new PrismaClient({ datasources: { db: { url: urlConClave } } });

const salir = async (codigo) => {
  await prisma.$disconnect();
  process.exit(codigo);
};

// ── 1. Que migraciones faltan de verdad ──
const columnas = await prisma.$queryRawUnsafe(
  `SELECT TABLE_NAME t, COLUMN_NAME c, COLUMN_TYPE ty FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ?`,
  BASE
);
const tablas = new Set(columnas.map((r) => r.t));
const tipo = (t, c) => columnas.find((r) => r.t === t && r.c === c)?.ty ?? "";

// La ultima migracion de la tanda deja esta huella; si ya esta, no hay nada que hacer.
const tieneVendido = tipo("consignacion_ingresos", "estado").includes("'vendido'");
const tieneDominio = Boolean(tipo("autos", "dominio"));
if (tieneVendido && tieneDominio) {
  console.log("La base ya tiene aplicadas las migraciones 055..056. No hay nada que hacer.");
  await salir(0);
}
// La tanda anterior (048..054) tiene que estar: si falta, la base no esta donde se espera.
if (!tipo("consignacion_ingresos", "estado_at")) {
  console.error("ATENCION: falta la tanda 048..054. Esta base no esta donde se espera; revisar antes de seguir.");
  await salir(1);
}
// A medio aplicar (alguna de la tanda ya entro) no se reintenta a ciegas.
if (tieneVendido || tieneDominio) {
  console.error("ATENCION: la tanda 055..056 esta aplicada a medias. Revisar a mano cual falta.");
  await salir(1);
}

const dir = join(AQUI, "migrations_manual");
const pendientes = readdirSync(dir).filter((f) => /^05[56]_.*\.sql$/.test(f)).sort();

console.log(`Base: ${BASE} en ${HOST}`);
console.log(`Tablas hoy: ${tablas.size}`);
console.log(`Migraciones a aplicar: ${pendientes.length}\n${pendientes.map((f) => "  - " + f).join("\n")}\n`);

if (!APLICAR) {
  console.log("Modo informe. Para aplicarlas de verdad agrega --aplicar");
  await salir(0);
}

// ── 2. Backup, y no se sigue sin el ──
const sello = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const destino = join(AQUI, `backup-produccion-${sello}.sql`);
console.log(`Backup -> ${destino}`);

try {
  const sql = execFileSync(
    MYSQLDUMP,
    ["-h", HOST, "-P", PUERTO, "-u", USUARIO, "--ssl-mode=REQUIRED", "--single-transaction",
     "--routines", "--triggers", "--events", "--databases", BASE],
    { encoding: "buffer", maxBuffer: 512 * 1024 * 1024 }
  );
  const { writeFileSync } = await import("node:fs");
  writeFileSync(destino, sql);
} catch (e) {
  console.error(`El backup fallo, NO se aplica nada: ${e.message.split("\n")[0]}`);
  await salir(1);
}

// Un backup que no se puede verificar no es un backup.
const texto = readFileSync(destino, "utf8");
const creaciones = (texto.match(/^CREATE TABLE/gm) || []).length;
const cierre = /Dump completed/.test(texto);
console.log(`  ${(statSync(destino).size / 1024 / 1024).toFixed(2)} MB · ${creaciones} tablas · ${cierre ? "completo" : "INCOMPLETO"}`);

if (!cierre || creaciones < tablas.size) {
  console.error("El backup salio incompleto. NO se aplica nada. Revisalo antes de reintentar.");
  await salir(1);
}

// ── 3. Las migraciones, en orden, parando en la primera que falle ──
// Se llama al CLI de Prisma por Node, no por npx. Con `shell: true` el
// interprete de Windows corta la URL en el "&" de "&sslcert="; y sin shell,
// Node se niega a ejecutar el npx.cmd. Invocar el .js directamente evita las
// dos cosas: argumentos enteros y ningun shell de por medio.
const { createRequire } = await import("node:module");
const PRISMA_CLI = createRequire(import.meta.url).resolve("prisma/build/index.js");

console.log("\nAplicando:");
for (const archivo of pendientes) {
  try {
    execFileSync(process.execPath, [PRISMA_CLI, "db", "execute", "--url", urlConClave, "--file", join(dir, archivo)], {
      cwd: join(AQUI, ".."),
      stdio: "pipe",
    });
    console.log(`  OK    ${archivo}`);
  } catch (e) {
    // El mensaje de la excepcion importa tanto como stderr: si el fallo es al
    // lanzar el proceso, stderr viene vacio y sin esto no se ve nada.
    const detalle = [e.stderr?.toString(), e.stdout?.toString(), e.message]
      .filter(Boolean)
      .join(" | ")
      .trim()
      .split("\n")
      .slice(-4)
      .join(" | ");
    console.error(`  FALLA ${archivo}\n        ${detalle}`);
    console.error(`\nSe detuvo aca. Las anteriores quedaron aplicadas (son aditivas, el sistema sigue andando).`);
    console.error(`Para volver atras del todo: restaurar ${destino}`);
    await salir(1);
  }
}

// ── 4. Verificacion ──
const despues = await prisma.$queryRawUnsafe(
  `SELECT TABLE_NAME t, COLUMN_NAME c, COLUMN_TYPE ty FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ?`,
  BASE
);
const tablasDespues = new Set(despues.map((r) => r.t));
const tipoDespues = (t, c) => despues.find((r) => r.t === t && r.c === c)?.ty ?? "";

const controles = [
  ["055 ingresos.estado con vendido", tipoDespues("consignacion_ingresos", "estado").includes("'vendido'")],
  ["056 autos.dominio/motor/chasis", ["dominio", "motor", "chasis"].every((c) => tipoDespues("autos", c))],
  ["los datos viejos siguen", tablasDespues.has("clientes") && tablasDespues.has("autos") && tablasDespues.has("sesiones")],
];

console.log("\nVerificacion:");
let fallos = 0;
for (const [etiqueta, ok] of controles) {
  if (!ok) fallos++;
  console.log(`  ${ok ? "OK   " : "FALLA"} ${etiqueta}`);
}

console.log(`\n${tablas.size} tablas antes -> ${tablasDespues.size} despues`);
console.log(fallos === 0 ? "\nLISTO. La base quedo con las migraciones 055..056." : `\n${fallos} PROBLEMAS`);
console.log(`Backup guardado en: ${destino}`);
await salir(fallos === 0 ? 0 : 1);
