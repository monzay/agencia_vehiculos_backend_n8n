// El DNI de la ficha de un cliente: cómo se guarda y qué se acepta al cargarlo.
//
// Se guarda sin puntos, espacios ni guiones ("30.125.678" → "30125678"): así lo
// comparan la puerta única de alta, la unificación de fichas y el índice único de
// la 074. Un documento con letras (un pasaporte cargado antes) no pierde sus letras:
// si se las sacaran, "AB123456" y "CD123456" quedarían iguales y se unirían dos
// personas distintas.

const DIGITOS_MIN = 7;
const DIGITOS_MAX = 9;

function error(mensaje) {
  return Object.assign(new Error(mensaje), { status: 400 });
}

/** La forma en que se guarda y se compara un DNI. Vacío → null. */
export function claveDni(valor) {
  const clave = String(valor ?? "").replace(/[\s.-]/g, "").toUpperCase();
  return clave || null;
}

/**
 * Valida un DNI que se carga desde el panel y devuelve sus dígitos. Lanza 400 si
 * está vacío, si tiene letras, si no tiene de 7 a 9 dígitos o si son todos iguales.
 */
export function validarDni(valor) {
  const texto = typeof valor === "number" && Number.isInteger(valor) ? String(valor) : valor;
  if (texto == null || (typeof texto === "string" && !texto.trim())) throw error("El DNI es obligatorio.");
  if (typeof texto !== "string" || !/^[\d\s.-]+$/.test(texto)) throw error("El DNI lleva solo números.");

  const digitos = texto.replace(/\D/g, "");
  if (digitos.length < DIGITOS_MIN || digitos.length > DIGITOS_MAX) throw error(`El DNI debe tener entre ${DIGITOS_MIN} y ${DIGITOS_MAX} dígitos.`);
  if (/^(\d)\1+$/.test(digitos)) throw error("El DNI no es válido.");
  return digitos;
}
