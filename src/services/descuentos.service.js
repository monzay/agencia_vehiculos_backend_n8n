import { prisma } from "../lib/prisma.js";
import { mapDescuento } from "../mappers/descuento.mapper.js";

// Soft delete: solo cuentan las filas con deleted_at NULL.
const VIGENTE = { deleted_at: null };

function limpiar(v) {
  return typeof v === "string" ? v.trim() : v;
}
function error(mensaje, status = 400) {
  const e = new Error(mensaje);
  e.status = status;
  return e;
}

const TIPOS_VALIDOS = ["porcentaje", "monto"];

// Valida y arma el `data` para crear/editar. `parcial`=true permite campos ausentes (PATCH).
function construirData(body, parcial = false) {
  const data = {};

  if (!parcial || body.nombre !== undefined) {
    const nombre = limpiar(body.nombre);
    if (!nombre) throw error("El nombre del descuento es obligatorio");
    data.nombre = nombre;
  }

  if (!parcial || body.tipo !== undefined) {
    const tipo = limpiar(body.tipo);
    if (!TIPOS_VALIDOS.includes(tipo)) {
      throw error('El tipo debe ser "porcentaje" o "monto"');
    }
    data.tipo = tipo;
  }

  if (!parcial || body.valor !== undefined) {
    const valor = Number(body.valor);
    if (!(valor > 0)) throw error("El valor debe ser un numero mayor a 0");
    // Un porcentaje no puede superar el 100%.
    const tipo = data.tipo ?? body.tipo;
    if (tipo === "porcentaje" && valor > 100) {
      throw error("El porcentaje no puede superar 100");
    }
    data.valor = valor;
  }

  // Fecha de finalizacion (opcional). Acepta "" o null para quitarla.
  // La vigencia del descuento se controla con esta fecha (no hay desactivar manual).
  if (body.fecha_fin !== undefined) {
    const v = body.fecha_fin;
    if (v === null || v === "") {
      data.fecha_fin = null;
    } else {
      const fecha = parsearFechaFin(v);
      if (!fecha) throw error("La fecha de finalizacion no es valida");
      data.fecha_fin = fecha;
    }
  }

  return data;
}

// Convierte la fecha que llega del front a un Date.
// Si viene solo la fecha ("YYYY-MM-DD"), el descuento vence al final de ese dia.
function parsearFechaFin(v) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(v))) {
    return new Date(`${v}T23:59:59`);
  }
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

// ── Lecturas ──

// Lista todos los descuentos vigentes (no eliminados).
export async function listarDescuentos() {
  const filas = await prisma.descuentos.findMany({
    where: VIGENTE,
    orderBy: { id: "desc" },
  });
  return filas.map(mapDescuento);
}

export async function obtenerDescuento(id) {
  const d = await prisma.descuentos.findFirst({
    where: { id: Number(id), ...VIGENTE },
  });
  return d ? mapDescuento(d) : null;
}

// ── Escrituras (CRUD) ──

export async function crearDescuento(body = {}) {
  const data = construirData(body, false);
  if (data.activo === undefined) data.activo = true;

  const creado = await prisma.descuentos.create({ data });
  return mapDescuento(creado);
}

export async function actualizarDescuento(id, body = {}) {
  const existe = await prisma.descuentos.findFirst({
    where: { id: Number(id), ...VIGENTE },
  });
  if (!existe) return null;

  const data = construirData(body, true);
  data.updated_at = new Date();
  const actualizado = await prisma.descuentos.update({
    where: { id: existe.id },
    data,
  });
  return mapDescuento(actualizado);
}

// Soft delete. Al eliminar el descuento, se desvincula de todos los autos que lo usaban.
export async function eliminarDescuento(id) {
  const existe = await prisma.descuentos.findFirst({
    where: { id: Number(id), ...VIGENTE },
  });
  if (!existe) return false;

  await prisma.$transaction([
    prisma.autos.updateMany({
      where: { descuento_id: existe.id },
      data: { descuento_id: null, updated_at: new Date() },
    }),
    prisma.descuentos.update({
      where: { id: existe.id },
      data: { deleted_at: new Date(), activo: false, updated_at: new Date() },
    }),
  ]);
  return true;
}

// ── Aplicacion a vehiculos ──

// Aplica un descuento a uno o varios vehiculos (por su `ref`).
// `refs` puede ser un array de refs o una sola ref.
// Devuelve la cantidad de vehiculos afectados.
export async function aplicarDescuentoAVehiculos(id, refs) {
  const descuento = await prisma.descuentos.findFirst({
    where: { id: Number(id), ...VIGENTE },
  });
  if (!descuento) throw error("Descuento no encontrado", 404);

  const lista = (Array.isArray(refs) ? refs : [refs])
    .map((r) => String(r).trim())
    .filter(Boolean);
  if (lista.length === 0) throw error("Debe indicar al menos un vehiculo (refs)");

  const autos = await prisma.autos.findMany({
    where: { ref: { in: lista }, deleted_at: null },
    select: { id: true },
  });
  if (autos.length === 0) throw error("Ningun vehiculo valido encontrado", 404);

  await prisma.autos.updateMany({
    where: { id: { in: autos.map((a) => a.id) } },
    data: { descuento_id: descuento.id, updated_at: new Date() },
  });
  return autos.length;
}

// Quita el descuento de uno o varios vehiculos (por su `ref`).
// Devuelve la cantidad de vehiculos afectados.
export async function quitarDescuentoDeVehiculos(refs) {
  const lista = (Array.isArray(refs) ? refs : [refs])
    .map((r) => String(r).trim())
    .filter(Boolean);
  if (lista.length === 0) throw error("Debe indicar al menos un vehiculo (refs)");

  const res = await prisma.autos.updateMany({
    where: { ref: { in: lista }, deleted_at: null },
    data: { descuento_id: null, updated_at: new Date() },
  });
  return res.count;
}
