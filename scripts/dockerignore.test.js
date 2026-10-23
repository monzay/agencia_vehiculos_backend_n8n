import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

// El Dockerfile hace `COPY prisma ./prisma`: lo que no esté en .dockerignore viaja en la imagen. En prisma/ quedan
// los volcados de la base (`backup-produccion-*.sql`, con datos reales) y tienen que quedar afuera. Tampoco se puede
// dejar afuera por error lo que la imagen necesita: `prisma/schema.prisma` (el Dockerfile corre `prisma generate`) y
// `prisma/aiven-ca.pem` (la URL de producción lo referencia con sslcert=/app/prisma/aiven-ca.pem).

const RAIZ = new URL("../", import.meta.url);
const patrones = readFileSync(new URL(".dockerignore", RAIZ), "utf8")
  .split(/\r?\n/)
  .map((linea) => linea.trim())
  .filter((linea) => linea && !linea.startsWith("#"));

const COMODINES = { "**/": "(?:.*/)?", "**": ".*", "*": "[^/]*", "?": "[^/]" };
const COMODINES_O_ESPECIALES = /\*\*\/|\*\*|\*|\?|[.+^${}()|[\]\\]/g;

// Un patrón de .dockerignore como regex: `**` cruza carpetas, `*` y `?` no, y un patrón vale también para lo de adentro.
function patronARegex(patron) {
  const cuerpo = patron.replace(COMODINES_O_ESPECIALES, (token) => COMODINES[token] ?? `\\${token}`);
  return new RegExp(`^${cuerpo}(?:/.*)?$`);
}

// Gana la última línea que coincide; `!patron` vuelve a incluir.
const quedaAfuera = (ruta) =>
  patrones.reduce((afuera, patron) => {
    const incluye = patron.startsWith("!");
    return patronARegex(incluye ? patron.slice(1) : patron).test(ruta) ? !incluye : afuera;
  }, false);

test(".dockerignore excluye los volcados de la base: prisma/*.sql y **/backup-*", () => {
  assert.ok(patrones.includes("prisma/*.sql"), "falta prisma/*.sql");
  assert.ok(patrones.includes("**/backup-*"), "falta **/backup-*");
});

test("los volcados quedan afuera de la imagen, estén donde estén", () => {
  const volcados = [
    "prisma/backup-produccion-2026-10-03T21-57-40.sql",
    "prisma/otro-volcado.sql",
    "backup-produccion.sql",
    "scripts/backup-2026-10-03.json",
  ];

  for (const ruta of volcados) assert.equal(quedaAfuera(ruta), true, `${ruta} viajaría en la imagen`);
});

test("no deja afuera lo que la imagen necesita: el esquema de Prisma, el certificado de Aiven y todo src/", () => {
  const necesarios = ["package.json", "package-lock.json", "prisma/schema.prisma", "prisma/aiven-ca.pem"];
  const deSrc = readdirSync(new URL("src/", RAIZ), { recursive: true }).map((ruta) => `src/${ruta.replaceAll("\\", "/")}`);

  for (const ruta of [...necesarios, ...deSrc]) assert.equal(quedaAfuera(ruta), false, `${ruta} quedaría fuera de la imagen`);
});
