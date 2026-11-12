import { prisma } from "./prisma.js";

// Qué consultas (`chat_estado`) puede ver un usuario del panel, como filtro de Prisma.
// Se calcula con los datos de la BASE, nunca con el rol del token: un token vigente
// de un usuario dado de baja o con otro rol no debe abrir nada.
export const TODAS = Object.freeze({});
export const NINGUNA = Object.freeze({ id: Object.freeze({ in: Object.freeze([]) }) });

const SELECCION = { rol: true, vendedor_id: true, activo: true, deleted_at: true };

export async function alcanceDeConsultas(usuario, db = prisma) {
  const id = Number(usuario?.id);
  if (!Number.isInteger(id) || id <= 0) return NINGUNA;

  const fila = await db.usuarios.findUnique({ where: { id }, select: SELECCION });
  if (!fila || !fila.activo || fila.deleted_at) return NINGUNA;
  if (fila.rol === "admin") return TODAS;
  if (fila.rol === "asesor" && fila.vendedor_id != null) return { vendedor_id: fila.vendedor_id };
  return NINGUNA;
}
