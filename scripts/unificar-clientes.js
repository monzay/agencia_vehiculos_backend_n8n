// Unifica las fichas de cliente que son la misma persona (una persona = una ficha, migración 073).
//
// Uso (desde web/backend):
//   node scripts/unificar-clientes.js             → PRUEBA: dice qué haría y no escribe nada
//   node scripts/unificar-clientes.js --aplicar   → lo hace y deja el informe en backups/
//   --produccion                                  → obligatorio si DATABASE_URL no es localhost
//
// ANTES de --aplicar:
//   - Hacé un backup de la base. Cada fusión queda anotada en cliente_fusiones y se puede deshacer a mano,
//     pero el backup es lo que cubre todo lo demás.
//   - Corrélo con el bot en pausa (sin tráfico de WhatsApp): una fila que el bot escribe mientras se fusiona
//     puede quedar colgada de la ficha archivada.
//
// Pasos de --aplicar (cada uno se puede repetir sin duplicar nada):
//   0. vincula en cliente_canales los WhatsApp/Facebook/Instagram que solo están en clientes.canal_id
//      (si la 074 ya sacó la columna, el paso se saltea solo). Los que ya son de otra ficha no se pueden
//      vincular: se informan, y cuentan como el WhatsApp de su ficha para unirla por teléfono
//   1. normaliza los teléfonos a los 10 dígitos nacionales
//   2. normaliza los DNI: sin puntos, espacios ni guiones y en mayúsculas (un pasaporte con letras las conserva)
//   3. fusiona las fichas del plan, cada una en su transacción; si una falla, la informa y sigue
// Los dudosos (un teléfono compartido por DNI distintos) no se tocan. Tampoco las fichas cuyo DNI no es de
// 7 a 9 dígitos (un pasaporte, "S/D"): quedan en "A revisar a mano" y no se unen por nada. Nunca borra filas:
// fusionar es archivar la ficha de origen y anotar la fusión en cliente_fusiones.
//
// DATOS PERSONALES: el informe JSON (backups/) y la tabla cliente_fusiones guardan nombres, teléfonos y DNI de
// los clientes. El informe se escribe con permisos 0o600; guardalo y tratalo como la base misma (no lo subas
// al repositorio ni lo compartas).
//
// Se corre ANTES de la 074 (que exige que no queden DNI repetidos); repetirlo después no rompe nada.
// El informe queda en <raíz del proyecto>/backups/unificacion-clientes-<fecha>-<hora>.json.

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { baseAutorizada, destinoDeLaBase } from "../src/lib/base-local.js";

const OPCIONES = ["--aplicar", "--produccion"];
const ARCHIVO_ENV = fileURLToPath(new URL("../.env", import.meta.url));
const CARPETA_INFORMES = fileURLToPath(new URL("../../../backups/", import.meta.url));

const argumentos = process.argv.slice(2);
const desconocidas = argumentos.filter((argumento) => !OPCIONES.includes(argumento));
if (desconocidas.length) {
  console.error(`Opción desconocida: ${desconocidas.join(" ")}\nOpciones: ${OPCIONES.join(" ")}`);
  process.exit(1);
}
const aplicar = argumentos.includes("--aplicar");
const produccion = argumentos.includes("--produccion");

// Lo que ya está en el entorno manda sobre el .env (process.loadEnvFile no lo pisa).
if (existsSync(ARCHIVO_ENV)) process.loadEnvFile(ARCHIVO_ENV);

const url = process.env.DATABASE_URL;
if (!baseAutorizada(url, { produccion })) {
  console.error(`DATABASE_URL apunta a ${destinoDeLaBase(url)}, que no es una base local.\nSi de verdad querés correrlo contra esa base, agregá --produccion.`);
  process.exit(1);
}

const { prisma } = await import("../src/lib/prisma.js");
const { ejecutarUnificacion, textoDelInforme, guardarInforme } = await import("../src/services/unificacion-clientes.service.js");

const base = destinoDeLaBase(url);

// Si el informe no se puede guardar, lo hecho igual está en el texto de la consola.
function guardarLoHecho(resultado) {
  try {
    console.log(`\nInforme: ${guardarInforme(resultado, { carpeta: CARPETA_INFORMES, base })}`);
  } catch (e) {
    console.error(`\nNo se pudo guardar el informe en ${CARPETA_INFORMES} (${e.message}). Lo hecho está en el texto de arriba.`);
    process.exitCode = 1;
  }
}

async function main() {
  const resultado = await ejecutarUnificacion({ db: prisma, aplicar });
  console.log(textoDelInforme(resultado, { base }));

  if (aplicar) guardarLoHecho(resultado);
  else console.log("\nEra una prueba. Para hacerlo: node scripts/unificar-clientes.js --aplicar");

  if (resultado.errores.length) process.exitCode = 1;
}

try {
  await main();
} catch (e) {
  console.error("✖ No se pudo unificar:", e.message);
  if (aplicar) console.error("Algunos pasos pueden haber quedado hechos; el script se puede repetir.");
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
