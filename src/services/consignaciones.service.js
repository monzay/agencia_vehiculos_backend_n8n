import { prisma } from "../lib/prisma.js";
import { mapConsignacion } from "../mappers/consignacion.mapper.js";

// Registro de vehículos tomados en consignación. Alta manual desde el panel.
// El vehículo se elige del catálogo por su `ref` (igual que en Descuentos);
// acá se guarda la FK `auto_id`.

// Soft delete: solo cuentan las filas con deleted_at NULL.
const VIGENTE = { deleted_at: null };

// El auto se trae siempre: el panel muestra marca/modelo/año/kms desde ahí.
const CON_AUTO = { autos: { select: { ref: true, marca: true, modelo: true, anio: true, kms: true, precio: true, fotos_json: true } } };

const ESTADOS = ["en_venta", "vendido", "retirado"];

const limpiar = (v, max) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : v);

function error(mensaje, status = 400) {
  const e = new Error(mensaje);
  e.status = status;
  return e;
}

// Número obligatorio dentro de un rango.
function numero(valor, campo, { min, max } = {}) {
  const n = Number(valor);
  if (valor === "" || valor === null || valor === undefined || !Number.isFinite(n)) {
    throw error(`${campo} debe ser un número.`);
  }
  if (min != null && n < min) throw error(`${campo} no puede ser menor a ${min}.`);
  if (max != null && n > max) throw error(`${campo} no puede ser mayor a ${max}.`);
  return n;
}

// Resuelve la `ref` del catálogo a la FK. Un auto no puede estar en dos
// consignaciones vigentes a la vez: sería el mismo vehículo prometido dos veces.
async function resolverAuto(ref, excluyendoId = null) {
  const buscada = limpiar(ref, 30);
  if (!buscada) throw error("Elegí un vehículo del catálogo.");

  const auto = await prisma.autos.findFirst({ where: { ref: buscada, deleted_at: null }, select: { id: true } });
  if (!auto) throw error("Ese vehículo no existe en el catálogo.", 404);

  const yaTomado = await prisma.consignaciones.findFirst({
    where: { auto_id: auto.id, ...VIGENTE, ...(excluyendoId ? { id: { not: excluyendoId } } : {}) },
    select: { id: true },
  });
  if (yaTomado) throw error("Ese vehículo ya está en otra consignación.", 409);

  return auto.id;
}

// Valida y arma el `data`. `parcial` = true permite campos ausentes (PATCH).
// `id` = la consignación que se está editando (para no chocar consigo misma).
async function construirData(body, { parcial = false, id = null } = {}) {
  const data = {};
  const pedido = (campo) => !parcial || body[campo] !== undefined;

  if (pedido("vehiculoRef")) {
    data.auto_id = await resolverAuto(body.vehiculoRef, id);
  }
  if (pedido("duenioNombre")) {
    const nombre = limpiar(body.duenioNombre, 120);
    if (!nombre) throw error("El nombre del dueño es obligatorio.");
    data.duenio_nombre = nombre;
  }
  if (pedido("precioPactado")) {
    data.precio_pactado = numero(body.precioPactado, "El precio pactado", { min: 0 });
  }
  if (pedido("comision")) {
    data.comision = numero(body.comision, "La comisión", { min: 0, max: 100 });
  }

  // ── Opcionales: "" o null los borran ──
  if (body.patente !== undefined) {
    data.patente = limpiar(body.patente, 15)?.toUpperCase() || null;
  }
  if (body.duenioTelefono !== undefined) {
    data.duenio_telefono = limpiar(body.duenioTelefono, 30) || null;
  }
  if (body.notas !== undefined) {
    data.notas = typeof body.notas === "string" ? body.notas.trim() || null : null;
  }
  if (pedido("estado")) {
    const estado = body.estado ?? "en_venta";
    if (!ESTADOS.includes(estado)) throw error(`El estado debe ser uno de: ${ESTADOS.join(", ")}.`);
    data.estado = estado;
  }

  return data;
}

// ── Lecturas ──

// Lista paginada con búsqueda y filtro por estado, todo resuelto en la base.
// `q` busca por vehículo (del catálogo), patente o dueño.
export async function listarConsignaciones({ estado = "", q = "", offset = 0, limite = 10 } = {}) {
  const take = Math.max(1, Number(limite) || 10);
  const skip = Math.max(0, Number(offset) || 0);
  const termino = String(q || "").trim();

  const filtros = [VIGENTE];
  if (ESTADOS.includes(estado)) filtros.push({ estado });
  if (termino) {
    const anio = /^\d{4}$/.test(termino) ? Number(termino) : null;
    filtros.push({
      OR: [
        { patente: { contains: termino } },
        { duenio_nombre: { contains: termino } },
        { duenio_telefono: { contains: termino } },
        // El vehículo vive en `autos`: se busca a través de la relación.
        { autos: { ref: { contains: termino } } },
        { autos: { marca: { contains: termino } } },
        { autos: { modelo: { contains: termino } } },
        ...(anio != null ? [{ autos: { anio } }] : []),
      ],
    });
  }
  const where = { AND: filtros };

  const [filas, total] = await Promise.all([
    prisma.consignaciones.findMany({ where, include: CON_AUTO, orderBy: { id: "desc" }, skip, take: take + 1 }),
    prisma.consignaciones.count({ where }),
  ]);
  const hayMas = filas.length > take;
  return { items: (hayMas ? filas.slice(0, take) : filas).map(mapConsignacion), hayMas, total };
}

export async function obtenerConsignacion(id) {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) return null;
  const c = await prisma.consignaciones.findFirst({ where: { id: n, ...VIGENTE }, include: CON_AUTO });
  return c ? mapConsignacion(c) : null;
}

// ── Escrituras ──

export async function crearConsignacion(body = {}) {
  const data = await construirData(body, { parcial: false });
  const creada = await prisma.consignaciones.create({ data, include: CON_AUTO });
  return mapConsignacion(creada);
}

export async function actualizarConsignacion(id, body = {}) {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) return null;
  const existe = await prisma.consignaciones.findFirst({ where: { id: n, ...VIGENTE } });
  if (!existe) return null;

  const data = await construirData(body, { parcial: true, id: existe.id });
  data.updated_at = new Date();
  const actualizada = await prisma.consignaciones.update({ where: { id: existe.id }, data, include: CON_AUTO });
  return mapConsignacion(actualizada);
}

// Soft delete: la fila queda para auditoría, y el auto vuelve a estar libre.
export async function eliminarConsignacion(id) {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) return false;
  const existe = await prisma.consignaciones.findFirst({ where: { id: n, ...VIGENTE } });
  if (!existe) return false;

  await prisma.consignaciones.update({
    where: { id: existe.id },
    data: { deleted_at: new Date(), updated_at: new Date() },
  });
  return true;
}
