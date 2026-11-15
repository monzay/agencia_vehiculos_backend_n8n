// Despedidas: cuando la charla ya cerró y el cliente solo agradece, se le
// reacciona con 👍 (gratis) en vez de contestarle (cada respuesta cuesta).
// Ante la duda se responde: alcanza con una pregunta, un dato nuevo o que
// Agustina haya preguntado algo (ahí un "dale" es un sí, no una despedida).

const MAX_LARGO = 60;
const PALABRAS_DE_CIERRE = new Set([
  "gracias", "muchas", "muchisimas", "mil", "dale", "ok", "okey", "oka", "okis", "genial", "perfecto", "perfecta",
  "joya", "listo", "lista", "buenisimo", "buenisima", "barbaro", "excelente", "bueno", "buena", "igualmente",
  "saludos", "chau", "chao", "nos", "vemos", "hasta", "luego", "pronto", "un", "abrazo", "abrazos", "besos", "re",
]);
const SOLO_EMOJIS = /^[\p{Extended_Pictographic}‍️]+$/u;

// Agustina también pide cosas sin signo de pregunta ("decime qué día podés"): ahí
// un "dale" es una respuesta, no una despedida. "Escribime" no cuenta: es un cierre.
const PEDIDO = /\b(?:decime|avisame|confirmame|contame|pasame|mandame|eleg[ií]|qu[eé] d[ií]a|qu[eé] horario|cu[aá]ndo pod[eé]s|cu[aá]ndo te queda)\b/i;

const sinTildes = (texto) => texto.normalize("NFD").replace(/\p{M}/gu, "");
export const pregunta = (texto) => /[?¿]/.test(texto ?? "") || PEDIDO.test(texto ?? "");

export function esSoloAgradecimiento(texto) {
  const limpio = String(texto ?? "").trim();
  if (!limpio || limpio.length > MAX_LARGO || pregunta(limpio)) return false;
  const palabras = sinTildes(limpio.toLowerCase()).split(/[\s,.;:!¡]+/u).filter(Boolean);
  return palabras.length > 0 && palabras.every((p) => PALABRAS_DE_CIERRE.has(p) || SOLO_EMOJIS.test(p));
}

const presente = (v) => v !== null && v !== undefined && String(v).trim() !== "";

// Cerrada: acordó la visita, no sabe cuándo viene o la tomó un vendedor.
export function conversacionCerrada(sesion) {
  const s = sesion ?? {};
  return presente(s.visita_propuesta) || s.disponibilidad === "no_sabe" || s.requiere_vendedor === true || Number(s.requiere_vendedor) === 1;
}

export const debeReaccionar = ({ texto, sesion, ultimaRespuesta }) =>
  esSoloAgradecimiento(texto) && conversacionCerrada(sesion) && !pregunta(ultimaRespuesta);
