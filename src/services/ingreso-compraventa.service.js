import { prisma } from "../lib/prisma.js";
import { esCompraventa, vendeLaAgencia } from "../lib/modalidades.js";
import { error, TOPE_MONTO, numero, opcion, textoLibre, fechaSimple, momento } from "../lib/contrato-campos.js";
import { mapCompraventa, montoAPagar, senaDelIngreso } from "../mappers/compraventa.mapper.js";
import { firmar, desfirmar, impresosDe } from "./legajo-contrato.service.js";
import { PARA_DETALLE } from "./ingresos.service.js";
import { autoConConsignacion, cerrarVenta, abrirVenta } from "./vehiculos.service.js";
import { autoParaVender } from "./auto-venta.service.js";

// El boleto de compraventa: de un auto que la agencia compra (compra directa),
// o de un auto que la agencia vende, al contado o con parte de pago (modalidad
// "permuta" en la base, donde el cliente puede entregar un usado a cuenta).
//
// Circuito igual al de la consignación: se edita libre, se firma y se congela.

const VIGENTE = { deleted_at: null };
const A_CARGO = ["agencia", "cliente"];
const FORMAS_PAGO = ["transferencia", "efectivo", "cheque"];

const limpiar = (v, max) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");

async function ingresoVigente(ingresoId, tx = prisma) {
  const n = Number(ingresoId);
  if (!Number.isInteger(n) || n <= 0) throw error("Ingreso no encontrado.", 404);
  const ingreso = await tx.consignacion_ingresos.findFirst({ where: { id: n, ...VIGENTE }, include: PARA_DETALLE });
  if (!ingreso) throw error("Ingreso no encontrado.", 404);
  if (!esCompraventa(ingreso.modalidad)) throw error("Este ingreso es una consignación: su contrato es otro.", 409);
  return ingreso;
}

// El auto que vende la agencia es el que se eligió al crear el trámite. Se
// vuelve a validar al guardar el boleto (pudo venderse o reservarse después), y
// el boleto lo identifica por su dominio, que sale de la ficha del auto.
// Dominio, motor y chasis se copian al boleto: quedan escritos tal como estaban
// al firmar, aunque después se edite la ficha.
async function datosPermuta(body, ingreso, tx) {
  if (!ingreso.auto_interes) throw error("El trámite no tiene el vehículo que compra el cliente: elegilo en Editar trámite.", 409);
  const auto = await autoParaVender(ingreso.auto_interes.ref, ingreso.id, tx);
  if (!auto.dominio) throw error("Ese vehículo no tiene dominio cargado. Completalo en Vehículos → Editar.", 409);
  return {
    auto_entregado_id: auto.id,
    entregado_dominio: auto.dominio,
    entregado_motor: auto.motor,
    entregado_chasis: auto.chasis,
    entregado_valor: numero(body.entregadoValor, "El precio de venta del vehículo de la agencia", { min: 0.01, max: TOPE_MONTO }),
  };
}

// Si el vehículo del trámite se cambió después de guardar el boleto, el boleto
// todavía nombra el anterior: no se firma, imprime ni vende hasta guardarlo de nuevo.
function exigirBoletoAlDia(ingreso) {
  const boleto = ingreso.compraventa_contratos;
  if (!vendeLaAgencia(ingreso.modalidad) || !boleto || boleto.firmado_at) return;
  if (boleto.auto_entregado_id !== ingreso.auto_interes_id) {
    throw error("El vehículo del trámite cambió: volvé a guardar las condiciones del boleto.", 409);
  }
}

const SIN_PERMUTA = {
  auto_entregado_id: null,
  entregado_dominio: null,
  entregado_motor: null,
  entregado_chasis: null,
  entregado_valor: null,
};

// `precio` es lo que vale el auto que recibe la agencia. En la parte de pago no
// se carga en el boleto: es el valor de toma del trámite, o 0 si el cliente no
// entrega un usado. En la venta al contado no hay usado.
function valorDelUsado(body, ingreso) {
  if (ingreso.modalidad === "contado") return 0;
  if (ingreso.modalidad === "permuta") return Number(ingreso.parte_pago_valor ?? 0);
  return numero(body.precio, "El precio del vehículo", { min: 0.01, max: TOPE_MONTO });
}

async function construirData(body, ingreso, tx) {
  const precio = valorDelUsado(body, ingreso);
  const permuta = vendeLaAgencia(ingreso.modalidad) ? await datosPermuta(body, ingreso, tx) : SIN_PERMUTA;

  // Lo que se paga en el acto no puede superar lo que hay que pagar; lo que
  // falta es saldo, y un saldo sin fecha es una deuda que nadie sabe cuándo vence.
  const sena = vendeLaAgencia(ingreso.modalidad) ? senaDelIngreso(ingreso)?.monto ?? 0 : 0;
  const { monto } = montoAPagar(precio, permuta.entregado_valor, sena);
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
  return mapCompraventa(ingreso.compraventa_contratos, senaDelIngreso(ingreso));
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
    return mapCompraventa(guardado, senaDelIngreso(ingreso));
  });
}

export async function armarImpresosCompraventa(ingresoId) {
  const ingreso = await ingresoVigente(ingresoId);
  exigirBoletoAlDia(ingreso);
  return impresosDe(ingreso, ingreso.compraventa_contratos);
}

// Se relee con el auto entregado incluido: el mapper lo necesita para mostrarlo.
const releer = (contrato, ingreso) =>
  prisma.compraventa_contratos
    .findUnique({ where: { id: contrato.id }, include: INCLUDE_CONTRATO })
    .then((c) => mapCompraventa(c, senaDelIngreso(ingreso)));

export async function firmarCompraventa(ingresoId) {
  const ingreso = await ingresoVigente(ingresoId);
  exigirBoletoAlDia(ingreso);
  return releer(await firmar(prisma.compraventa_contratos, ingreso, ingreso.compraventa_contratos), ingreso);
}

export async function desfirmarCompraventa(ingresoId) {
  const ingreso = await ingresoVigente(ingresoId);
  return releer(await desfirmar(prisma.compraventa_contratos, ingreso.compraventa_contratos), ingreso);
}

// Venta al contado o con parte de pago: el auto de la agencia se marca vendido
// desde el legajo, al precio del boleto. Es la única puerta para hacerlo: así
// la venta queda atada al trámite que la respalda.
export async function venderAutoDelBoleto(ingresoId) {
  return prisma.$transaction(async (tx) => {
    const ingreso = await ingresoVigente(ingresoId, tx);
    const boleto = ingreso.compraventa_contratos;
    exigirBoletoAlDia(ingreso);
    if (!vendeLaAgencia(ingreso.modalidad) || !boleto?.auto_entregado_id || boleto.deleted_at) {
      throw error("Primero cargá el boleto con el vehículo que vende la agencia.", 409);
    }
    const auto = await autoConConsignacion({ id: boleto.auto_entregado_id }, tx);
    if (!auto) throw error("El vehículo del boleto ya no existe.", 404);
    if (auto.vendido_at) throw error("Ese vehículo ya figura como vendido.", 409);

    await cerrarVenta(tx, auto, { precio: Number(boleto.entregado_valor), fecha: new Date() });
    await tx.consignacion_ingresos.update({ where: { id: ingreso.id }, data: { estado: "vendido", estado_at: new Date() } });
    return true;
  });
}

// Se marcó por error: el auto vuelve a estar a la venta.
export async function deshacerVentaDelBoleto(ingresoId) {
  return prisma.$transaction(async (tx) => {
    const ingreso = await ingresoVigente(ingresoId, tx);
    const autoId = ingreso.compraventa_contratos?.auto_entregado_id;
    const auto = autoId ? await autoConConsignacion({ id: autoId }, tx) : null;
    if (!auto?.vendido_at) throw error("El vehículo de este boleto no figura como vendido.", 409);

    await abrirVenta(tx, auto);
    await tx.consignacion_ingresos.update({ where: { id: ingreso.id }, data: { estado: "recepcion", estado_at: new Date() } });
    return true;
  });
}
