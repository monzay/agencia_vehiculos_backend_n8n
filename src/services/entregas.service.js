import { prisma } from "../lib/prisma.js";
import { mapEntrega } from "../mappers/entrega.mapper.js";

// Fotos de entregas que se muestran en la galería del home. Alta desde el panel
// (solo admin): la imagen se sube a Blob y acá se guarda su URL. Soft delete.

const VIGENTE = { deleted_at: null };

function error(mensaje, status = 400) {
  const e = new Error(mensaje);
  e.status = status;
  return e;
}

// La URL viene de nuestro propio endpoint de subida (https de Vercel Blob) o es
// una ruta interna a /public (las semillas /images/…). Se aceptan solo esas dos
// formas: cualquier otra cosa (javascript:, data:, etc.) se rechaza.
function validarUrl(valor) {
  const url = typeof valor === "string" ? valor.trim() : "";
  if (!url) throw error("La URL de la imagen es obligatoria.");
  if (url.length > 500) throw error("La URL es demasiado larga (máximo 500 caracteres).");
  if (!/^(https?:\/\/|\/)/.test(url)) throw error("La URL de la imagen no es válida.");
  return url;
}

// Galería completa (vigentes), de la más nueva a la más vieja.
export async function listarEntregas() {
  const filas = await prisma.entregas.findMany({ where: VIGENTE, orderBy: { id: "desc" } });
  return filas.map(mapEntrega);
}

export async function crearEntrega(body = {}) {
  const url = validarUrl(body.url);
  const creada = await prisma.entregas.create({ data: { url } });
  return mapEntrega(creada);
}

// Soft delete: la fila queda para auditoría, pero sale de la galería.
export async function eliminarEntrega(id) {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) return false;
  const existe = await prisma.entregas.findFirst({ where: { id: n, ...VIGENTE } });
  if (!existe) return false;

  await prisma.entregas.update({ where: { id: existe.id }, data: { deleted_at: new Date() } });
  return true;
}
