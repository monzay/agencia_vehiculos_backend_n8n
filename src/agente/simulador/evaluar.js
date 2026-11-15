// Evaluación de una conversación de venta simulada: qué preguntó el agente, si
// repitió, qué datos quedaron guardados contra los del cliente y si cerró
// invitándolo a la agencia con un día concreto.

import { temasPreguntados } from "../temas-preguntados.js";

// Producción también la usa: vive en src/agente/temas-preguntados.js y acá se re-exporta.
export { temasPreguntados };

// Del usado no se preguntan km ni estado: se ven en la agencia (13/10/2026).
const TEMAS_PROHIBIDOS = new Set(["usado_kms", "usado_detalles"]);
// Hablar de cuotas con números está prohibido: la financiación se arma en la agencia.
export const CUOTAS_CON_NUMEROS =/\d+\s*cuotas|cuotas?\b[^.?!]*\$\s?\d/i;
const UBICACION = /direcci[oó]n|queda en|maps\.|goo\.gl/i;

const INVITACION =/\bvenir\b|\bvuelta\b|\bpas(ar|ás|arte|es)\b|\bacerc|\bvisit|\b(te|los|las) esperamos|\b(te|los|las) (va|van|vamos) a estar esperando|en persona/i;
const DIA = /lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|\b(a la|por la) (ma[ñn]ana|tarde)\b|\bhoy\b|\bsemana (que viene|pr[oó]xima)\b|\bpr[oó]xima semana\b|\d{1,2}\s?(hs|h\b|:\d{2})/i;

function contarRepeticiones(mensajesDelAgente) {
  const veces = mensajesDelAgente.flatMap(temasPreguntados).reduce((m, t) => ({ ...m, [t]: (m[t] ?? 0) + 1 }), {});
  return Object.values(veces).reduce((suma, n) => suma + Math.max(0, n - 1), 0);
}

const presente = (v) => v !== null && v !== undefined && String(v).trim() !== "";
const comoBooleano = (v) => (v === null || v === undefined ? null : v === true || Number(v) === 1);

// Un valor esperado `true` pide solo que el dato esté; un texto, que lo contenga.
function coincide(esperado, obtenido) {
  if (esperado === true) return presente(obtenido);
  if (typeof esperado === "string") return presente(obtenido) && String(obtenido).toLowerCase().includes(esperado.toLowerCase());
  return esperado === obtenido;
}

function camposEsperados(esperado, sesion, usado) {
  const sesionCampo = (campo, valor = sesion?.[campo]) => [campo, esperado[campo], valor];
  return [
    sesionCampo("pago_tipo"),
    ...("credito_ok" in esperado ? [sesionCampo("credito_ok", comoBooleano(sesion?.credito_ok))] : []),
    ...("anticipo" in esperado ? [sesionCampo("anticipo")] : []),
    sesionCampo("entrega_usado", comoBooleano(sesion?.entrega_usado)),
    ...Object.entries(esperado.usado ?? {}).map(([campo, valor]) => [`usado.${campo}`, valor, usado?.[campo]]),
    sesionCampo("decisor"),
    sesionCampo("disponibilidad"),
    sesionCampo("clasificacion"),
  ];
}

export function evaluarConversacion({ turnos, sesion, usado, esperado }) {
  const delAgente = turnos.filter((t) => t.de === "agente").map((t) => t.texto);
  const cierre = delAgente.slice(-2).join("\n");
  const detalle = camposEsperados(esperado, sesion, usado).map(([campo, esp, obtenido]) => ({
    campo,
    esperado: esp,
    obtenido: obtenido ?? null,
    ok: coincide(esp, obtenido ?? null),
  }));
  return {
    detalle,
    datosOk: detalle.filter((d) => d.ok).length,
    datosTotal: detalle.length,
    repeticiones: contarRepeticiones(delAgente),
    // Lo que cobra Meta: cada mensaje que sale del bot; las reacciones son gratis.
    mensajesWhatsApp: turnos.filter((t) => t.de === "agente").reduce((suma, t) => suma + (t.mensajesWA ?? 1), 0),
    reacciones: turnos.filter((t) => t.de === "reaccion").length,
    preguntasProhibidas: delAgente.flatMap(temasPreguntados).filter((t) => TEMAS_PROHIBIDOS.has(t)).length,
    hablaDeCuotas: delAgente.some((t) => CUOTAS_CON_NUMEROS.test(t)),
    mandaUbicacion: delAgente.some((t) => UBICACION.test(t)),
    invitaVisita: INVITACION.test(cierre),
    proponeDia: INVITACION.test(cierre) && DIA.test(cierre),
    clasificacionOk: sesion?.clasificacion === esperado.clasificacion,
  };
}
