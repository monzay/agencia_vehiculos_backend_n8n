import { prisma } from "../lib/prisma.js";

// n8n avisa cuando Meta rechaza una respuesta del bot. Sin esto el cliente queda sin
// respuesta y nadie se entera: la consulta queda con el aviso para el vendedor, el mismo
// que ve el panel en Consultas.

const MOTIVO = "No se pudo enviar la respuesta por WhatsApp";

function error(mensaje, status) {
  return Object.assign(new Error(mensaje), { status });
}

/**
 * @param {{ para: string }} datos el número de WhatsApp al que no se pudo enviar
 * @returns {Promise<{ marcado: boolean, sesionId?: number }>}
 */
export async function registrarEnvioFallido({ para } = {}, db = prisma) {
  const telefono = String(para ?? "").replace(/\D/g, "");
  if (!/^\d{8,15}$/.test(telefono)) throw error("El número no es válido.", 400);

  const canal = await db.cliente_canales.findFirst({ where: { canal: "whatsapp", identificador: telefono }, select: { cliente_id: true } });
  if (!canal) return { marcado: false };
  const sesion = await db.chat_estado.findFirst({ where: { cliente_id: canal.cliente_id }, orderBy: { id: "desc" }, select: { id: true } });
  if (!sesion) return { marcado: false };

  await db.chat_estado.update({
    where: { id: sesion.id },
    data: { requiere_vendedor: true, requiere_vendedor_motivo: MOTIVO, requiere_vendedor_at: new Date() },
  });
  return { marcado: true, sesionId: sesion.id };
}
