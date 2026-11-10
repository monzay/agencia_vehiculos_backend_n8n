import { prisma } from "../lib/prisma.js";
import { mapAutoToVehiculo } from "../mappers/vehiculo.mapper.js";
import { SIN_RESERVA, SIN_TRAMITE_ABIERTO, senaReservando, hoyFecha } from "../lib/senas.js";
import { normalizarTipoVehiculo } from "../lib/tipos-vehiculo.js";
import { normalizarDominio, normalizarIdentificacion } from "../lib/identificacion-vehiculo.js";
import { normalizarCombustible } from "../lib/combustibles.js";
import { numero, TOPE_MONTO } from "../lib/contrato-campos.js";

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

// La compra de la agencia termina cuando se vende ese usado. Mientras sigue abierta, su
// dominio queda tomado y el auto no podría volver a entrar.
const moverCompraDelAuto = (tx, autoId, desde, hacia) =>
  tx.consignacion_ingresos.updateMany({
    where: { deleted_at: null, modalidad: "compra", estado: desde, preparacion: { is: { auto_id: autoId } } },
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
// Recibe la transacción cuando el alta es parte de una (importar una lista).
export async function siguienteRef(tx = prisma) {
  const r = await tx.$queryRawUnsafe(
    "SELECT COALESCE(MAX(CAST(ref AS UNSIGNED)),0)+1 AS next FROM autos"
  );
  return String(Number(r[0].next));
}

// Largos de las columnas de texto de `autos`: pasarse da un error de la base
// (500) en vez de uno de formulario.
const MARCA_MAX = 60;
const MODELO_MAX = 80;
const VERSION_MAX = 80;

const textoDe = (valor) => (typeof valor === "string" ? valor.trim() : "");

// Monto que el auto puede no tener: vacío lo deja sin dato.
const montoOpcional = (valor, campo) =>
  valor === null || valor === "" ? null : numero(valor, campo, { min: 0.01, max: TOPE_MONTO });

// Valida y arma el `data` para crear/editar. `parcial`=true permite campos ausentes (PATCH).
function construirData(body, parcial = false) {
  const data = {};

  if (!parcial || body.marca !== undefined || body.nombre !== undefined) {
    const marca = textoDe(body.marca ?? body.nombre);
    if (!marca) throw error("La marca/nombre es obligatoria");
    if (marca.length > MARCA_MAX) throw error(`La marca no puede tener más de ${MARCA_MAX} caracteres`);
    data.marca = marca;
  }
  if (!parcial || body.modelo !== undefined) {
    const modelo = textoDe(body.modelo);
    if (!modelo) throw error("El modelo es obligatorio");
    if (modelo.length > MODELO_MAX) throw error(`El modelo no puede tener más de ${MODELO_MAX} caracteres`);
    data.modelo = modelo;
  }
  if (body.version !== undefined) data.version = textoDe(body.version).slice(0, VERSION_MAX) || null;
  if (!parcial || body.anio !== undefined || body.year !== undefined) {
    const anio = Number(body.anio ?? body.year);
    if (!Number.isInteger(anio) || anio < 1900 || anio > 2100) throw error("El año no es valido");
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
  if (body.precio_contado !== undefined) data.precio_contado = montoOpcional(body.precio_contado, "El precio al contado");
  if (body.anticipo !== undefined) data.anticipo = montoOpcional(body.anticipo, "El anticipo");
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
  // Identificación de la unidad: la usa el boleto cuando el auto se vende (y el
  // boleto también la puede completar). Opcional acá; vacío la borra.
  if (body.dominio !== undefined) data.dominio = normalizarDominio(body.dominio);
  if (body.motor !== undefined) data.motor = normalizarIdentificacion(body.motor, 40);
  if (body.chasis !== undefined) data.chasis = normalizarIdentificacion(body.chasis, 40);
  // Columnas atómicas (1NF): tipo de vehículo (auto/camioneta/moto) y combustible.
  if (body.tipoVehiculo !== undefined || body.tipo_vehiculo !== undefined) {
    data.tipo_vehiculo = normalizarTipoVehiculo(body.tipoVehiculo ?? body.tipo_vehiculo);
  }
  if (body.combustible !== undefined) data.combustible = normalizarCombustible(body.combustible);
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
    where: { ...VIGENTE, ...A_LA_VENTA, disponible: true, ...SIN_CONSIGNACION_CERRADA, ...SIN_RESERVA(), ...SIN_TRAMITE_ABIERTO },
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
      // La seña que lo reserva, si hay: el panel la muestra y no ofrece señarlo de nuevo.
      senas: { where: senaReservando(), take: 1, select: { id: true, vence: true, estado: true, ingreso_id: true, clientes: { select: { nombre: true } } } },
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
    sena: senaDelAuto(a.senas?.[0]),
  }));
}

const senaDelAuto = (s) =>
  s
    ? {
        id: s.id,
        estado: s.estado, // vigente | convertida (ya pasó a un trámite)
        vence: s.vence ? new Date(s.vence).toISOString().slice(0, 10) : null,
        cliente: s.clientes?.nombre ?? null,
        ingresoId: s.ingreso_id ?? null,
      }
    : null;

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
    where: { ref: String(ref), ...VIGENTE, ...A_LA_VENTA, disponible: true, ...SIN_CONSIGNACION_CERRADA, ...SIN_RESERVA(), ...SIN_TRAMITE_ABIERTO },
    include: { descuentos: true, auto_promociones: { include: { promociones: true } } },
  });
  return auto ? mapAutoToVehiculo(auto) : null;
}

export async function listarMarcas() {
  const filas = await prisma.autos.findMany({
    where: { ...VIGENTE, ...A_LA_VENTA, disponible: true, ...SIN_CONSIGNACION_CERRADA, ...SIN_RESERVA(), ...SIN_TRAMITE_ABIERTO },
    distinct: ["marca"],
    select: { marca: true },
    orderBy: { marca: "asc" },
  });
  return filas.map((f) => f.marca);
}

// ── Escrituras (CRUD) ──

// Los datos de un alta, validados con las reglas del formulario. Sin `ref`: la
// pone quien crea, porque al importar una lista van varias seguidas.
export function datosDeAlta(body = {}) {
  return { tipo: "usado", disponible: true, ...construirData(body, false) };
}

export async function crearVehiculo(body = {}) {
  const auto = await prisma.autos.create({ data: { ...datosDeAlta(body), ref: await siguienteRef() } });
  return mapAutoToVehiculo(auto);
}

// Un auto vendido no vuelve a estar disponible por una edición: para eso se
// deshace la venta (la base también lo exige, migración 071).
export function exigirVentaCoherente(existe, data) {
  if (existe.vendido_at && data.disponible === true) {
    throw error("Este vehículo figura vendido: para volver a ofrecerlo, deshacé la venta.", 409);
  }
}

export async function actualizarVehiculo(ref, body = {}) {
  const existe = await prisma.autos.findFirst({ where: { ref: String(ref), ...VIGENTE } });
  if (!existe) return null;
  const data = construirData(body, true);
  exigirVentaCoherente(existe, data);
  data.updated_at = new Date();
  const auto = await prisma.autos.update({ where: { id: existe.id }, data });
  return mapAutoToVehiculo(auto);
}

// Marca el auto como VENDIDO. No lo borra: la fila queda para la contabilidad.
//
// `precio_venta` es el cierre real, no el de lista — es lo que después se suma
// como facturación. Si no lo mandan, se toma el de lista como mejor estimación.
//
// Si el auto es de un tercero (consignación vigente), además se cierra esa
// consignación como vendida: el auto y el trato son el mismo hecho comercial y
// dejarlos desincronizados hace que el auto siga apareciendo a la venta.
// Un auto en un trámite de venta se vende desde su legajo: ahí se exige el boleto
// firmado, y deshacer la venta también vuelve atrás el trámite.
async function exigirSinTramiteDeVenta(autoId) {
  const tramite = await prisma.consignacion_ingresos.findFirst({ where: { auto_interes_id: autoId, ...VIGENTE }, select: { id: true } });
  if (tramite) throw error("Este vehículo está en un trámite de venta: manejá la venta desde su legajo, en Documentos.", 409);
}

export async function marcarVendido(ref, { precio_venta, vendido_at } = {}) {
  const auto = await autoConConsignacion({ ref: String(ref) });
  if (!auto) return null;
  if (auto.vendido_at) throw error("Ese vehículo ya figura como vendido.");
  await exigirSinTramiteDeVenta(auto.id);

  const precio = precio_venta === undefined || precio_venta === null || precio_venta === ""
    ? Number(auto.precio)
    : Number(precio_venta);
  const fecha = vendido_at ? new Date(vendido_at) : new Date();

  // Transacción: el auto y su consignación se cierran juntos o no se cierra
  // nada. Si solo pasara una de las dos, el auto quedaría vendido con el trato
  // abierto (o al revés) y la contabilidad contaría mal.
  await prisma.$transaction((tx) => cerrarVenta(tx, auto, { precio, fecha }));
  return true;
}

// Deshace la marca de vendido (se marcó por error).
// La venta es el único cierre irreversible del panel, así que necesita salida:
// sin esto, un click equivocado ensucia la contabilidad para siempre.
export async function deshacerVenta(ref) {
  const auto = await autoConConsignacion({ ref: String(ref) });
  if (!auto || !auto.vendido_at) return false;
  await exigirSinTramiteDeVenta(auto.id);
  await prisma.$transaction((tx) => abrirVenta(tx, auto));
  return true;
}

// El auto con su consignación vigente: lo que hace falta para cerrar o abrir la venta.
export const autoConConsignacion = (where, tx = prisma) =>
  tx.autos.findFirst({
    where: { ...where, ...VIGENTE },
    include: { consignaciones: { where: { deleted_at: null }, orderBy: { id: "desc" }, take: 1 } },
  });

// Cierra la venta dentro de una transacción. La usan Vehículos y el legajo de
// Documentos (venta al contado o con parte de pago), así las dos puertas
// marcan lo mismo.
export async function cerrarVenta(tx, auto, { precio, fecha }) {
  if (!(precio >= 0)) throw error("El precio de venta no es valido");
  if (precio > PRECIO_MAX) throw error(`El precio de venta no puede superar $${PRECIO_MAX.toLocaleString("es-AR")}`);
  if (Number.isNaN(fecha.getTime())) throw error("La fecha de venta no es valida");
  if (fecha > new Date()) throw error("La fecha de venta no puede ser futura.");

  await tx.autos.update({
    where: { id: auto.id },
    data: { vendido_at: fecha, precio_venta: precio, disponible: false, updated_at: new Date() },
  });
  const consignacion = auto.consignaciones?.[0];
  if (consignacion && consignacion.estado === "en_venta") {
    await tx.consignaciones.update({ where: { id: consignacion.id }, data: { estado: "vendido", updated_at: new Date() } });
  }
  await moverIngresoDelAuto(tx, auto.id, "publicado", "vendido");
  await moverCompraDelAuto(tx, auto.id, "recepcion", "vendido");
  // La seña que lo reservaba se concretó con la venta.
  await tx.senas.updateMany({
    where: { auto_id: auto.id, deleted_at: null, estado: "vigente", vence: { gte: hoyFecha() } },
    data: { estado: "convertida", estado_at: new Date(), updated_at: new Date() },
  });
}

export async function abrirVenta(tx, auto) {
  await tx.autos.update({
    where: { id: auto.id },
    data: { vendido_at: null, precio_venta: null, disponible: true, updated_at: new Date() },
  });
  const consignacion = auto.consignaciones?.[0];
  if (consignacion && consignacion.estado === "vendido") {
    await tx.consignaciones.update({ where: { id: consignacion.id }, data: { estado: "en_venta", updated_at: new Date() } });
  }
  await moverIngresoDelAuto(tx, auto.id, "vendido", "publicado");
  await moverCompraDelAuto(tx, auto.id, "vendido", "recepcion");
  // La seña que se cerró con esta venta vuelve a reservar el auto.
  if (auto.vendido_at) {
    await tx.senas.updateMany({
      where: { auto_id: auto.id, deleted_at: null, estado: "convertida", ingreso_id: null, estado_at: { gte: auto.vendido_at } },
      data: { estado: "vigente", estado_at: new Date(), updated_at: new Date() },
    });
  }
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
