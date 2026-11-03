import { error } from "../lib/contrato-campos.js";
import { vencida } from "../lib/senas.js";

// Qué pasó con una consulta después de Avanzar: si ya tiene un trámite o una seña.
// Un trámite o una seña cancelados no cuentan: la consulta puede volver a avanzar.

const VIGENTE = { deleted_at: null };

export const INCLUDE_AVANCE = {
  tramites: { where: VIGENTE, select: { id: true, modalidad: true, estado: true }, orderBy: { id: "desc" }, take: 1 },
  senas: {
    where: { ...VIGENTE, estado: { in: ["vigente", "convertida"] } },
    select: { id: true, estado: true, vence: true },
    orderBy: { id: "desc" },
    take: 1,
  },
};

/**
 * @param {{ tramites?: object[], senas?: object[] }} sesion leída con `INCLUDE_AVANCE`
 * @returns {{ tipo: "tramite"|"sena", id: number, modalidad?: string, estado: string }|null}
 */
export function avanceDeConsulta({ tramites = [], senas = [] }) {
  const [tramite] = tramites;
  if (tramite) return { tipo: "tramite", id: tramite.id, modalidad: tramite.modalidad, estado: tramite.estado };

  const [sena] = senas;
  if (sena) return { tipo: "sena", id: sena.id, estado: vencida(sena) ? "vencida" : sena.estado };
  return null;
}

/**
 * Valida la consulta de la que nace un trámite o una seña.
 * @returns {Promise<number|null>} el id, o null si no viene de una consulta
 */
export async function sesionParaAvanzar(valor, tx) {
  if (valor === undefined || valor === null || valor === "") return null;

  const id = Number(valor);
  if (!Number.isInteger(id) || id <= 0) throw error("La consulta no es válida.");

  const sesion = await tx.chat_estado.findUnique({ where: { id }, select: { id: true, ...INCLUDE_AVANCE } });
  if (!sesion) throw error("Esa consulta no existe.", 404);
  if (avanceDeConsulta(sesion)) throw error("Esa consulta ya tiene un trámite o una seña.", 409);
  return id;
}
