// Ráfagas: mucha gente escribe "hola" / "vi la amarok" / "sigue disponible?" en
// mensajes seguidos. Cada respuesta cuesta (Meta cobra por mensaje), así que el
// bot espera un momento y contesta todo junto, una sola vez: responde el último
// mensaje que llegó y los anteriores no responden nada.
//
// En memoria y por número, como la cola de `atender.js`: alcanza mientras el
// backend sea un solo proceso. Riesgo aceptado: si el backend se reinicia en
// esos segundos, los mensajes que esperaban se pierden (Meta ya recibió el OK y
// no los reenvía); por eso un deploy no debería cortar el proceso de golpe.

export const ESPERA_RAFAGA_MS = 4000;

const pendientes = new Map(); // telefono -> { mensajes, marca }

const esperar = (ms) => new Promise((listo) => setTimeout(listo, ms));
// Las fotos de cada parte del lote, aparte de la parte (que lleva solo texto y wamid): así, si una parte
// se descarta por repetida, se van con ella sus fotos.
const fotosDeLaParte = new WeakMap();
export const imagenesDeLaParte = (parte) => fotosDeLaParte.get(parte) ?? [];

// Solo el audio sale ya: hay que transcribirlo y no tiene sentido esperar. Las fotos esperan como un texto,
// porque la gente manda varias seguidas y se responden todas juntas.
const traeAudio = (datos) => Boolean(datos.audio);

// Un solo mensaje para atender: los textos juntos (en orden), las fotos de todos los mensajes (en orden),
// el audio del último (solo el último puede traerlo) y cada parte con su id y sus fotos, para guardarlas.
export function combinar(mensajes) {
  const ultimo = mensajes.at(-1);
  const partes = mensajes.map((m) => {
    const parte = { texto: m.texto ?? null, wamid: m.wamid ?? null };
    fotosDeLaParte.set(parte, m.imagenes ?? []);
    return parte;
  });
  const textos = partes.map((p) => p.texto).filter(Boolean);
  return { ...ultimo, texto: textos.length ? textos.join("\n") : null, imagenes: partes.flatMap(imagenesDeLaParte), partes };
}

// ¿Hay mensajes de este número esperando en la ráfaga? Todavía no están en la cola ni en el historial.
export const hayMensajesEsperando = (telefono) => (pendientes.get(telefono)?.mensajes.length ?? 0) > 0;

// Devuelve el lote para atender, o null si un mensaje más nuevo se encarga.
// Con audio no se espera: sale ya, con lo que estaba esperando (textos y fotos).
export async function juntarRafaga(telefono, datos, espera = ESPERA_RAFAGA_MS) {
  const previos = pendientes.get(telefono)?.mensajes ?? [];
  // Un reintento del mismo mensaje mientras espera: ya lo va a responder la ráfaga.
  if (datos.wamid && previos.some((m) => m.wamid === datos.wamid)) return null;
  const mensajes = [...previos, datos];
  if (espera <= 0 || traeAudio(datos)) {
    pendientes.delete(telefono);
    return combinar(mensajes);
  }
  const marca = Symbol(telefono);
  pendientes.set(telefono, { mensajes, marca });
  await esperar(espera);
  if (pendientes.get(telefono)?.marca !== marca) return null;
  pendientes.delete(telefono);
  return combinar(mensajes);
}
