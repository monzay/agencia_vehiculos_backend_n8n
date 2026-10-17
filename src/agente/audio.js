// Audios del cliente: duración (para no pagar por audios largos) y transcripción con Groq.

export const MODELO_GROQ = "whisper-large-v3-turbo";

const URL_GROQ = "https://api.groq.com/openai/v1/audio/transcriptions";
const MUESTRAS_POR_SEGUNDO_OPUS = 48_000;
const TIMEOUT_MS = 30_000;
const SIN_POSICION = 0xffffffffffffffffn;
const EXTENSION = { "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a" };

// Las notas de voz de WhatsApp son ogg/opus: la última página guarda la posición
// final en muestras de 48 kHz, o sea la duración. Así se mide sin transcribir.
export function duracionOgg(buffer) {
  const inicio = buffer.lastIndexOf("OggS");
  if (inicio < 0 || buffer.length < inicio + 14) return null;
  const posicion = buffer.readBigUInt64LE(inicio + 6);
  if (posicion === SIN_POSICION) return null;
  return Number(posicion) / MUESTRAS_POR_SEGUNDO_OPUS;
}

const duracionInformada = (respuesta) => respuesta.duration ?? respuesta.segments?.at(-1)?.end ?? null;

export async function transcribirConGroq({ buffer, mediaType }, { apiKey, fetch = globalThis.fetch }) {
  if (!apiKey) throw new Error("Falta GROQ_API_KEY para transcribir audios.");
  const formulario = new FormData();
  formulario.append("file", new Blob([buffer], { type: mediaType }), `audio.${EXTENSION[mediaType] ?? "ogg"}`);
  formulario.append("model", MODELO_GROQ);
  formulario.append("language", "es");
  formulario.append("response_format", "verbose_json");

  const respuesta = await fetch(URL_GROQ, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formulario,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!respuesta.ok) throw new Error(`Groq respondió ${respuesta.status} al transcribir.`);
  const datos = await respuesta.json();
  return { texto: String(datos.text ?? "").trim(), segundos: duracionInformada(datos) };
}
