import { prisma } from "../lib/prisma.js";
import { mapAutoToVehiculo } from "../mappers/vehiculo.mapper.js";

// Soft delete: solo cuentan las filas con deleted_at NULL.
const VIGENTE = { deleted_at: null };

// Un auto tomado en consignación que ya se vendió o que el dueño retiró deja de
// estar a la venta: no va al catálogo público (sí sigue en el panel).
const SIN_CONSIGNACION_CERRADA = {
  consignaciones: { none: { deleted_at: null, estado: { in: ["vendido", "retirado"] } } },
};

// Sigue a la venta: `vendido_at` NULL. Es el único campo que decide si un auto
// se vendió —propio o consignado—, así "cuántos vendí" es una sola pregunta.
const A_LA_VENTA = { vendido_at: null };

// Un auto que entró por una consignación de Documentos solo está en el stock
// mientras ese ingreso esté publicado: despublicado o retirado, no se lista.
// Manda el estado del ingreso, no el de `consignaciones`.
const SOLO_CONSIGNACION_PUBLICADA = {
  consignaciones: { none: { consignacion_ingresos: { is: { deleted_at: null, estado: { notIn: ["publicado", "vendido"] } } } } },
};

// El ingreso de Documentos acompaña la venta del auto: vendido al vender,
// publicado de nuevo si la venta se deshace. Se busca por el auto y no por la
// consignación vigente, porque esa fila puede haberse archivado.
const moverIngresoDelAuto = (tx, autoId, desde, hacia) =>
  tx.consignacion_ingresos.updateMany({
    where: { deleted_at: null, estado: desde, consignaciones: { is: { auto_id: autoId } } },
    data: { estado: hacia, estado_at: new Date() },
  });

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
  // Lo que PAGÓ la agencia. Opcional: sin costo el auto se vende igual, solo
  // que aporta 0 a la ganancia en vez de contar la venta entera como ganada.
  if (body.costo !== undefined) {
    if (body.costo === null || body.costo === "") {
      data.costo = null;
    } else {
      const costo = Number(body.costo);
      if (!(costo >= 0)) throw error("El costo no es valido");
      if (costo > PRECIO_MAX) {
        throw error(`El costo no puede superar $${PRECIO_MAX.toLocaleString("es-AR")}`);
      }
      data.costo = costo;
    }
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
  // Identificación de la unidad: la usa el boleto cuando el auto se vende con
  // parte de pago. Opcional; vacío la borra.
  const identificacion = (v, max) => String(v ?? "").trim().toUpperCase().slice(0, max) || null;
  if (body.dominio !== undefined) data.dominio = identificacion(String(body.dominio ?? "").replace(/[\s-]/g, ""), 15);
  if (body.motor !== undefined) data.motor = identificacion(body.motor, 40);
  if (body.chasis !== undefined) data.chasis = identificacion(body.chasis, 40);
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
    where: { ...VIGENTE, ...A_LA_VENTA, disponible: true, ...SIN_CONSIGNACION_CERRADA },
    orderBy: { id: "desc" },
    include: { descuentos: true, auto_promociones: { include: { promociones: true } } },
  });
  return autos.map(mapAutoToVehiculo);
}

// Listado ADMIN: todos los no eliminados (incluye no disponibles).
// `vendidos`: "no" (por defecto) solo los que siguen a la venta, "si" solo los
// vendidos, "todos" ambos. Por defecto NO se ven los vendidos: el panel es para
// trabajar sobre el stock, y los vendidos solo estorban.
export async function listarVehiculosAdmin({ vendidos = "no" } = {}) {
  const porVenta =
    vendidos === "si" ? { vendido_at: { not: null } } : vendidos === "todos" ? {} : A_LA_VENTA;

  const autos = await prisma.autos.findMany({
    where: { ...VIGENTE, ...porVenta, ...SOLO_CONSIGNACION_PUBLICADA },
    orderBy: { id: "desc" },
    include: {
      descuentos: true,
      auto_promociones: { include: { promociones: true } },
      // Solo la consignación VIGENTE: el panel necesita saber si el auto es de
      // un tercero para ofrecer "vendido / retirado" en vez de la venta propia.
      consignaciones: { where: { deleted_at: null }, orderBy: { id: "desc" }, take: 1 },
    },
  });
  const deDocumentos = await autosDeConsignacionDocumentos();
  // Dominio, motor y chasis solo en el panel: el catálogo público no los expone.
  return autos.map((a) => ({
    ...mapAutoToVehiculo(a),
    deConsignacion: deDocumentos.has(a.id),
    dominio: a.dominio ?? null,
    motor: a.motor ?? null,
    chasis: a.chasis ?? null,
  }));
}

// Autos que entraron por Documentos → Consignación. Se mira el ingreso y no la
// consignación vigente: si esa fila se archivó, el auto sigue siendo de un tercero.
async function autosDeConsignacionDocumentos() {
  const ingresos = await prisma.consignacion_ingresos.findMany({
    where: { ...VIGENTE, modalidad: "consignacion", consignacion_id: { not: null } },
    select: { consignaciones: { select: { auto_id: true } } },
  });
  return new Set(ingresos.map((i) => i.consignaciones?.auto_id).filter(Boolean));
}

// Ficha PUBLICA: mismas reglas que el catálogo, así un link guardado a un auto
// ya vendido/retirado no lo sigue mostrando.
export async function obtenerVehiculoPorRef(ref) {
  const auto = await prisma.autos.findFirst({
    where: { ref: String(ref), ...VIGENTE, ...A_LA_VENTA, ...SIN_CONSIGNACION_CERRADA },
    include: { descuentos: true, auto_promociones: { include: { promociones: true } } },
  });
  return auto ? mapAutoToVehiculo(auto) : null;
}

export async function listarMarcas() {
  const filas = await prisma.autos.findMany({
    where: { ...VIGENTE, ...A_LA_VENTA, disponible: true, ...SIN_CONSIGNACION_CERRADA },
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
// Marca el auto como VENDIDO. No lo borra: la fila queda para la contabilidad.
//
// `precio_venta` es el cierre real, no el de lista — es lo que después se suma
// como facturación. Si no lo mandan, se toma el de lista como mejor estimación.
//
// Si el auto es de un tercero (consignación vigente), además se cierra esa
// consignación como vendida: el auto y el trato son el mismo hecho comercial y
// dejarlos desincronizados hace que el auto siga apareciendo a la venta.
export async function marcarVendido(ref, { precio_venta, vendido_at } = {}) {
  const auto = await prisma.autos.findFirst({
    where: { ref: String(ref), ...VIGENTE },
    include: { consignaciones: { where: { deleted_at: null }, orderBy: { id: "desc" }, take: 1 } },
  });
  if (!auto) return null;
  if (auto.vendido_at) throw error("Ese vehículo ya figura como vendido.");

  let precio = precio_venta === undefined || precio_venta === null || precio_venta === ""
    ? Number(auto.precio)
    : Number(precio_venta);
  if (!(precio >= 0)) throw error("El precio de venta no es valido");
  if (precio > PRECIO_MAX) {
    throw error(`El precio de venta no puede superar $${PRECIO_MAX.toLocaleString("es-AR")}`);
  }

  const fecha = vendido_at ? new Date(vendido_at) : new Date();
  if (Number.isNaN(fecha.getTime())) throw error("La fecha de venta no es valida");
  if (fecha > new Date()) throw error("La fecha de venta no puede ser futura.");

  const consignacion = auto.consignaciones[0];

  // Transacción: el auto y su consignación se cierran juntos o no se cierra
  // nada. Si solo pasara una de las dos, el auto quedaría vendido con el trato
  // abierto (o al revés) y la contabilidad contaría mal.
  await prisma.$transaction(async (tx) => {
    await tx.autos.update({
      where: { id: auto.id },
      data: { vendido_at: fecha, precio_venta: precio, disponible: false, updated_at: new Date() },
    });
    if (consignacion && consignacion.estado === "en_venta") {
      await tx.consignaciones.update({
        where: { id: consignacion.id },
        data: { estado: "vendido", updated_at: new Date() },
      });
    }
    await moverIngresoDelAuto(tx, auto.id, "publicado", "vendido");
  });
  return true;
}

// Deshace la marca de vendido (se marcó por error).
// La venta es el único cierre irreversible del panel, así que necesita salida:
// sin esto, un click equivocado ensucia la contabilidad para siempre.
export async function deshacerVenta(ref) {
  const auto = await prisma.autos.findFirst({
    where: { ref: String(ref), ...VIGENTE },
    include: { consignaciones: { where: { deleted_at: null }, orderBy: { id: "desc" }, take: 1 } },
  });
  if (!auto || !auto.vendido_at) return false;

  const consignacion = auto.consignaciones[0];
  await prisma.$transaction(async (tx) => {
    await tx.autos.update({
      where: { id: auto.id },
      data: { vendido_at: null, precio_venta: null, disponible: true, updated_at: new Date() },
    });
    if (consignacion && consignacion.estado === "vendido") {
      await tx.consignaciones.update({
        where: { id: consignacion.id },
        data: { estado: "en_venta", updated_at: new Date() },
      });
    }
    await moverIngresoDelAuto(tx, auto.id, "vendido", "publicado");
  });
  return true;
}

// Cierra la consignación de un auto de tercero desde la ficha del vehículo.
// "vendido" es una venta y marca el auto; "retirado" NO lo es —el dueño se lo
// llevó, no hubo operación— así que solo lo saca del catálogo.
export async function cerrarConsignacion(ref, estado) {
  if (!["vendido", "retirado"].includes(estado)) {
    throw error("El estado debe ser 'vendido' o 'retirado'.");
  }
  const auto = await prisma.autos.findFirst({
    where: { ref: String(ref), ...VIGENTE },
    include: { consignaciones: { where: { deleted_at: null }, orderBy: { id: "desc" }, take: 1 } },
  });
  if (!auto) return null;

  const consignacion = auto.consignaciones[0];
  if (!consignacion) throw error("Ese vehículo no está en consignación.");

  if (estado === "vendido") return marcarVendido(ref, { precio_venta: consignacion.precio_pactado });

  await prisma.$transaction(async (tx) => {
    await tx.consignaciones.update({
      where: { id: consignacion.id },
      data: { estado: "retirado", updated_at: new Date() },
    });
    await tx.autos.update({
      where: { id: auto.id },
      data: { disponible: false, updated_at: new Date() },
    });
  });
  return true;
}

export async function eliminarVehiculo(ref) {
  const existe = await prisma.autos.findFirst({ where: { ref: String(ref), ...VIGENTE } });
  if (!existe) return false;
  await prisma.autos.update({
    where: { id: existe.id },
    data: { deleted_at: new Date(), disponible: false, updated_at: new Date() },
  });
  return true;
}
