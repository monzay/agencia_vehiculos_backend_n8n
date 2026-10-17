import { prisma } from "../lib/prisma.js";
import { costoClaude, costoGroq, estadoTope, inicioMesAR } from "../lib/ia-costos.js";
import { estadoWhatsApp } from "../lib/whatsapp-costos.js";
import { PASO_AGENTE } from "../agente/pasos.js";

// Gasto de IA de la agencia: cada llamada a Claude o a Groq deja una fila en
// `ia_consumos` con su costo, y el gasto del mes es la suma desde el día 1
// (hora AR). El tope lo fija solo el proveedor en el servidor; no hay endpoint
// para cambiarlo.

const TOPE_POR_DEFECTO_USD = 10;
const AVISO_POR_DEFECTO = 80;

export function topeConfigurado() {
  const tope = Number(process.env.IA_TOPE_USD_MES);
  const aviso = Number(process.env.IA_AVISO_PORCENTAJE);
  return {
    topeUsd: tope > 0 ? tope : TOPE_POR_DEFECTO_USD,
    avisoPorcentaje: aviso > 0 && aviso < 100 ? aviso : AVISO_POR_DEFECTO,
  };
}

export async function gastoDelMes(ahora = new Date(), tx = prisma) {
  const { _sum } = await tx.ia_consumos.aggregate({
    _sum: { costo_usd: true },
    where: { created_at: { gte: inicioMesAR(ahora) } },
  });
  return Number(_sum.costo_usd ?? 0);
}

// Mensajes que mandó el bot este mes por WhatsApp: los que Meta cuenta contra los
// 1.000 gratis. Una respuesta = un mensaje; las reacciones 👍 van con otro paso y
// no cuentan. Es una estimación: el mes de Meta puede no cortar a la misma hora y
// una respuesta de más de 1.024 caracteres con fotos sale en 2 mensajes (cuenta 1).
export function mensajesWhatsAppDelMes(ahora = new Date(), tx = prisma) {
  return tx.historial_mensajes.count({
    where: { direccion: "saliente", paso_nodo: PASO_AGENTE, created_at: { gte: inicioMesAR(ahora) } },
  });
}

export async function resumenGastoIa(ahora = new Date()) {
  const { topeUsd, avisoPorcentaje } = topeConfigurado();
  const [gastoUsd, enviados] = await Promise.all([gastoDelMes(ahora), mensajesWhatsAppDelMes(ahora)]);
  return {
    gastoUsd: Math.round(gastoUsd * 10_000) / 10_000,
    topeUsd,
    avisoPorcentaje,
    desde: inicioMesAR(ahora).toISOString(),
    ...estadoTope({ gastoUsd, topeUsd, avisoPorcentaje }),
    whatsapp: estadoWhatsApp({ enviados }),
  };
}

// `created_at` se manda explícito (UTC) para no depender de la zona horaria
// del servidor de base de datos.
export function registrarConsumoClaude({ sesionId = null, clienteId = null, modelo, usage }, tx = prisma) {
  return tx.ia_consumos.create({
    data: {
      sesion_id: sesionId,
      cliente_id: clienteId,
      proveedor: "claude",
      modelo,
      input_tokens: usage?.input_tokens ?? 0,
      cache_creation_tokens: usage?.cache_creation_input_tokens ?? 0,
      cache_read_tokens: usage?.cache_read_input_tokens ?? 0,
      output_tokens: usage?.output_tokens ?? 0,
      costo_usd: costoClaude(usage),
      created_at: new Date(),
    },
  });
}

export function registrarConsumoGroq({ sesionId = null, clienteId = null, modelo, segundos }, tx = prisma) {
  return tx.ia_consumos.create({
    data: {
      sesion_id: sesionId,
      cliente_id: clienteId,
      proveedor: "groq",
      modelo,
      segundos_audio: segundos,
      costo_usd: costoGroq(segundos),
      created_at: new Date(),
    },
  });
}
