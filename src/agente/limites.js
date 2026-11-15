// Controles de gasto del agente y armado del historial. Todo se decide ANTES de
// llamar a Claude o a Groq: si no hay cupo, no se gasta nada.

export const LIMITES = {
  mensajesPorDia: 25, // por cliente; después, mensaje fijo y vendedor
  herramientasPorMensaje: 5, // vueltas de herramientas por respuesta (contra bucles)
  segundosAudioMax: 120,
  bytesAudioMax: 2_000_000, // ~2 min de mp3; para audios que no traen su duración
  gastoUsdClienteDia: 0.5, // tope duro de gasto de un solo cliente en el día
  margenTope: 1.1, // quien ya venía hablando sigue hasta el 110% del tope del mes; después corta a todos
  caracteresMensaje: 1500, // cada mensaje se recorta a esto antes de mandarlo a Claude
  caracteresHistorial: 8000, // máximo del historial que se manda a Claude
  historialMensajes: 20, // últimos mensajes que se le mandan a Claude
  maxTokensRespuesta: 2048, // incluye el razonamiento; WhatsApp no necesita más
};

// Con razonamiento medio o alto, el razonamiento ocupa más: el máximo de la respuesta sube.
export const maxTokensPara = (esfuerzo) => (esfuerzo === "low" ? LIMITES.maxTokensRespuesta : 2 * LIMITES.maxTokensRespuesta);

export const MENSAJES_FIJOS = {
  sinCupo: "¡Gracias por escribirnos! Un vendedor te va a responder a la brevedad.",
  audioLargo: "¡Gracias por tu audio! Es un poco largo para mí: ¿me lo podés resumir en un mensaje de texto o en un audio de menos de 2 minutos?",
  audioIlegible: "No pude escuchar bien tu audio. ¿Me lo escribís, por favor?",
  respaldo: "Disculpá, tuve un problema para responderte. Un vendedor te va a contactar a la brevedad.",
};

// Los límites por cliente van primero: cortan incluso al que ya venía hablando.
// El tope del mes frena a los clientes nuevos del día; con el margen, a todos.
export function decidirAtencion({ gastoMesUsd, topeUsd, mensajesHoy, clienteHabloHoy, gastoClienteHoyUsd = 0 }) {
  if (mensajesHoy >= LIMITES.mensajesPorDia) return { conIA: false, motivo: "limite_cliente" };
  if (gastoClienteHoyUsd >= LIMITES.gastoUsdClienteDia) return { conIA: false, motivo: "gasto_cliente" };
  if (gastoMesUsd >= topeUsd * LIMITES.margenTope) return { conIA: false, motivo: "tope" };
  if (gastoMesUsd >= topeUsd && !clienteHabloHoy) return { conIA: false, motivo: "tope" };
  return { conIA: true };
}

export const recortar = (texto) => String(texto ?? "").trim().slice(0, LIMITES.caracteresMensaje);

// De las filas (más viejas primero) quedan las más recientes que entran en el máximo.
function filasRecientes(filas) {
  const elegidas = [];
  let total = 0;
  for (const fila of [...filas].reverse()) {
    const mensaje = recortar(fila.mensaje);
    if (total + mensaje.length > LIMITES.caracteresHistorial) break;
    total += mensaje.length;
    elegidas.unshift({ ...fila, mensaje });
  }
  return elegidas;
}

export const audioPermitido = (segundos) => segundos > 0 && segundos <= LIMITES.segundosAudioMax;

const ROL = { entrante: "user", saliente: "assistant" };

// Filas de `historial_mensajes` (más viejas primero) → turnos para Claude. La
// conversación tiene que empezar con el cliente y no repetir el mismo rol.
export function historialParaClaude(filas = []) {
  const turnos = [];
  for (const fila of filasRecientes(filas)) {
    const texto = fila.mensaje;
    const role = ROL[fila.direccion];
    if (!texto || !role) continue;
    if (turnos.length === 0 && role === "assistant") continue;
    const ultimo = turnos.at(-1);
    if (ultimo?.role === role) turnos[turnos.length - 1] = { role, content: `${ultimo.content}\n${texto}` };
    else turnos.push({ role, content: texto });
  }
  return turnos;
}
