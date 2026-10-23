// Para los logs: la URL de una petición sin los datos personales que viajan en su
// query string, como el `?dni=` de la consulta pública o el `?q=` de los buscadores
// del panel (nombres, teléfonos, DNIs).

const OCULTO = "***";

// Parámetros cuyo valor es una persona. El nombre se compara como lo lee Express.
const PARAMETROS_PERSONALES = new Set(["dni", "q", "telefono"]);

// El nombre del parámetro como lo interpreta Express: decodificado, sin los corchetes de
// `dni[not]` o `q[]` y sin distinguir mayúsculas. Una codificación rota no es ninguno de
// los parámetros que se cuidan: se compara tal cual.
function nombreDelParametro(clave) {
  let nombre = clave;
  try {
    nombre = decodeURIComponent(clave.replace(/\+/g, " "));
  } catch {
    // %-secuencia inválida: se queda con la clave cruda
  }
  return nombre.replace(/^\[/, "").split(/[[\]]/)[0].toLowerCase();
}

// `clave=valor`: si la clave es personal se cambia el valor. Sin valor no hay nada que ocultar.
function ocultarSiEsPersonal(par) {
  const igual = par.indexOf("=");
  if (igual === -1 || igual === par.length - 1) return par;
  if (!PARAMETROS_PERSONALES.has(nombreDelParametro(par.slice(0, igual)))) return par;
  return `${par.slice(0, igual + 1)}${OCULTO}`;
}

/**
 * La URL con el valor de los parámetros `dni`, `q` y `telefono` reemplazado por `***`;
 * el camino y los demás parámetros quedan como estaban. Pura: no modifica nada.
 */
export function urlSinDatosPersonales(url) {
  const texto = String(url ?? "");
  const inicioDeQuery = texto.indexOf("?");
  if (inicioDeQuery === -1) return texto;

  const pares = texto.slice(inicioDeQuery + 1).split("&");
  return `${texto.slice(0, inicioDeQuery + 1)}${pares.map(ocultarSiEsPersonal).join("&")}`;
}
