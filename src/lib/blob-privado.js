// Lo único que habla con el store privado de Blob.
//
// Los escaneos de documentos (DNI, títulos, cédulas) viven en un store PRIVADO:
// su URL no sirve por sí sola, hay que firmarla. En la base se guarda el
// pathname, nunca una URL: las URLs firmadas vencen, así que guardarlas sería
// guardar algo que mañana no funciona.
//
// Quien necesita mostrar o leer una imagen pide la firma acá, en el momento.

import { issueSignedToken, presignUrl } from "@vercel/blob";

// Cuánto vive cada cosa. La delegación se pide a la API de Blob (viaje de red);
// firmar una URL con ella es cálculo local. Por eso la delegación se cachea y la
// URL se firma corta: la ventana en que un enlace filtrado sirve es la de la URL.
// 15 minutos para la URL: alcanza para abrir un papel, mirarlo y hacer clic en
// "ver en grande" sin que se corte, y si el enlace se escapa (copiado, pegado en
// un chat, guardado en un log) deja de servir en el rato. Más corto obligaría a
// refrescar mientras alguien lo mira; más largo es un enlace suelto a un DNI.
const DELEGACION_MS = 60 * 60 * 1000; // 1 hora
const URL_MS = 15 * 60 * 1000; //        15 minutos
const MARGEN_MS = 5 * 60 * 1000; //      se renueva 5 min antes de vencer

function error(mensaje, status) {
  const e = new Error(mensaje);
  e.status = status;
  e.publico = true;
  return e;
}

export const hayStorePrivado = () => Boolean(process.env.BLOB_DOCUMENTOS_TOKEN);

// Una sola delegación sirve para firmar todas las imágenes de todos los papeles
// (`pathname: "*"`), así que se reusa mientras siga vigente.
let delegacion = null;

async function delegacionVigente() {
  if (delegacion && delegacion.validUntil - Date.now() > MARGEN_MS) return delegacion;

  try {
    delegacion = await issueSignedToken({
      token: process.env.BLOB_DOCUMENTOS_TOKEN,
      pathname: "*",
      operations: ["get"],
      validUntil: Date.now() + DELEGACION_MS,
    });
    return delegacion;
  } catch (e) {
    delegacion = null;
    console.error(`[blob] no se pudo emitir la delegación: ${e.message}`);
    throw error("No se pudieron abrir las imágenes del documento. Probá de nuevo en un rato.", 502);
  }
}

// Convierte pathnames guardados en URLs que se pueden abrir por un rato.
// Las firma en paralelo: es cálculo local, no hay viaje de red por imagen.
export async function firmarImagenes(pathnames) {
  if (!pathnames?.length) return [];
  if (!hayStorePrivado()) {
    throw error("El almacenamiento de documentos no está configurado.", 503);
  }

  const token = await delegacionVigente();
  const validUntil = Date.now() + URL_MS;

  try {
    const firmadas = await Promise.all(
      pathnames.map((pathname) => presignUrl(token, { operation: "get", pathname, access: "private", validUntil }))
    );
    return firmadas.map((f) => f.presignedUrl);
  } catch (e) {
    console.error(`[blob] no se pudo firmar: ${e.message}`);
    throw error("No se pudieron abrir las imágenes del documento.", 502);
  }
}
