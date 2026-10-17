import { SESION_UTIL } from "../lib/consultas-utiles.js";

// Consultas abandonadas: el cliente arrancó el recorrido y dejó de responder.
// No se le escribe (decisión del 15/10/2026): pasadas 24 h sin mensajes, la que
// seguía "en calificación" queda fría. Las calientes y tibias conservan su
// calificación; las que cerraron (visita, "no sabe", derivadas a un vendedor)
// no se tocan, y un saludo suelto sigue como consulta general.
export const HORAS_SIN_RESPUESTA = 24;
const UNA_HORA_MS = 3_600_000;

export async function marcarFriasLasAbandonadas({ db, ahora = new Date() }) {
  const { count } = await db.chat_estado.updateMany({
    where: {
      ultimo_mensaje: { lt: new Date(ahora.getTime() - HORAS_SIN_RESPUESTA * UNA_HORA_MS) },
      visita_propuesta: null,
      disponibilidad: null,
      NOT: { requiere_vendedor: true },
      AND: [SESION_UTIL, { clasificacion: null }],
    },
    data: { clasificacion: "FRIO" },
  });
  return count;
}
