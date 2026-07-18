import { prisma } from "../lib/prisma.js";
import { mapPromocion, DESCUENTO_TIPOS_VALIDOS } from "../mappers/promocion.mapper.js";

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

// Convierte fecha del front a Date. "YYYY-MM-DD" => fin del dia (23:59:59).
// Devuelve null si viene vacia, o undefined si es invalida.
function parsearFechaFin(v) {
  if (v === null || v === "" || v === undefined) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(v))) {
    return new Date(`${v}T23:59:59`);
  }
  const d = new Date(v);
  return isNaN(d.getTime()) ? undefined : d;
}

// Valida y arma el `data`. `parcial`=true permite campos ausentes (PATCH).
//
// Una promo = nombre (oblig.) + descripcion (oblig.) + condiciones (opc.) +
// descuento (opc.). Si hay descuento, hay que indicar su tipo: porcentaje o monto.
function construirData(body, parcial = false) {
  const data = {};

  if (!parcial || body.nombre !== undefined) {
    const nombre = limpiar(body.nombre);
    if (!nombre) throw error("El nombre de la promoción es obligatorio");
    data.nombre = nombre;
  }

  if (!parcial || body.descripcion !== undefined) {
    const descripcion = limpiar(body.descripcion);
    if (!descripcion) throw error("La descripción es obligatoria");
    data.descripcion = descripcion;
  }

  if (body.fecha_fin !== undefined) {
    const f = parsearFechaFin(body.fecha_fin);
    if (f === undefined) throw error("La fecha de finalización no es válida");
    data.fecha_fin = f;
  }

  // Descuento opcional. Si viene vacio/null se guarda sin descuento.
  if (body.descuento !== undefined || body.descuento_tipo !== undefined) {
    const crudo = body.descuento;
    if (crudo === null || crudo === "" || crudo === undefined) {
      data.descuento = null;
      data.descuento_tipo = null;
    } else {
      const valor = Number(crudo);
      if (!(valor > 0)) throw error("El descuento debe ser un número mayor a 0");

      const tipo = limpiar(body.descuento_tipo) || "porcentaje";
      if (!DESCUENTO_TIPOS_VALIDOS.includes(tipo)) {
        throw error(`El tipo de descuento debe ser: ${DESCUENTO_TIPOS_VALIDOS.join(" o ")}`);
      }
      if (tipo === "porcentaje" && valor > 100) {
        throw error("Un porcentaje no puede superar 100");
      }
      data.descuento = valor;
      data.descuento_tipo = tipo;
    }
  }

  return data;
}

// ── Lecturas ──

export async function listarPromociones() {
  const filas = await prisma.promociones.findMany({
    where: VIGENTE,
    orderBy: { id: "desc" },
  });
  return filas.map(mapPromocion);
}

export async function obtenerPromocion(id) {
  const p = await prisma.promociones.findFirst({ where: { id: Number(id), ...VIGENTE } });
  return p ? mapPromocion(p) : null;
}

// ── Escrituras (CRUD) ──

export async function crearPromocion(body = {}) {
  const data = construirData(body, false);
  const creada = await prisma.promociones.create({ data });
  return mapPromocion(creada);
}

export async function actualizarPromocion(id, body = {}) {
  const existe = await prisma.promociones.findFirst({ where: { id: Number(id), ...VIGENTE } });
  if (!existe) return null;
  const data = construirData(body, true);
  data.updated_at = new Date();
  const actualizada = await prisma.promociones.update({ where: { id: existe.id }, data });
  return mapPromocion(actualizada);
}

// Soft delete. La relacion auto_promociones se borra (FK ON DELETE CASCADE no aplica
// al soft delete, asi que la limpiamos a mano).
export async function eliminarPromocion(id) {
  const existe = await prisma.promociones.findFirst({ where: { id: Number(id), ...VIGENTE } });
  if (!existe) return false;
  await prisma.$transaction([
    prisma.auto_promociones.deleteMany({ where: { promocion_id: existe.id } }),
    prisma.promociones.update({
      where: { id: existe.id },
      data: { deleted_at: new Date(), activo: false, updated_at: new Date() },
    }),
  ]);
  return true;
}

// ── Aplicacion a vehiculos (N:N) ──

async function autosPorRefs(refs) {
  const lista = (Array.isArray(refs) ? refs : [refs]).map((r) => String(r).trim()).filter(Boolean);
  if (lista.length === 0) throw error("Debe indicar al menos un vehículo (refs)");
  const autos = await prisma.autos.findMany({
    where: { ref: { in: lista }, deleted_at: null },
    select: { id: true },
  });
  return autos.map((a) => a.id);
}

// Agrega la promocion a uno o varios vehiculos (sin duplicar). Devuelve cuantos vinculos quedaron.
export async function aplicarPromocionAVehiculos(id, refs) {
  const promo = await prisma.promociones.findFirst({ where: { id: Number(id), ...VIGENTE } });
  if (!promo) throw error("Promoción no encontrada", 404);

  const autoIds = await autosPorRefs(refs);
  if (autoIds.length === 0) throw error("Ningún vehículo válido encontrado", 404);

  await prisma.auto_promociones.createMany({
    data: autoIds.map((auto_id) => ({ auto_id, promocion_id: promo.id })),
    skipDuplicates: true,
  });
  return autoIds.length;
}

// Quita la promocion de uno o varios vehiculos. Devuelve cuantos vinculos se borraron.
export async function quitarPromocionDeVehiculos(id, refs) {
  const autoIds = await autosPorRefs(refs);
  const res = await prisma.auto_promociones.deleteMany({
    where: { promocion_id: Number(id), auto_id: { in: autoIds } },
  });
  return res.count;
}
