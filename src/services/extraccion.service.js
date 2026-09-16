import { TIPOS } from "../lib/documentos-catalogo.js";
import { esquemaDe, instruccionDe, normalizarExtraido } from "../lib/extraccion-esquema.js";
import { validarPathnamesDeBlob } from "../lib/imagenes-blob.js";
import { firmarImagenes } from "../lib/blob-privado.js";
import { leerDocumento } from "../lib/vision-claude.js";
import { ingresoVigente } from "./ingreso-documentos.service.js";

// Lee las fotos de un papel y propone sus datos.
//
// No guarda NADA: devuelve una sugerencia para que el panel la muestre y una
// persona la confirme. El guardado sigue siendo el de siempre, con su
// validación. Si esto se equivoca, se corrige antes de que llegue a la base.

function error(mensaje, status = 400) {
  const e = new Error(mensaje);
  e.status = status;
  return e;
}

export async function extraerDatos(ingresoId, { tipo, imagenes } = {}) {
  // Que el ingreso exista y esté vigente: sin eso no hay a qué papel pertenece.
  await ingresoVigente(ingresoId);

  if (!TIPOS.includes(tipo)) throw error(`El tipo de documento debe ser uno de: ${TIPOS.join(", ")}.`);

  const pathnames = validarPathnamesDeBlob(imagenes);
  if (!pathnames?.length) throw error("Subí al menos una imagen para leer.");

  // Los documentos viven en un store privado: el modelo los descarga por su
  // cuenta, así que necesita URLs firmadas. Se firman cortas y recién acá, para
  // que el enlace que sale del servidor sirva el rato que dura la lectura.
  const urls = await firmarImagenes(pathnames);

  const bruto = await leerDocumento({ imagenes: urls, instruccion: instruccionDe(tipo), esquema: esquemaDe(tipo) });

  // Lo que contesta el modelo se recorta contra el catálogo antes de salir:
  // claves inventadas y tipos equivocados no llegan al formulario.
  return normalizarExtraido(tipo, bruto);
}
