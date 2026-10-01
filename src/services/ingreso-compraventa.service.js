import { prisma } from "../lib/prisma.js";
import { esCompraventa } from "../lib/modalidades.js";
import { error, TOPE_MONTO, numero, opcion, textoLibre, fechaSimple, momento } from "../lib/contrato-campos.js";
import { mapCompraventa, montoAPagar } from "../mappers/compraventa.mapper.js";
import { firmar, desfirmar, impresosDe } from "./legajo-contrato.service.js";
import { PARA_DETALLE } from "./ingresos.service.js";

// El boleto de compraventa de un auto que la agencia compra (compra directa) o
// recibe como parte de pago de un auto que vende (modalidad "permuta" en la
// base), con su compromiso de transferencia.
//
// Circuito igual al de la consignación: se edita libre, se firma y se congela.

const VIGENTE = { deleted_at: null };
const A_CARGO = ["agencia", "cliente"];
const FORMAS_PAGO = ["transferencia", "efectivo", "cheque"];

const limpiar = (v, max) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");
const normalizarDominio = (v) => limpiar(v, 20).toUpperCase().replace(/[\s-]/g, "").slice(0, 15);

async function ingresoVigente(ingresoId, tx = prisma) {
  const n = Number(ingresoId);
  if (!Number.isInteger(n) || n <= 0) throw error("Ingreso no encontrado.", 404);
  const ingreso = await tx.consignacion_ingresos.findFirst({ where: { id: n, ...VIGENTE }, include: PARA_DETALLE });
  if (!ingreso) throw error("Ingreso no encontrado.", 404);
  if (!esCompraventa(ingreso.modalidad)) throw error("Este ingreso es una consignación: su contrato es otro.", 409);
  return ingreso;
}

// El auto que vende la agencia en una parte de pago tiene que ser suyo y estar a
// la venta, y no puede estar comprometido en otra operación abierta: se entrega
// una sola vez.
async function autoParaPermuta(ref, ingresoId, tx) {
  const auto = await tx.autos.findFirst({
    where: { ref: String(ref ?? ""), deleted_at: null },
    select: { id: true, vendido_at: true, consignaciones: { where: VIGENTE, select: { id: true }, take: 1 } },
  });
  if (!auto) throw error("Elegí el vehículo que vende la agencia.");
  if (auto.vendido_at) throw error("Ese vehículo ya figura como vendido.", 409);
  // Un auto en consignación es de un tercero: la agencia no lo puede dar.
  if (auto.consignaciones.length) throw error("Ese vehículo está en consignación: no es de la agencia.", 409);

  const comprometido = await tx.compraventa_contratos.findFirst({
    where: {
      auto_entregado_id: auto.id,
      ...VIGENTE,
      ingreso_id: { not: ingresoId },
      consignacion_ingresos: VIGENTE,
    },
    select: { id: true },
  });
  if (comprometido) throw error("Ese vehículo ya está comprometido en otra operación con parte de pago.", 409);
  return auto.id;
}

async function datosPermuta(body, ingresoId, tx) {
  const autoId = await autoParaPermuta(body.autoEntregadoRef, ingresoId, tx);
  const dominio = normalizarDominio(body.entregadoDominio);
  if (!dominio) throw error("El dominio del vehículo que vende la agencia es obligatorio.");
  return {
    auto_entregado_id: autoId,
    entregado_dominio: dominio,
    entregado_motor: limpiar(body.entregadoMotor, 40).toUpperCase() || null,
    entregado_chasis: limpiar(body.entregadoChasis, 40).toUpperCase() || null,
    entregado_valor: numero(body.entregadoValor, "El precio de venta del vehículo de la agencia", { min: 0.01, max: TOPE_MONTO }),
  };
}

const SIN_PERMUTA = {
  auto_entregado_id: null,
  entregado_dominio: null,
  entregado_motor: null,
  entregado_chasis: null,
  entregado_valor: null,
};

async function construirData(body, ingreso, tx) {
  const precio = numero(body.precio, "El precio del vehículo", { min: 0.01, max: TOPE_MONTO });
  const permuta = ingreso.modalidad === "permuta" ? await datosPermuta(body, ingreso.id, tx) : SIN_PERMUTA;

  // Lo que se paga en el acto no puede superar lo que hay que pagar; lo que
  // falta es saldo, y un saldo sin fecha es una deuda que nadie sabe cuándo vence.
  const { monto } = montoAPagar(precio, permuta.entregado_valor);
  const pagoEnActo = numero(body.pagoEnActo ?? monto, "Lo que se paga en el acto", { max: TOPE_MONTO });
  if (pagoEnActo > monto) throw error("Lo que se paga en el acto no puede superar el total a pagar.");
  const haySaldo = pagoEnActo < monto;
  if (haySaldo && !body.saldoFecha) throw error("Queda saldo por pagar: indicá la fecha en que se paga.");

  return {
    precio,
    ...permuta,
    forma_pago: opcion(body.formaPago, "La forma de pago", FORMAS_PAGO, "transferencia"),
    pago_en_acto: pagoEnActo,
    saldo_fecha: haySaldo ? fechaSimple(body.saldoFecha, "La fecha del saldo") : null,
    entrega_at: momento(body.entrega, "La fecha y hora de entrega"),
    transferencia_dias: numero(body.transferenciaDias ?? 30, "El plazo para transferir", { min: 1, max: 365 }),
    gastos_transferencia: opcion(body.gastosTransferencia, "Los gastos de transferencia", A_CARGO, "agencia"),
    estado_unidad: textoLibre(body.estadoUnidad, "El estado de la unidad"),
    condiciones: textoLibre(body.condiciones, "Las condiciones particulares"),
    jurisdiccion: limpiar(body.jurisdiccion, 120) || null,
  };
}

const INCLUDE_CONTRATO = { auto_entregado: PARA_DETALLE.compraventa_contratos.include.auto_entregado };

export async function obtenerCompraventa(ingresoId) {
  const ingreso = await ingresoVigente(ingresoId);
  return mapCompraventa(ingreso.compraventa_contratos);
}

// Se valida y se guarda en la misma transacción: si dos operaciones eligen el mismo
// auto a la vez, la segunda ve la primera.
export async function guardarCompraventa(ingresoId, body = {}) {
  return prisma.$transaction(async (tx) => {
    const ingreso = await ingresoVigente(ingresoId, tx);
    if (ingreso.compraventa_contratos?.firmado_at) {
      throw error("El boleto ya está firmado. Desfirmalo para poder editarlo.", 409);
    }

    const data = await construirData(body, ingreso, tx);
    const guardado = await tx.compraventa_contratos.upsert({
      where: { ingreso_id: ingreso.id },
      create: { ingreso_id: ingreso.id, ...data },
      update: { ...data, deleted_at: null },
      include: INCLUDE_CONTRATO,
    });
    return mapCompraventa(guardado);
  });
}

export async function armarImpresosCompraventa(ingresoId) {
  const ingreso = await ingresoVigente(ingresoId);
  return impresosDe(ingreso, ingreso.compraventa_contratos);
}

// Se relee con el auto entregado incluido: el mapper lo necesita para mostrarlo.
const releer = (contrato) =>
  prisma.compraventa_contratos.findUnique({ where: { id: contrato.id }, include: INCLUDE_CONTRATO }).then(mapCompraventa);

export async function firmarCompraventa(ingresoId) {
  const ingreso = await ingresoVigente(ingresoId);
  return releer(await firmar(prisma.compraventa_contratos, ingreso, ingreso.compraventa_contratos));
}

export async function desfirmarCompraventa(ingresoId) {
  const ingreso = await ingresoVigente(ingresoId);
  return releer(await desfirmar(prisma.compraventa_contratos, ingreso.compraventa_contratos));
}
