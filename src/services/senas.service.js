import { prisma } from "../lib/prisma.js";
import { error, TOPE_MONTO, numero, opcion, textoLibre, fechaSimple } from "../lib/contrato-campos.js";
import { hoyFecha, senaReservando } from "../lib/senas.js";
import { mapSena } from "../mappers/sena.mapper.js";
import { registrarPersona, SELECT_PERFIL } from "./personas.service.js";

// Señas: el paso anterior al trámite. El cliente deja plata para reservar un
// auto (propio o en consignación); mientras la seña reserva, el auto no se ve
// en el catálogo y no se le puede vender a otro. Si el cliente se arrepiente,
// la seña se cancela y la plata se pierde. Si sigue adelante, la seña de un auto
// propio pasa a un trámite de parte de pago y se descuenta del precio.

const VIGENTE = { deleted_at: null };
const FORMAS_PAGO = ["efectivo", "transferencia", "cheque"];
const ESTADOS = ["vigente", "vencida", "convertida", "cancelada"];

const INCLUDE = {
  autos: {
    select: {
      ref: true,
      marca: true,
      modelo: true,
      anio: true,
      precio: true,
      vendido_at: true,
      consignaciones: { where: VIGENTE, select: { id: true }, take: 1 },
    },
  },
  clientes: { select: { id: true, nombre: true, dni: true, telefono: true, email: true, canal: true, cliente_perfiles: { select: SELECT_PERFIL } } },
  usuarios: { select: { id: true, nombre: true } },
};

function idValido(id) {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) throw error("Seña no encontrada.", 404);
  return n;
}

async function senaVigente(id, tx = prisma) {
  const sena = await tx.senas.findFirst({ where: { id: idValido(id), ...VIGENTE }, include: INCLUDE });
  if (!sena) throw error("Seña no encontrada.", 404);
  return sena;
}

// El plazo lo decide la agencia en cada seña (el panel lo pide en días): es
// obligatorio, no puede quedar en el pasado y no pasa de un año.
const MAX_DIAS = 365;
function venceValido(valor) {
  const vence = fechaSimple(valor, "El vencimiento de la seña");
  const hoy = hoyFecha();
  if (vence < hoy) throw error("El vencimiento de la seña no puede ser anterior a hoy.");
  if (vence - hoy > MAX_DIAS * 86_400_000) throw error(`El plazo de la seña no puede superar los ${MAX_DIAS} días.`);
  return vence;
}

const filtroEstado = (estado, hoy) =>
  ({
    vigente: { estado: "vigente", vence: { gte: hoy } },
    vencida: { estado: "vigente", vence: { lt: hoy } },
    convertida: { estado: "convertida" },
    cancelada: { estado: "cancelada" },
  })[estado] ?? {};

// ── Lecturas ──

// `q` busca por el cliente (nombre o DNI) o por el auto (marca, modelo o ref).
export async function listarSenas({ estado = "", q = "", offset = 0, limite = 10 } = {}) {
  const take = Math.max(1, Math.min(50, Number(limite) || 10));
  const skip = Math.max(0, Number(offset) || 0);
  const termino = String(q || "").trim();

  const filtros = [VIGENTE];
  if (ESTADOS.includes(estado)) filtros.push(filtroEstado(estado, hoyFecha()));
  if (termino) {
    const digitos = termino.replace(/\D/g, "");
    filtros.push({
      OR: [
        { clientes: { nombre: { contains: termino } } },
        ...(digitos.length >= 6 ? [{ clientes: { dni: { contains: digitos } } }] : []),
        { autos: { marca: { contains: termino } } },
        { autos: { modelo: { contains: termino } } },
        { autos: { ref: termino } },
      ],
    });
  }
  const where = { AND: filtros };

  const [filas, total] = await Promise.all([
    prisma.senas.findMany({ where, include: INCLUDE, orderBy: { id: "desc" }, skip, take: take + 1 }),
    prisma.senas.count({ where }),
  ]);
  const hayMas = filas.length > take;
  return { items: (hayMas ? filas.slice(0, take) : filas).map(mapSena), hayMas, total };
}

export async function obtenerSena(id) {
  return mapSena(await senaVigente(id));
}

// ── Escrituras ──

// El auto tiene que estar a la venta y libre: sin otra seña que lo reserve y,
// si es de la agencia, sin estar comprometido en otro boleto de parte de pago.
async function autoParaSenar(ref, tx) {
  const auto = await tx.autos.findFirst({
    where: { ref: String(ref ?? ""), ...VIGENTE },
    select: { id: true, vendido_at: true },
  });
  if (!auto) throw error("Elegí el vehículo que se seña.");
  if (auto.vendido_at) throw error("Ese vehículo ya figura como vendido.", 409);

  const reservado = await tx.senas.findFirst({ where: { auto_id: auto.id, ...senaReservando() }, select: { id: true } });
  if (reservado) throw error("Ese vehículo ya tiene una seña que lo reserva.", 409);

  const comprometido = await tx.compraventa_contratos.findFirst({
    where: { auto_entregado_id: auto.id, ...VIGENTE, consignacion_ingresos: VIGENTE },
    select: { id: true },
  });
  const enTramite = await tx.consignacion_ingresos.findFirst({
    where: { auto_interes_id: auto.id, ...VIGENTE, estado: { not: "vendido" } },
    select: { id: true },
  });
  if (comprometido || enTramite) throw error("Ese vehículo ya está en un trámite de venta abierto.", 409);
  return auto;
}

// Monto, forma de pago, vencimiento y notas. Solo los campos presentes.
function datosSena(body, { alta }) {
  const data = {};
  if (alta || body.monto !== undefined) data.monto = numero(body.monto, "El monto de la seña", { min: 0.01, max: TOPE_MONTO });
  if (alta || body.formaPago !== undefined) data.forma_pago = opcion(body.formaPago, "La forma de pago", FORMAS_PAGO, "efectivo");
  if (alta || body.vence !== undefined) data.vence = venceValido(body.vence);
  if (alta || body.notas !== undefined) data.notas = textoLibre(body.notas, "Las notas");
  return data;
}

// Se valida y se guarda en la misma transacción: si dos personas señan el mismo
// auto a la vez, la segunda ve la primera.
export async function crearSena(body = {}, usuarioId = null) {
  const data = datosSena(body, { alta: true });
  if (!body.cliente) throw error("Faltan los datos del cliente.");

  return prisma.$transaction(async (tx) => {
    const auto = await autoParaSenar(body.autoRef, tx);
    const clienteId = await registrarPersona(body.cliente, tx);
    const creada = await tx.senas.create({
      data: { ...data, auto_id: auto.id, cliente_id: clienteId, creado_por: usuarioId },
      include: INCLUDE,
    });
    return mapSena(creada);
  });
}

// Solo se edita mientras está vigente (también vencida: así se le extiende el
// plazo). Convertida o cancelada ya es historia.
export async function actualizarSena(id, body = {}) {
  const sena = await senaVigente(id);
  if (sena.estado !== "vigente") throw error("Solo se edita una seña vigente.", 409);

  const actualizada = await prisma.senas.update({
    where: { id: sena.id },
    data: { ...datosSena(body, { alta: false }), updated_at: new Date() },
    include: INCLUDE,
  });
  return mapSena(actualizada);
}

// El cliente se arrepintió: la seña se pierde y el auto vuelve a estar libre.
export async function cancelarSena(id) {
  const sena = await senaVigente(id);
  if (sena.estado !== "vigente") throw error("Solo se cancela una seña vigente.", 409);

  const cancelada = await prisma.senas.update({
    where: { id: sena.id },
    data: { estado: "cancelada", estado_at: new Date(), updated_at: new Date() },
    include: INCLUDE,
  });
  return mapSena(cancelada);
}

// La seña sigue adelante: se abre el trámite de parte de pago en Documentos con
// el cliente como titular. El auto queda reservado mientras el trámite esté
// abierto, y la seña se descuenta del precio en el boleto.
//
// Un auto en consignación no pasa por acá: es de un tercero y no entra en una
// parte de pago. Su seña se cierra al marcarlo vendido.
export async function iniciarTramite(id, usuarioId = null) {
  return prisma.$transaction(async (tx) => {
    const sena = await senaVigente(id, tx);
    if (sena.estado !== "vigente") throw error("Solo una seña vigente pasa a trámite.", 409);
    if (new Date(sena.vence) < hoyFecha()) throw error("La seña está vencida: extendé el vencimiento antes de iniciar el trámite.", 409);
    if (sena.autos.vendido_at) throw error("Ese vehículo ya figura como vendido.", 409);
    if (sena.autos.consignaciones.length) {
      throw error("El vehículo está en consignación: no entra en una parte de pago. La seña se cierra al marcarlo vendido.", 409);
    }

    const ingreso = await tx.consignacion_ingresos.create({
      data: { modalidad: "permuta", cliente_id: sena.cliente_id, auto_interes_id: sena.auto_id, recibido_por: usuarioId },
      select: { id: true },
    });
    const convertida = await tx.senas.update({
      where: { id: sena.id },
      data: { estado: "convertida", estado_at: new Date(), ingreso_id: ingreso.id, updated_at: new Date() },
      include: INCLUDE,
    });
    return { ingresoId: ingreso.id, sena: mapSena(convertida) };
  });
}

// Soft delete, para una seña cargada por error. Una convertida no: tiene un
// trámite colgando.
export async function eliminarSena(id) {
  const sena = await senaVigente(id);
  if (sena.estado === "convertida") throw error("La seña ya pasó a un trámite: no se puede borrar.", 409);
  await prisma.senas.update({ where: { id: sena.id }, data: { deleted_at: new Date(), updated_at: new Date() } });
  return true;
}
