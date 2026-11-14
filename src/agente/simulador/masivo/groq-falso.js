// Doble de la transcripción de Groq: devuelve las respuestas del guion, de a una.
export function crearGroqFalso(respuestas = []) {
  const pendientes = [...respuestas];
  async function transcribir() {
    transcribir.llamadas += 1;
    if (!pendientes.length) throw new Error("Groq falso: sin respuesta en el guion para esta transcripción.");
    const r = pendientes.shift();
    if (r.error) throw new Error(r.error);
    return { texto: r.texto, segundos: r.segundos };
  }
  transcribir.llamadas = 0;
  return transcribir;
}
