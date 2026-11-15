// De qué temas del recorrido de venta pregunta un mensaje de la asesora, y cuáles quedaron
// sin contestar. Lo usa el orquestador (producción) y el simulador.

// Temas de calificación, en el orden del recorrido.
export const TEMAS = [
  ["pago", /contado|financ|forma de pago|c[oó]mo (lo |la )?pag/i],
  ["anticipo", /anticipo|entrega inicial/i],
  ["recibo", /recibo|garante/i],
  ["usado", /\busado\b|parte de pago/i],
  ["usado_kms", /kil[oó]metr|\bkms?\b/i],
  ["usado_detalles", /\bestado\b|detalle|choque|service/i],
  ["usado_precio", /cu[aá]nto ped[ií]s|precio ped|cu[aá]nto quer[eé]s por/i],
  ["decisor", /decid|consult[aá]s|con alguien|vos sol[oa]/i],
  ["visita", /venir|vuelta|pas(ar|ás|arte|es)\b|acerc|visit/i],
];

// Temas de las preguntas del mensaje (las afirmaciones no cuentan).
export function temasPreguntados(texto) {
  const preguntas = String(texto ?? "").match(/¿?[^.!?¿]*\?/g) ?? [];
  return preguntas.flatMap((p) => TEMAS.filter(([, re]) => re.test(p)).map(([tema]) => tema));
}

import { PASO_HUMANO } from "./pasos.js";

// Solo los temas del recorrido: cómo se nombran al IA y qué dato "pendiente" (ver calificacion.js › pendientes) cierran.
const DEL_RECORRIDO = {
  pago: { palabras: "forma de pago", pendiente: /^forma de pago/ },
  anticipo: { palabras: "anticipo", pendiente: /^anticipo/ },
  recibo: { palabras: "recibo o garante", pendiente: /^recibo/ },
  usado: { palabras: "usado", pendiente: /usado/ },
  decisor: { palabras: "quién decide", pendiente: /^quién decide/ },
  visita: { palabras: "visita", pendiente: /^cuándo puede venir/ },
};


/**
 * Los temas por los que preguntó el ÚLTIMO mensaje de la asesora y que siguen pendientes: si el cliente
 * escribe otra cosa, no hay que repetirlos. `historial` son filas { direccion, mensaje, paso_nodo? } más nuevas primero.
 * @returns {string[]} los temas en palabras ("forma de pago", "anticipo", "recibo o garante", …)
 */
export function temasSinContestar(historial, faltan) {
  const ultimo = (historial ?? []).find((h) => h.direccion === "saliente" && h.paso_nodo !== PASO_HUMANO);
  if (!ultimo) return [];
  const preguntados = temasPreguntados(ultimo.mensaje);
  return Object.keys(DEL_RECORRIDO)
    .filter((tema) => preguntados.includes(tema))
    .filter((tema) => (faltan ?? []).some((f) => DEL_RECORRIDO[tema].pendiente.test(f)))
    .map((tema) => DEL_RECORRIDO[tema].palabras);
}

/**
 * La lista de lo que falta, con una marca en lo que el último mensaje de la asesora ya preguntó: así
 * "seguí con lo primero que falta" no la lleva a repetir esa pregunta cuando el cliente preguntó otra cosa.
 */
export function marcarPreguntados(faltan, temas) {
  const regex = Object.values(DEL_RECORRIDO).filter((t) => (temas ?? []).includes(t.palabras)).map((t) => t.pendiente);
  return (faltan ?? []).map((f) => (regex.some((re) => re.test(f)) ? `${f} (ya la preguntaste en tu último mensaje: no la repitas ahora)` : f));
}
