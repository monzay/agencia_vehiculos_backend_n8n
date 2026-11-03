// El CUIL que da el cliente por WhatsApp, antes de consultar al BCRA. La API del BCRA
// no valida el dígito verificador: un CUIL mal escrito vuelve como "sin datos", y eso
// se leería como alguien sin historial. Por eso se valida acá.

const PESOS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
// Prefijos de personas humanas (20 y 23 hombres o indistinto, 27 mujeres, 24 repetidos).
const PREFIJOS_PERSONA = new Set(["20", "23", "24", "27"]);

function digitoVerificador(diez) {
  const suma = PESOS.reduce((total, peso, i) => total + peso * Number(diez[i]), 0);
  const resto = 11 - (suma % 11);
  if (resto === 11) return 0;
  return resto === 10 ? null : resto;
}

/** Los 11 dígitos del CUIL si es válido y de una persona; si no, null. */
export function validarCuil(valor) {
  if (typeof valor !== "string" || !/^[\d\s.-]+$/.test(valor.trim())) return null;
  const cuil = valor.replace(/\D/g, "");
  if (cuil.length !== 11 || !PREFIJOS_PERSONA.has(cuil.slice(0, 2))) return null;
  return digitoVerificador(cuil) === Number(cuil[10]) ? cuil : null;
}

/** El CUIL lleva el DNI en el medio (8 dígitos, con 0 adelante si tiene 7). */
export function esCuilDelDni(cuil, dni) {
  const digitos = String(dni ?? "").replace(/\D/g, "");
  return Boolean(digitos) && cuil.slice(2, 10) === digitos.padStart(8, "0");
}

/** Para mostrar: 20-12345678-6. Lo que no tiene 11 dígitos queda igual. */
export function formatearCuil(cuil) {
  return /^\d{11}$/.test(cuil) ? `${cuil.slice(0, 2)}-${cuil.slice(2, 10)}-${cuil.slice(10)}` : cuil;
}
