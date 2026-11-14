import { puntaje, clasificar } from "./calificacion.js";
import { descripcionDelAuto } from "./auto-publico.js";

// Otro auto dentro de la misma consulta (decisión del 14/11/2026, cambio huecos-del-bot;
// reemplaza la de una consulta por auto del 31/10/2026): si un cliente que ya consulta por
// un auto se interesa en otro, la consulta sigue siendo la misma. Cambia el auto, se
// recalcula la temperatura y el asesor recibe un aviso con el auto de antes y el de ahora.
// No se tocan las respuestas, el usado, la visita, el asesor, los trámites ni las señas.
// Corre con el usuario de base del backend: el de la IA no puede escribir consultas.

const MAX_MOTIVO = 120;

const temperatura = (datos) => ({ score: puntaje(datos), clasificacion: clasificar(datos) });
const buscarAuto = (db, id) => db.autos.findFirst({ where: { id }, select: { id: true, marca: true, modelo: true, anio: true } });

// Devuelve siempre el id de la consulta: es la misma que llegó.
export async function cambiarAuto({ db, sesionId, ahora }, autoId) {
  const actual = await db.chat_estado.findUnique({ where: { id: sesionId } });
  if (!actual || actual.auto_id === autoId) return sesionId;
  const conAuto = temperatura({ ...actual, auto_id: autoId });
  if (actual.auto_id == null) {
    await db.chat_estado.update({ where: { id: sesionId }, data: { auto_id: autoId, ...conAuto } });
    return sesionId;
  }
  const [nuevo, anterior] = await Promise.all([buscarAuto(db, autoId), buscarAuto(db, actual.auto_id)]);
  const motivo = `Ahora le interesa ${nuevo ? descripcionDelAuto(nuevo) : "otro auto"}, antes ${anterior ? descripcionDelAuto(anterior) : "otro auto"}`.slice(0, MAX_MOTIVO);
  await db.chat_estado.update({
    where: { id: sesionId },
    data: {
      auto_id: autoId,
      ...conAuto,
      requiere_vendedor: true,
      requiere_vendedor_motivo: motivo,
      requiere_vendedor_at: ahora,
      atendido_at: null,
      atendido_por: null,
      orden_at: ahora,
    },
  });
  return sesionId;
}
