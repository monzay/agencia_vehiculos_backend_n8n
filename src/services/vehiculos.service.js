import { prisma } from "../lib/prisma.js";
import { mapAutoToVehiculo } from "../mappers/vehiculo.mapper.js";

// Soft delete: solo cuentan las filas con deleted_at NULL.
const VIGENTE = { deleted_at: null };

// Un auto tomado en consignación que ya se vendió o que el dueño retiró deja de
// estar a la venta: no va al catálogo público (sí sigue en el panel).
const SIN_CONSIGNACION_CERRADA = {
  consignaciones: { none: { deleted_at: null, estado: { in: ["vendido", "retirado"] } } },
};

// Tope de `autos.stock` (SMALLINT UNSIGNED en la DB).
const STOCK_MAX = 65535;
// Tope de `autos.precio` (DECIMAL(12,2): 10 enteros + 2 decimales).
const PRECIO_MAX = 9999999999.99;
// Tope de `autos.kms` (INT UNSIGNED).
const KMS_MAX = 4294967295;

// Los tres son limites de la COLUMNA, no del negocio: sin validarlos aca, MySQL
// rechaza el INSERT y Prisma tira P2020 ("Out of range value"), que sale como un
// 500 en vez de un error de formulario que el admin pueda entender y corregir.

function limpiar(v) {
  return typeof v === "string" ? v.trim() : v;
}
function error(mensaje, status = 400) {
  const e = new Error(mensaje);
  e.status = status;
  return e;
}

// Normaliza el campo de imagenes: acepta array o texto (una por linea / coma).
function normalizarImgs(imgs) {
  if (Array.isArray(imgs)) return imgs.map((s) => String(s).trim()).filter(Boolean);
  if (typeof imgs === "string") {
    return imgs
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

// condicion del front ('0km'|'usado') -> enum Prisma ('km'|'usado').
function condicionAEnum(condicion) {
  return condicion === "0km" ? "km" : "usado";
}

// Genera el proximo `ref` numerico (la tabla lo usa como identificador unico string).
async function siguienteRef() {
  const r = await prisma.$queryRawUnsafe(
    "SELECT COALESCE(MAX(CAST(ref AS UNSIGNED)),0)+1 AS next FROM autos"
  );
  return String(Number(r[0].next));
}

// Valida y arma el `data` para crear/editar. `parcial`=true permite campos ausentes (PATCH).
function construirData(body, parcial = false) {
  const data = {};

  if (!parcial || body.marca !== undefined || body.nombre !== undefined) {
    const marca = limpiar(body.marca ?? body.nombre);
    if (!marca) throw error("La marca/nombre es obligatoria");
    data.marca = marca;
  }
  if (!parcial || body.modelo !== undefined) {
    const modelo = limpiar(body.modelo);
    if (!modelo) throw error("El modelo es obligatorio");
    data.modelo = modelo;
  }
  if (!parcial || body.anio !== undefined || body.year !== undefined) {
    const anio = Number(body.anio ?? body.year);
    if (!anio || anio < 1900 || anio > 2100) throw error("El año no es valido");
    data.anio = anio;
  }
  if (!parcial || body.precio !== undefined) {
    const precio = Number(body.precio);
    if (!(precio >= 0)) throw error("El precio no es valido");
    if (precio > PRECIO_MAX) {
      throw error(`El precio no puede superar $${PRECIO_MAX.toLocaleString("es-AR")}`);
    }
    data.precio = precio;
  }
  if (body.kms !== undefined) {
    const kms = Number(body.kms) || 0;
    if (kms < 0 || kms > KMS_MAX) {
      throw error(`Los kilometros deben estar entre 0 y ${KMS_MAX.toLocaleString("es-AR")}`);
    }
    data.kms = Math.round(kms);
  }
  if (body.stock !== undefined) {
    const stock = Number(body.stock);
    if (!Number.isInteger(stock) || stock < 0 || stock > STOCK_MAX) {
      throw error(`El stock debe ser un entero entre 0 y ${STOCK_MAX}`);
    }
    data.stock = stock;
  }
  if (body.descripcion !== undefined) data.descripcion = limpiar(body.descripcion) || null;
  // Columnas atómicas (1NF): tipo de vehículo (auto/moto) y combustible.
  if (body.tipoVehiculo !== undefined || body.tipo_vehiculo !== undefined) {
    const tv = limpiar(body.tipoVehiculo ?? body.tipo_vehiculo);
    data.tipo_vehiculo = tv === "moto" ? "moto" : "auto";
  }
  if (body.combustible !== undefined) {
    data.combustible = limpiar(body.combustible) || null;
  }
  if (body.imgs !== undefined || body.fotos !== undefined) {
    data.fotos_json = normalizarImgs(body.imgs ?? body.fotos);
  }
  if (body.condicion !== undefined || body.tipo !== undefined) {
    data.tipo = condicionAEnum(body.condicion ?? body.tipo);
  }
  if (body.disponible !== undefined) data.disponible = Boolean(body.disponible);
  return data;
}

// ── Lecturas ──

// Catalogo PUBLICO: disponibles y no eliminados.
export async function listarVehiculos() {
  const autos = await prisma.autos.findMany({
    where: { ...VIGENTE, disponible: true, ...SIN_CONSIGNACION_CERRADA },
    orderBy: { id: "desc" },
    include: { descuentos: true, auto_promociones: { include: { promociones: true } } },
  });
  return autos.map(mapAutoToVehiculo);
}

// Listado ADMIN: todos los no eliminados (incluye no disponibles).
export async function listarVehiculosAdmin() {
  const autos = await prisma.autos.findMany({
    where: VIGENTE,
    orderBy: { id: "desc" },
    include: { descuentos: true, auto_promociones: { include: { promociones: true } } },
  });
  return autos.map(mapAutoToVehiculo);
}

// Ficha PUBLICA: mismas reglas que el catálogo, así un link guardado a un auto
// ya vendido/retirado no lo sigue mostrando.
export async function obtenerVehiculoPorRef(ref) {
  const auto = await prisma.autos.findFirst({
    where: { ref: String(ref), ...VIGENTE, ...SIN_CONSIGNACION_CERRADA },
    include: { descuentos: true, auto_promociones: { include: { promociones: true } } },
  });
  return auto ? mapAutoToVehiculo(auto) : null;
}

export async function listarMarcas() {
  const filas = await prisma.autos.findMany({
    where: { ...VIGENTE, disponible: true, ...SIN_CONSIGNACION_CERRADA },
    distinct: ["marca"],
    select: { marca: true },
    orderBy: { marca: "asc" },
  });
  return filas.map((f) => f.marca);
}

// ── Escrituras (CRUD) ──

export async function crearVehiculo(body = {}) {
  const data = construirData(body, false);
  if (data.tipo === undefined) data.tipo = "usado"; // condicion por defecto
  if (data.disponible === undefined) data.disponible = true;
  data.ref = await siguienteRef();

  const auto = await prisma.autos.create({ data });
  return mapAutoToVehiculo(auto);
}

export async function actualizarVehiculo(ref, body = {}) {
  const existe = await prisma.autos.findFirst({ where: { ref: String(ref), ...VIGENTE } });
  if (!existe) return null;
  const data = construirData(body, true);
  data.updated_at = new Date();
  const auto = await prisma.autos.update({ where: { id: existe.id }, data });
  return mapAutoToVehiculo(auto);
}

// Soft delete.
export async function eliminarVehiculo(ref) {
  const existe = await prisma.autos.findFirst({ where: { ref: String(ref), ...VIGENTE } });
  if (!existe) return false;
  await prisma.autos.update({
    where: { id: existe.id },
    data: { deleted_at: new Date(), disponible: false, updated_at: new Date() },
  });
  return true;
}
