import { prisma } from "../lib/prisma.js";
import { telefonosParaBuscar } from "../lib/busqueda-telefono.js";
import { mapEntrega, mapEntregaGestion, mapClienteDeEntrega } from "../mappers/entrega.mapper.js";

// Fotos de entregas que se muestran en la galería del home. Cada entrega es la
// de un cliente (migración 071). Alta desde el panel (solo admin): la imagen se
// sube a Blob y acá se guarda su URL y el cliente. Soft delete.

const VIGENTE = { deleted_at: null };
const DATOS_CLIENTE = { id: true, nombre: true, telefono: true };
const CON_CLIENTE = { clientes: { select: DATOS_CLIENTE } };

function error(mensaje, status = 400) {
  const e = new Error(mensaje);
  e.status = status;
  return e;
}

// La URL viene de nuestro propio endpoint de subida (Vercel Blob público,
// carpeta vehiculos/) o es una foto del sitio en /public/images (las semillas).
// Cualquier otra (otro host, javascript:, data:, rutas con ..) se rechaza: el
// home la mostraría a todos.
const FOTO_DE_BLOB = /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\/vehiculos\/[\w.-]+$/i;
const FOTO_DEL_SITIO = /^\/images\/[\w-]+(\.[\w-]+)*$/;

function validarUrl(valor) {
  const url = typeof valor === "string" ? valor.trim() : "";
  if (!url) throw error("La URL de la imagen es obligatoria.");
  if (url.length > 500) throw error("La URL es demasiado larga (máximo 500 caracteres).");
  if (!FOTO_DE_BLOB.test(url) && !FOTO_DEL_SITIO.test(url)) throw error("La URL de la imagen no es válida.");
  return url;
}

async function clienteDeLaEntrega(valor, db) {
  const id = Number(valor);
  if (!Number.isInteger(id) || id <= 0) throw error("Elegí el cliente que recibió el auto.");
  const cliente = await db.clientes.findFirst({ where: { id, ...VIGENTE }, select: { id: true } });
  if (!cliente) throw error("Ese cliente no existe.", 404);
  return id;
}

// Buscador del panel (solo admin): por nombre o teléfono, con lo mínimo para elegir.
const BUSQUEDA_MIN = 2;
const BUSQUEDA_MAX = 60;
const MAX_CLIENTES = 7;

export async function buscarClientesParaEntrega(texto, db = prisma) {
  const q = String(texto ?? "").trim().slice(0, BUSQUEDA_MAX);
  if (q.length < BUSQUEDA_MIN) return [];
  // El teléfono se busca por sus dígitos, escrito como se escriba, y si es un número
  // entero también por el de 10 dígitos con que se guarda. Sin dígitos no se agrega:
  // un `contains` vacío traería a todos.
  const digitos = q.replace(/\D/g, "");
  const coincidencias = [{ nombre: { contains: q } }];
  if (digitos.length >= BUSQUEDA_MIN) {
    coincidencias.push(...telefonosParaBuscar(digitos).map((telefono) => ({ telefono: { contains: telefono } })));
  }
  const filas = await db.clientes.findMany({
    where: { ...VIGENTE, OR: coincidencias },
    select: DATOS_CLIENTE,
    orderBy: { id: "desc" },
    take: MAX_CLIENTES,
  });
  return filas.map(mapClienteDeEntrega);
}

// Galería pública (vigentes), de la más nueva a la más vieja. Sin datos del cliente.
export async function listarEntregas(db = prisma) {
  const filas = await db.entregas.findMany({ where: VIGENTE, orderBy: { id: "desc" } });
  return filas.map(mapEntrega);
}

// Para el panel: cada entrega con el cliente que la recibió.
export async function listarEntregasGestion(db = prisma) {
  const filas = await db.entregas.findMany({ where: VIGENTE, orderBy: { id: "desc" }, include: CON_CLIENTE });
  return filas.map(mapEntregaGestion);
}

export async function crearEntrega(body = {}, db = prisma) {
  const url = validarUrl(body.url);
  const clienteId = await clienteDeLaEntrega(body.clienteId, db);
  const creada = await db.entregas.create({ data: { url, cliente_id: clienteId }, include: CON_CLIENTE });
  return mapEntregaGestion(creada);
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
