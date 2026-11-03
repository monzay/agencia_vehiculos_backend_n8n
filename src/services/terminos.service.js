import { prisma } from "../lib/prisma.js";

// Texto de privacidad de la agencia (página pública /privacidad). Cada publicación es
// una versión nueva: las anteriores no se tocan porque los consentimientos del bot
// apuntan a la versión que el cliente aceptó (Ley 25.326). Es texto plano: el front lo
// muestra como texto, nunca como HTML.

export const MAX_TEXTO_TERMINOS = 50_000;

function error(mensaje) {
  return Object.assign(new Error(mensaje), { status: 400 });
}

// Sin caracteres de control ni invisibles (salvo el salto de línea), con saltos unificados.
function limpiar(texto) {
  return texto
    .replace(/\r\n?/g, "\n")
    .replace(/[\p{Cf}]|[^\P{Cc}\n]/gu, "")
    .trim();
}

/** La fila de la versión vigente (la última sin archivar), tal como está en la base. */
export const versionVigente = (db = prisma) => db.terminos_versiones.findFirst({ where: { deleted_at: null }, orderBy: { id: "desc" } });

const comoVigente = (fila) => ({ version: fila.id, texto: fila.texto, publicado: new Date(fila.created_at).toISOString() });

/** La versión vigente (la última sin archivar) o null si la agencia no publicó ninguna. */
export async function terminosVigentes(db = prisma) {
  const fila = await versionVigente(db);
  return fila ? comoVigente(fila) : null;
}

/** Publica una versión nueva y la devuelve como vigente. Lanza 400 si el texto no sirve. */
export async function publicarTerminos({ texto, publicadoPor }, db = prisma) {
  if (typeof texto !== "string") throw error("El texto es obligatorio.");
  const limpio = limpiar(texto);
  if (!limpio) throw error("El texto es obligatorio.");
  if (limpio.length > MAX_TEXTO_TERMINOS) throw error(`El texto no puede superar los ${MAX_TEXTO_TERMINOS} caracteres.`);
  const fila = await db.terminos_versiones.create({
    data: { texto: limpio, publicado_por: typeof publicadoPor === "string" ? publicadoPor.slice(0, 120) : null },
  });
  return comoVigente(fila);
}
