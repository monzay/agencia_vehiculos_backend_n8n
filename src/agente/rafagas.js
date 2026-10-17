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
const traeArchivo = (datos) => Boolean(datos.audio || datos.imagenes?.length);

// Un solo mensaje para atender: los textos juntos (en orden), el archivo del
// último (solo el último puede traerlo) y cada parte con su id, para guardarlas.
export function combinar(mensajes) {
  const ultimo = mensajes.at(-1);
  const partes = mensajes.map((m) => ({ texto: m.texto ?? null, wamid: m.wamid ?? null }));
  const textos = partes.map((p) => p.texto).filter(Boolean);
  return { ...ultimo, texto: textos.length ? textos.join("\n") : null, partes };
}

// Devuelve el lote para atender, o null si un mensaje más nuevo se encarga.
// Con foto o audio no se espera: sale ya, con lo que estaba esperando.
export async function juntarRafaga(telefono, datos, espera = ESPERA_RAFAGA_MS) {
  const previos = pendientes.get(telefono)?.mensajes ?? [];
  // Un reintento del mismo mensaje mientras espera: ya lo va a responder la ráfaga.
  if (datos.wamid && previos.some((m) => m.wamid === datos.wamid)) return null;
  const mensajes = [...previos, datos];
  if (espera <= 0 || traeArchivo(datos)) {
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
