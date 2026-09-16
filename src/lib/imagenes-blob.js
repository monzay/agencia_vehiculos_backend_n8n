// Las imágenes de los papeles las sube el panel al store PRIVADO de Blob y
// manda el pathname que le devuelve la ruta de subida. Acá se valida ese
// pathname antes de guardarlo o de firmarlo.
//
// Se guarda el pathname y no la URL por dos motivos. Uno: una URL firmada vence,
// guardarla sería guardar algo que mañana no abre. Dos: al no aceptar nunca una
// URL de afuera, el servidor no puede salir a buscar una dirección arbitraria —
// la dirección la construye él, contra un store que controla.
//
// Lo usan el guardado del papel y la extracción de datos: una sola regla.

export const MAX_IMAGENES = 6;

// Todo lo de consignación cuelga de acá. Fuera de este prefijo no se mira nada,
// ni siquiera dentro del mismo store.
export const PREFIJO = "documentos/";

// Lo que genera la ruta de subida: el prefijo, y después solo caracteres
// inofensivos. Sin "..", sin barras dobles, sin barra inicial: la expresión no
// los admite, así que no hay que acordarse de chequearlos por separado.
const PATHNAME = /^documentos\/[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*\.(jpg|jpeg|png|webp)$/;

function error(mensaje, status = 400) {
  const e = new Error(mensaje);
  e.status = status;
  return e;
}

// Devuelve la lista de pathnames válidos, o `null` si no vino nada. O pasan
// todos, o corta: nunca devuelve una lista a medias.
export function validarPathnamesDeBlob(valor) {
  if (valor === null || valor === undefined) return null;
  if (!Array.isArray(valor)) throw error("Las imágenes deben venir como lista.");
  if (valor.length > MAX_IMAGENES) throw error(`No se pueden adjuntar más de ${MAX_IMAGENES} imágenes por papel.`);

  return valor.map((bruto) => {
    const pathname = typeof bruto === "string" ? bruto.trim() : "";
    if (!pathname || pathname.length > 200 || pathname.includes("..") || !PATHNAME.test(pathname)) {
      throw error("Las imágenes tienen que subirse desde el panel.");
    }
    return pathname;
  });
}
