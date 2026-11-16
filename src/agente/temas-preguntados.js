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

// Los campos de registrar_calificacion que contestan cada tema del recorrido.
const CAMPOS_DEL_TEMA = {
  pago: ["pago_tipo"],
  anticipo: ["anticipo"],
  recibo: ["tiene_recibo_o_garante"],
  usado: ["entrega_usado", "usado_marca", "usado_modelo", "usado_anio", "usado_kms", "usado_detalles", "usado_precio_pedido", "usado_precio_no_sabe"],
  decisor: ["decisor", "decisor_con"],
  visita: ["visita_propuesta", "disponibilidad"],
};
const TEMA_DE_LAS_PALABRAS = Object.fromEntries(Object.entries(DEL_RECORRIDO).map(([tema, { palabras }]) => [palabras, tema]));

/** De los temas (en palabras) deja los que la IA NO guardó en este turno con registrar_calificacion. */
export const temasSinGuardar = (temas, camposGuardados) =>
  (temas ?? []).filter((t) => !CAMPOS_DEL_TEMA[TEMA_DE_LAS_PALABRAS[t]]?.some((campo) => (camposGuardados ?? []).includes(campo)));

// (sin \b: no funciona después de la í)
const COLETILLA_DE_APOYO = /^(?:Así|Con eso)(?=\s|$)/;

/**
 * Quita de la respuesta las oraciones que vuelven a preguntar un tema que el cliente no contestó (`temas`, en
 * palabras), con su coletilla inmediata de apoyo ("Así te oriento mejor.", "Con eso te armo…"). Si no queda
 * texto, devuelve la respuesta original: mejor repetir que mandar un mensaje vacío.
 */
export function sinPreguntaRepetida(texto, temas) {
  const claves = (temas ?? []).map((t) => TEMA_DE_LAS_PALABRAS[t]).filter(Boolean);
  if (!texto || !claves.length) return texto;
  let quitado = false;
  const lineas = String(texto)
    .split(/\r?\n/)
    .map((linea) => {
      const oraciones = linea.split(/(?<=[.!?…])\s+|\s+(?=¿)/).filter(Boolean);
      const quedan = [];
      let anteriorQuitada = false;
      let quitadoEnLinea = false; // el fragmento colgando solo se quita en la línea donde se quitó una pregunta
      for (const oracion of oraciones) {
        const repite = oracion.includes("?") && temasPreguntados(oracion).some((t) => claves.includes(t));
        if (repite || (anteriorQuitada && COLETILLA_DE_APOYO.test(oracion))) {
          quitado = true;
          quitadoEnLinea = true;
          anteriorQuitada = repite;
          continue;
        }
        anteriorQuitada = false;
        quedan.push(oracion);
      }
      // Un fragmento que quedó colgando de la pregunta quitada ("Y contame,") se va con ella.
      if (quitadoEnLinea && /[,:;]$/.test(quedan.at(-1) ?? "")) quedan.pop();
      return oraciones.length && !quedan.length ? null : quedan.join(" ");
    })
    .filter((linea) => linea !== null);
  if (!quitado) return texto;
  const limpio = lineas.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return limpio || texto;
}
