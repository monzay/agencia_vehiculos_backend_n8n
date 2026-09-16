import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { CATALOGO } from "../lib/documentos-catalogo.js";
import { mapContrato, mapIngreso } from "../mappers/ingreso.mapper.js";

// Las condiciones firmadas de una consignación, y la copia congelada que se
// imprime. No hay formulario oficial: lo que sí es fijo es la lista de puntos
// que, si faltan, terminan en discusión.

const VIGENTE = { deleted_at: null };
const A_CARGO = ["agencia", "cliente"];
const COMISION_TIPOS = ["porcentaje", "monto"];
const LIQUIDACION_FORMAS = ["transferencia", "efectivo", "cheque"];

function error(mensaje, status = 400) {
  const e = new Error(mensaje);
  e.status = status;
  return e;
}

function numero(valor, campo, { min = 0, max = null } = {}) {
  const n = Number(valor);
  if (valor === "" || valor === null || valor === undefined || !Number.isFinite(n)) {
    throw error(`${campo} debe ser un número.`);
  }
  if (n < min) throw error(`${campo} no puede ser menor a ${min}.`);
  if (max != null && n > max) throw error(`${campo} no puede ser mayor a ${max}.`);
  return n;
}

function opcion(valor, campo, validas, porDefecto) {
  if (valor === undefined) return porDefecto;
  if (!validas.includes(valor)) throw error(`${campo} debe ser uno de: ${validas.join(", ")}.`);
  return valor;
}

const booleano = (valor, porDefecto) => (valor === undefined ? porDefecto : valor === true || valor === "true");

function construirData(body) {
  const comisionTipo = opcion(body.comisionTipo, "El tipo de comisión", COMISION_TIPOS, "porcentaje");
  const comisionValor = numero(body.comisionValor ?? 0, "La comisión", {
    max: comisionTipo === "porcentaje" ? 100 : null,
  });

  const pruebaManejo = booleano(body.pruebaManejo, false);
  // Si la agencia puede sacar el auto a probar, hay que decir quién responde
  // ante un choque. Es el punto que se discute cuando aparece un rayón.
  const pruebaResponsable = pruebaManejo
    ? opcion(body.pruebaResponsable, "El responsable de la prueba de manejo", A_CARGO, null)
    : null;
  if (pruebaManejo && !pruebaResponsable) throw error("Si se permiten pruebas de manejo hay que indicar quién responde.");

  return {
    precio_minimo: numero(body.precioMinimo, "El precio mínimo"),
    comision_tipo: comisionTipo,
    comision_valor: comisionValor,
    comision_incluida: booleano(body.comisionIncluida, true),
    plazo_dias: numero(body.plazoDias ?? 90, "El plazo", { min: 1, max: 3650 }),
    gastos_verificacion: opcion(body.gastosVerificacion, "Los gastos de verificación", A_CARGO, "cliente"),
    gastos_libre_deuda: opcion(body.gastosLibreDeuda, "Los gastos de libre deuda", A_CARGO, "cliente"),
    gastos_lavado: opcion(body.gastosLavado, "Los gastos de lavado", A_CARGO, "agencia"),
    gastos_publicacion: opcion(body.gastosPublicacion, "Los gastos de publicación", A_CARGO, "agencia"),
    retiro_aviso_dias: numero(body.retiroAvisoDias ?? 0, "El aviso de retiro anticipado", { min: 0, max: 365 }),
    retiro_costo: numero(body.retiroCosto ?? 0, "El costo de retiro anticipado"),
    estado_unidad: typeof body.estadoUnidad === "string" ? body.estadoUnidad.trim() || null : null,
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
  return ingreso;
}

// El vehículo del ingreso sale del título. Sin título, el contrato y los
// recibos no tienen qué auto nombrar.
function exigirVehiculo(ingreso) {
  if (!ingreso.dominio) throw error("Cargá el título del automotor: el contrato necesita los datos del vehículo.", 409);
}

export async function obtenerContrato(ingresoId) {
  const ingreso = await ingresoVigente(ingresoId);
  return mapContrato(ingreso.consignacion_contratos);
}

// Mientras no esté firmado, el contrato se edita todo lo que haga falta.
// Firmado, se congela: si cambian las condiciones, se desfirma y se vuelve a
// imprimir, y así el papel del cliente y el sistema nunca dicen cosas distintas.
export async function guardarContrato(ingresoId, body = {}) {
  const ingreso = await ingresoVigente(ingresoId);
  if (ingreso.consignacion_contratos?.firmado_at) {
    throw error("El contrato ya está firmado. Desfirmalo para poder editarlo.", 409);
  }

  const data = construirData(body);
  const guardado = await prisma.consignacion_contratos.upsert({
    where: { ingreso_id: ingreso.id },
    create: { ingreso_id: ingreso.id, ...data },
    update: { ...data, deleted_at: null },
  });
  return mapContrato(guardado);
}

// Lo que se imprime. Antes de firmar se arma en vivo; después sale del snapshot,
// que es la copia exacta de lo que el cliente tiene en la mano.
export async function armarImpresos(ingresoId) {
  const ingreso = await ingresoVigente(ingresoId);
  if (!ingreso.consignacion_contratos) throw error("Todavía no hay condiciones cargadas para este ingreso.", 409);
  exigirVehiculo(ingreso);

  if (ingreso.consignacion_contratos.firmado_at) return ingreso.consignacion_contratos.contrato_json;
  return snapshot(ingreso, await agencia());
}

export async function firmarContrato(ingresoId) {
  const ingreso = await ingresoVigente(ingresoId);
  const contrato = ingreso.consignacion_contratos;
  if (!contrato) throw error("Cargá las condiciones antes de firmar.", 409);
  if (contrato.firmado_at) throw error("El contrato ya está firmado.", 409);
  exigirVehiculo(ingreso);

  const firmadoAt = new Date();
  const congelado = { ...snapshot(ingreso, await agencia()), firmado: firmadoAt.toISOString() };

  const guardado = await prisma.consignacion_contratos.update({
    where: { id: contrato.id },
    data: { firmado_at: firmadoAt, contrato_json: congelado },
  });
  return mapContrato(guardado);
}

// Desfirmar borra el congelado: un contrato sin firma no tiene copia que
// preservar, y la base exige que firma y snapshot vayan juntos.
//
// `Prisma.DbNull` y no `null`: en una columna JSON, `null` guarda el VALOR json
// `null`, que para SQL no es NULL y hace saltar el CHECK.
export async function desfirmarContrato(ingresoId) {
  const ingreso = await ingresoVigente(ingresoId);
  const contrato = ingreso.consignacion_contratos;
  if (!contrato?.firmado_at) throw error("Ese contrato no está firmado.", 409);

  const guardado = await prisma.consignacion_contratos.update({
    where: { id: contrato.id },
    data: { firmado_at: null, contrato_json: Prisma.DbNull },
  });
  return mapContrato(guardado);
}

const agencia = () => prisma.ubicacion.findFirst({ select: { nombre: true, direccion: true } });

// La copia congelada: todo lo que hace falta para reimprimir el contrato y los
// dos recibos sin volver a consultar ninguna tabla.
function snapshot(ingreso, datosAgencia) {
  const detalle = mapIngreso(ingreso, { conDetalle: true });

  return {
    version: 1,
    generado: new Date().toISOString(),
    agencia: datosAgencia ? { nombre: datosAgencia.nombre, direccion: datosAgencia.direccion } : null,
    titular: detalle.titular,
    vehiculo: detalle.vehiculo,
    condiciones: detalle.contrato,
    // El recibo de documentación entregada: SOLO los papeles que la agencia
    // recibió de verdad. Un documento escaneado cuyo original nunca llegó no va
    // en un recibo — el recibo es la prueba de que el cliente entregó algo, y
    // firmarlo por algo que no está es el problema que esto evita.
    papelesEntregados: detalle.documentos
      .filter((d) => d.tenencia !== "no_recibido")
      .map((d) => ({
        tipo: d.tipo,
        label: CATALOGO[d.tipo]?.label ?? d.tipo,
        tenencia: d.tenencia, // copia | original
        ubicacionFisica: d.ubicacionFisica,
        fechaVencimiento: d.fechaVencimiento,
        imagenes: d.imagenes.length,
      })),
    // Lo que está escaneado pero cuyo papel no está en la agencia. No entra en
    // el recibo; se imprime aparte como lo que todavía falta traer.
    papelesPendientes: detalle.documentos
      .filter((d) => d.tenencia === "no_recibido")
      .map((d) => ({ tipo: d.tipo, label: CATALOGO[d.tipo]?.label ?? d.tipo })),
    recepcion: {
      kmRecepcion: detalle.vehiculo.kmRecepcion,
      estadoUnidad: detalle.contrato?.estadoUnidad ?? null,
      recibidoPor: detalle.recibidoPor,
      recibido: detalle.recibido,
    },
  };
}
