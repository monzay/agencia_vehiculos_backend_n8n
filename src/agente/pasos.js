// Marcas de los mensajes del agente en el historial (`historial_mensajes.paso_nodo`).
// Su contexto y el límite del día cuentan solo su conversación, no la del bot de
// menús que había antes.
export const PASO_AGENTE = "agente_ia";

// Las reacciones 👍 se guardan aparte: son gratis (no cuentan como mensaje
// cobrado ni contra los 1.000 gratis del mes) y no entran a la charla que lee la IA.
export const PASO_REACCION = "agente_reaccion";
