// BCRA simulado para las pruebas locales (chat por terminal y simulador de ventas).
// Nunca consulta a nadie de verdad: en una prueba el CUIL puede ser de un tercero, y
// consultarlo sin su permiso violaría la Ley 25.326. Devuelve la misma forma que el
// cliente real (src/credito/bcra.js), con el semáforo que se elija.

export const SEMAFOROS_SIMULADOS = ["verde", "amarillo", "rojo", "sin_datos", "error"];

const SITUACION = { verde: 1, amarillo: 2, rojo: 4 };
const PERIODO_DE_PRUEBA = "202609";

function respuestaDe(semaforo, nombre) {
  if (semaforo === "error") return { estado: "error", motivo: "simulado" };
  if (semaforo === "sin_datos") return { estado: "ok", deudas: null, cheques: null };
  const entidad = { entidad: "BANCO SIMULADO", situacion: SITUACION[semaforo], monto: 150 };
  return { estado: "ok", deudas: { denominacion: nombre, periodos: [{ periodo: PERIODO_DE_PRUEBA, entidades: [entidad] }] }, cheques: null };
}

/** @param {"verde"|"amarillo"|"rojo"|"sin_datos"|"error"} semaforo */
export function crearBcraSimulado(semaforo = "verde", nombre = "CLIENTE DE PRUEBA") {
  if (!SEMAFOROS_SIMULADOS.includes(semaforo)) {
    throw new Error(`El semáforo simulado tiene que ser uno de: ${SEMAFOROS_SIMULADOS.join(", ")}.`);
  }
  return { consultar: async () => respuestaDe(semaforo, nombre) };
}
