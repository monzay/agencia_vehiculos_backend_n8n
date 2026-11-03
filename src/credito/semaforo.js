// Resume la respuesta de la Central de Deudores del BCRA en un semáforo para el asesor.
// Es SOLO INFORMATIVO: no suma puntos ni cambia la temperatura de la consulta. El BCRA
// no es una financiera (no ve ingresos ni el scoring de una prendaria): un rojo no es un
// rechazo y un verde no es una aprobación.
//
// Se mira solo el último período informado: alguien que se puso al día no queda marcado.
// "En revisión" no empeora nada por sí solo.

const SITUACION_GRAVE = 3;
const SITUACION_LEVE = 2;

const esRoja = (e) => e.situacion >= SITUACION_GRAVE || e.irrecDisposicionTecnica || e.situacionJuridica || e.procesoJud;
const esAmarilla = (e) => e.situacion === SITUACION_LEVE || e.refinanciaciones || e.recategorizacionOblig;

function ultimoPeriodo(deudas) {
  const periodos = deudas?.periodos ?? [];
  return periodos.reduce((ultimo, p) => (!ultimo || String(p.periodo) > String(ultimo.periodo) ? p : ultimo), null);
}

function tieneChequeSinFondosImpago(cheques) {
  return (cheques?.causales ?? [])
    .filter((c) => /sin fondos/i.test(c.causal ?? ""))
    .flatMap((c) => c.entidades ?? [])
    .flatMap((e) => e.detalle ?? [])
    .some((d) => !d.fechaPago);
}

/**
 * @param {{ deudas: object|null, cheques: object|null }} respuesta `results` de /Deudas y de
 *   /Deudas/ChequesRechazados (null si el BCRA respondió 404).
 * @returns {{ semaforo: "verde"|"amarillo"|"rojo"|"sin_datos", peorSituacion: number|null, periodo: string|null }}
 */
export function semaforoCrediticio({ deudas, cheques }) {
  const periodo = ultimoPeriodo(deudas);
  const entidades = periodo?.entidades ?? [];
  const chequeImpago = tieneChequeSinFondosImpago(cheques);
  const peorSituacion = entidades.length ? Math.max(...entidades.map((e) => Number(e.situacion) || 0)) : null;
  const resumen = { peorSituacion, periodo: entidades.length ? String(periodo.periodo) : null };

  if (chequeImpago || entidades.some(esRoja)) return { semaforo: "rojo", ...resumen };
  if (entidades.some(esAmarilla)) return { semaforo: "amarillo", ...resumen };
  if (entidades.length) return { semaforo: "verde", ...resumen };
  return { semaforo: "sin_datos", ...resumen };
}
