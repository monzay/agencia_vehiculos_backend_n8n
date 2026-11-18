// Lo único que habla con el store privado de Blob.
//
// Los escaneos de documentos (DNI, títulos, cédulas) viven en un store PRIVADO:
// su URL no sirve por sí sola, hay que firmarla. En la base se guarda el
// pathname, nunca una URL: las URLs firmadas vencen, así que guardarlas sería
// guardar algo que mañana no funciona.
//
// Quien necesita mostrar o leer una imagen pide la firma acá, en el momento.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as sdkReal from "@vercel/blob";

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

// ── Blob simulado (solo desarrollo) ──
// Con BLOB_SIMULADO=1 y fuera de producción, nada va a Vercel: las imágenes se guardan en una carpeta local y
// se "firman" con una URL del backend local (ver routes/blob-simulado.routes.js). Lo usan los tests, el simulador
// y la prueba del panel. En producción la variable se ignora.
export const CARPETA_BLOB_SIMULADO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "tmp", "blob-simulado");

export const blobSimulado = (env = process.env) => env.BLOB_SIMULADO === "1" && env.NODE_ENV !== "production";

// Falla cerrado: el simulador y la prueba del panel no corren sin el modo simulado ni con un token real cargado.
export function exigirBlobSimulado(env = process.env) {
  if (env.NODE_ENV === "production") throw new Error("NODE_ENV es producción: el Blob simulado no se usa ahí.");
  if (env.BLOB_SIMULADO !== "1") throw new Error("falta BLOB_SIMULADO=1: sin el Blob simulado no se corre (las fotos irían al store real).");
  if (String(env.BLOB_DOCUMENTOS_TOKEN ?? "").trim() !== "") throw new Error("hay un BLOB_DOCUMENTOS_TOKEN cargado: con el Blob simulado no tiene que haber token real.");
}

// El pathname simulado nunca sale de la carpeta: sin "..", sin rutas absolutas ni barras invertidas.
function rutaSimulada(carpeta, pathname) {
  const partes = String(pathname ?? "").split("/");
  if (!pathname || partes.some((p) => p === "" || p === "." || p === "..") || /[\\\u0000:]/.test(pathname)) {
    throw error("El nombre del archivo no es válido.", 400);
  }
  const destino = path.resolve(carpeta, ...partes);
  if (!destino.startsWith(path.resolve(carpeta) + path.sep)) throw error("El nombre del archivo no es válido.", 400);
  return destino;
}

const urlBaseLocal = (env) => `http://localhost:${env.PORT || 4000}`;

// Sube una imagen al store privado y devuelve su pathname (lo que se guarda en la base).
export async function subirImagenPrivada(buffer, tipo, pathname, { env = process.env, sdk = sdkReal, carpeta = CARPETA_BLOB_SIMULADO } = {}) {
  if (blobSimulado(env)) {
    const destino = rutaSimulada(carpeta, pathname);
    await mkdir(path.dirname(destino), { recursive: true });
    await writeFile(destino, buffer);
    return { pathname };
  }
  const token = env.BLOB_DOCUMENTOS_TOKEN;
  if (!token) throw error("El almacenamiento de documentos no está configurado.", 503);
  try {
    await sdk.put(pathname, buffer, { access: "private", token, contentType: tipo, addRandomSuffix: false });
    return { pathname };
  } catch (e) {
    console.error(`[blob] no se pudo subir la imagen: ${e.message}`);
    throw error("No se pudo guardar la imagen.", 502);
  }
}

// Una sola delegación sirve para firmar todas las imágenes de todos los papeles
// (`pathname: "*"`), así que se reusa mientras siga vigente.
let delegacion = null;

async function delegacionVigente(env, sdk) {
  // La caché es solo de la delegación real: con un SDK inyectado (tests) no se comparte.
  const cacheable = sdk === sdkReal;
  if (cacheable && delegacion && delegacion.validUntil - Date.now() > MARGEN_MS) return delegacion;

  try {
    const nueva = await sdk.issueSignedToken({
      token: env.BLOB_DOCUMENTOS_TOKEN,
      pathname: "*",
      operations: ["get"],
      validUntil: Date.now() + DELEGACION_MS,
    });
    if (cacheable) delegacion = nueva;
    return nueva;
  } catch (e) {
    delegacion = null;
    console.error(`[blob] no se pudo emitir la delegación: ${e.message}`);
    throw error("No se pudieron abrir las imágenes del documento. Probá de nuevo en un rato.", 502);
  }
}

// Convierte pathnames guardados en URLs que se pueden abrir por un rato.
// Las firma en paralelo: es cálculo local, no hay viaje de red por imagen.
export async function firmarImagenes(pathnames, { env = process.env, sdk = sdkReal, carpeta = CARPETA_BLOB_SIMULADO, urlBase } = {}) {
  if (!pathnames?.length) return [];
  if (blobSimulado(env)) {
    return pathnames.map((p) => {
      rutaSimulada(carpeta, p);
      return `${urlBase ?? urlBaseLocal(env)}/api/dev/blob-simulado/${p}`;
    });
  }
  if (!env.BLOB_DOCUMENTOS_TOKEN) {
    throw error("El almacenamiento de documentos no está configurado.", 503);
  }

  const token = await delegacionVigente(env, sdk);
  const validUntil = Date.now() + URL_MS;

  try {
    const firmadas = await Promise.all(
      pathnames.map((pathname) => sdk.presignUrl(token, { operation: "get", pathname, access: "private", validUntil }))
    );
    return firmadas.map((f) => f.presignedUrl);
  } catch (e) {
    console.error(`[blob] no se pudo firmar: ${e.message}`);
    throw error("No se pudieron abrir las imágenes del documento.", 502);
  }
}
