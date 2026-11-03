import { prisma } from "../lib/prisma.js";
import { error, TOPE_MONTO, numero, opcion, booleano, textoLibre } from "../lib/contrato-campos.js";
import { mapContrato, mapIngreso } from "../mappers/ingreso.mapper.js";
import { exigirRequisitosContrato } from "../lib/requisitos-contrato.js";
import { firmar, desfirmar, impresosDe } from "./legajo-contrato.service.js";

// Las condiciones firmadas de una consignación. No hay formulario oficial: lo
// que sí es fijo es la lista de puntos que, si faltan, terminan en discusión.

const VIGENTE = { deleted_at: null };
const A_CARGO = ["agencia", "cliente"];
const COMISION_TIPOS = ["porcentaje", "monto"];
const LIQUIDACION_FORMAS = ["transferencia", "efectivo", "cheque"];

function construirData(body) {
  const comisionTipo = opcion(body.comisionTipo, "El tipo de comisión", COMISION_TIPOS, "porcentaje");
  const comisionValor = numero(body.comisionValor ?? 0, "La comisión", {
    max: comisionTipo === "porcentaje" ? 100 : TOPE_MONTO,
  });

  const pruebaManejo = booleano(body.pruebaManejo, false);
  // Si la agencia puede sacar el auto a probar, hay que decir quién responde
  // ante un choque. Es el punto que se discute cuando aparece un rayón.
  const pruebaResponsable = pruebaManejo
    ? opcion(body.pruebaResponsable, "El responsable de la prueba de manejo", A_CARGO, null)
    : null;
  if (pruebaManejo && !pruebaResponsable) throw error("Si se permiten pruebas de manejo hay que indicar quién responde.");

  const precioMinimo = numero(body.precioMinimo, "El precio mínimo", { max: TOPE_MONTO });
  const precioPublicacion = numero(body.precioPublicacion, "El precio de publicación", { max: TOPE_MONTO });

  // Publicar por debajo del piso no tiene sentido comercial: el caso real es que
  // se cargaron los dos campos al revés, y eso se descubre tarde y caro. Se
  // valida acá y no con un CHECK: es una regla del negocio, no de la tabla.
  if (precioPublicacion < precioMinimo) {
    throw error("El precio de publicación no puede ser menor al mínimo autorizado. ¿Están invertidos?");
  }

  return {
    precio_minimo: precioMinimo,
    precio_publicacion: precioPublicacion,
    comision_tipo: comisionTipo,
    comision_valor: comisionValor,
    comision_incluida: booleano(body.comisionIncluida, true),
    plazo_dias: numero(body.plazoDias ?? 90, "El plazo", { min: 1, max: 3650 }),
    gastos_verificacion: opcion(body.gastosVerificacion, "Los gastos de verificación", A_CARGO, "cliente"),
    gastos_libre_deuda: opcion(body.gastosLibreDeuda, "Los gastos de libre deuda", A_CARGO, "cliente"),
    gastos_lavado: opcion(body.gastosLavado, "Los gastos de lavado", A_CARGO, "agencia"),
    gastos_publicacion: opcion(body.gastosPublicacion, "Los gastos de publicación", A_CARGO, "agencia"),
    retiro_aviso_dias: numero(body.retiroAvisoDias ?? 0, "El aviso de retiro anticipado", { min: 0, max: 365 }),
    retiro_costo: numero(body.retiroCosto ?? 0, "El costo de retiro anticipado", { max: TOPE_MONTO }),
    // Lo que se pacta para el retiro anticipado más allá del aviso y el costo:
    // gastos ya hechos, penalidad, qué pasa si había una seña. Lo redacta la
    // agencia porque no hay dos contratos que lo resuelvan igual.
    retiro_condiciones: textoLibre(body.retiroCondiciones, "Lo pactado para el retiro anticipado"),
    estado_unidad: textoLibre(body.estadoUnidad, "El estado de la unidad"),
    prueba_manejo: pruebaManejo,
    prueba_responsable: pruebaResponsable,
    seguro_a_cargo: opcion(body.seguroACargo, "El seguro", A_CARGO, "cliente"),
    liquidacion_dias: numero(body.liquidacionDias ?? 0, "El plazo de liquidación", { min: 0, max: 365 }),
    liquidacion_forma: opcion(body.liquidacionForma, "La forma de liquidación", LIQUIDACION_FORMAS, "transferencia"),
  };
}

const CON_TODO = {
  titular: { include: { cliente_perfiles: true } },
  usuarios: { select: { id: true, nombre: true } },
  consignacion_contratos: true,
  consignacion_documentos: { where: VIGENTE, orderBy: { id: "asc" }, include: { usuarios: { select: { id: true, nombre: true } } } },
};

async function ingresoVigente(ingresoId) {
  const n = Number(ingresoId);
  if (!Number.isInteger(n) || n <= 0) throw error("Ingreso no encontrado.", 404);
  const ingreso = await prisma.consignacion_ingresos.findFirst({ where: { id: n, ...VIGENTE }, include: CON_TODO });
  if (!ingreso) throw error("Ingreso no encontrado.", 404);
  // La compra y la permuta firman un boleto, no estas condiciones: viven en
  // ingreso-compraventa.service.js.
  if (ingreso.modalidad !== "consignacion") throw error("Este ingreso no es una consignación.", 409);
  return ingreso;
}

export async function obtenerContrato(ingresoId) {
  const ingreso = await ingresoVigente(ingresoId);
  return mapContrato(ingreso.consignacion_contratos);
}

export async function guardarContrato(ingresoId, body = {}) {
  const ingreso = await ingresoVigente(ingresoId);
  if (ingreso.consignacion_contratos?.firmado_at) {
    throw error("El contrato ya está firmado. Desfirmalo para poder editarlo.", 409);
  }

  const data = construirData(body);
  // El CBU se exige según la forma de liquidación que se está guardando ahora.
  const detalle = mapIngreso(ingreso, { conDetalle: true });
  exigirRequisitosContrato({ ...detalle, contrato: { liquidacion: { forma: data.liquidacion_forma } } });

  const guardado = await prisma.consignacion_contratos.upsert({
    where: { ingreso_id: ingreso.id },
    create: { ingreso_id: ingreso.id, ...data },
    update: { ...data, deleted_at: null },
  });
  return mapContrato(guardado);
}

export async function armarImpresos(ingresoId) {
  const ingreso = await ingresoVigente(ingresoId);
  // Firmado, se reimprime la copia congelada tal cual: no se le exige nada.
  if (!ingreso.consignacion_contratos?.firmado_at) exigirRequisitosContrato(mapIngreso(ingreso, { conDetalle: true }));
  return impresosDe(ingreso, ingreso.consignacion_contratos);
}

export async function firmarContrato(ingresoId) {
  const ingreso = await ingresoVigente(ingresoId);
  exigirRequisitosContrato(mapIngreso(ingreso, { conDetalle: true }));
  return mapContrato(await firmar(prisma.consignacion_contratos, ingreso, ingreso.consignacion_contratos));
}

export async function desfirmarContrato(ingresoId) {
  const ingreso = await ingresoVigente(ingresoId);
  if (ingreso.estado === "vendido") throw error("El auto figura vendido: deshacé la venta antes de desfirmar.", 409);
  return mapContrato(await desfirmar(prisma.consignacion_contratos, ingreso.consignacion_contratos));
}
