import { prisma } from "../lib/prisma.js";
import { telefonoNacional } from "../lib/provincias.js";
import { telefonosParaBuscar } from "../lib/busqueda-telefono.js";
import { validarDni } from "../lib/dni.js";
import { mapFinanciacion } from "../mappers/financiacion.mapper.js";
import { mapCompraventa, senaDelIngreso } from "../mappers/compraventa.mapper.js";
import { fechaAR, proximoAviso, conAvisosPrimero, esDuplicado } from "./avisos-cuotas.service.js";
import { VIGENTE_CLIENTE, resolverCliente } from "./clientes.service.js";

// ── Helpers de validación / normalización ──

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Self-delete: solo son "vigentes" las filas con deleted_at NULL.
const VIGENTE = { deleted_at: null };

// En el buscador, con menos dígitos lo escrito es un pedazo de otra cosa (el 500
// de "Fiat 500"): el DNI se busca por sus dígitos solo si hay al menos estos.
const DIGITOS_DNI_MINIMOS = 6;

// Largo de la columna `financiaciones.telefono_alt`.
const MAX_DIGITOS_TELEFONO = 30;

function limpiar(valor) {
  return typeof valor === "string" ? valor.trim() : valor;
}

function error(mensaje, status = 400) {
  const e = new Error(mensaje);
  e.status = status;
  return e;
}

// Deja solo los dígitos (teléfono, DNI) sin importar el formato: espacios,
// guiones, puntos, +54, etc.
function soloDigitos(valor) {
  return String(valor ?? "").replace(/\D+/g, "");
}

// Como se guarda un teléfono en la ficha: los 10 dígitos nacionales y, si no se
// puede (extranjero, incompleto), sus dígitos.
const comoSeGuarda = (digitos) => telefonoNacional(digitos) ?? digitos;

// La persona ya tenía ficha con otro teléfono: el que tipeó el admin se guarda en el
// plan (los recordatorios de cuota salen a `telefono_alt || telefono`) y la ficha no
// se toca. Null si es el mismo (también cuando la ficha no tenía y resolverCliente se
// lo completó) o si no entra en la columna.
function telefonoSiEsOtro(tipeado, delaFicha) {
  const nuevo = comoSeGuarda(tipeado);
  const hayOtro = nuevo !== comoSeGuarda(soloDigitos(delaFicha));
  return hayOtro && nuevo.length <= MAX_DIGITOS_TELEFONO ? nuevo : null;
}

// El nombre que llega en el body: un texto no vacío (un objeto o un número no es un nombre).
function validarNombre(valor, mensajeVacio) {
  if (valor != null && typeof valor !== "string") throw error("El nombre debe ser un texto");
  const nombre = limpiar(valor);
  if (!nombre) throw error(mensajeVacio);
  return nombre;
}

function validarEmail(valor, obligatorio = false) {
  if (valor != null && typeof valor !== "string") throw error("El email no es válido");
  const email = limpiar(valor) || null;
  if (!email) {
    if (obligatorio) throw error("El email es obligatorio");
    return null;
  }
  if (!EMAIL_RE.test(email)) throw error("El email no es válido");
  return email;
}

function parsearEntero(valor, campo, { min, max } = {}) {
  const n = Number(valor);
  if (!Number.isInteger(n)) throw error(`${campo} debe ser un número entero`);
  if (min != null && n < min) throw error(`${campo} debe ser mayor o igual a ${min}`);
  if (max != null && n > max) throw error(`${campo} debe ser menor o igual a ${max}`);
  return n;
}

function parsearMonto(valor, campo) {
  const n = Number(valor);
  if (!Number.isFinite(n) || n <= 0) throw error(`${campo} debe ser un monto mayor a 0`);
  return Number(n.toFixed(2));
}

// ── Operaciones ──

// `include` estándar: cliente + pagos vigentes (para armar el cronograma en el mapper).
const CON_RELACIONES = { clientes: true, pagos: { where: VIGENTE, orderBy: { numero: "asc" } } };
// Para el admin: además, lo que respondió el cliente a los recordatorios y todavía no se atendió.
const CON_RESPUESTAS = {
  ...CON_RELACIONES,
  alertas: { where: { atendida_at: null }, orderBy: { id: "asc" }, include: { aviso: { select: { numero: true } } } },
};

// La cuota que está en la ventana de avisos (vence en 3 días o menos), si la hay.
const conAvisoEnCurso = (f, hoy) => ({ ...f, proximoAviso: f.activo && !f.completada ? proximoAviso(f, hoy) : null });

// Lista las financiaciones vigentes, con los datos del cliente. Primero las que
// tienen un aviso en curso; después, activas primero y las más nuevas arriba.
export async function listarFinanciaciones(ahora = new Date(), db = prisma) {
  const filas = await db.financiaciones.findMany({
    where: VIGENTE,
    include: CON_RESPUESTAS,
    orderBy: [{ activo: "desc" }, { created_at: "desc" }],
  });
  const hoy = fechaAR(ahora);
  return conAvisosPrimero(filas.map(mapFinanciacion).map((f) => conAvisoEnCurso(f, hoy)));
}

// Versión PAGINADA con búsqueda en el server. Devuelve { items, hayMas, total }.
// El teléfono y el DNI se encuentran escritos como se escriban (+54 9 388 470-8347,
// 30.125.678): se guardan solo con dígitos. Un `q` que no es texto no filtra.
export async function listarFinanciacionesPaginado({ q, offset = 0, limite = 10 } = {}, db = prisma) {
  const off = Math.max(0, Number(offset) || 0);
  const lim = Math.max(1, Number(limite) || 10);

  let arr = await listarFinanciaciones(new Date(), db);
  const texto = typeof q === "string" ? q.trim() : "";
  if (texto) {
    const ql = texto.toLowerCase();
    const telefonos = telefonosParaBuscar(texto);
    const digitos = soloDigitos(texto);
    arr = arr.filter(
      (f) =>
        (f.nombre || "").toLowerCase().includes(ql) ||
        telefonos.some((t) => (f.telefono || "").includes(t)) ||
        (f.dni || "").toLowerCase().includes(ql) ||
        (digitos.length >= DIGITOS_DNI_MINIMOS && (f.dni || "").includes(digitos)) ||
        (f.email || "").toLowerCase().includes(ql)
    );
  }
  const total = arr.length;
  return { items: arr.slice(off, off + lim), hayMas: off + lim < total, total };
}

export async function obtenerFinanciacion(id, db = prisma) {
  const f = await db.financiaciones.findFirst({
    where: { id: Number(id), ...VIGENTE },
    include: CON_RESPUESTAS,
  });
  return f ? conAvisoEnCurso(mapFinanciacion(f), fechaAR(new Date())) : null;
}

// Vista pública para la consulta por DNI: devuelve SOLO el plan de cuotas, sin
// ningún dato de identidad ni de contacto. Así, aunque alguien enumere DNIs, no
// obtiene PII (nombre/teléfonos/email/dni) de las personas, únicamente números.
export function aPublico(f) {
  const { telefono, telefonoAlt, email, clienteId, ingresoId, nombre, dni, respuestas, avisosBaja, proximoAviso, ...resto } = f;
  return resto;
}

// Consulta PÚBLICA por DNI: devuelve las financiaciones vigentes de la persona,
// sin exponer teléfono/email. Pensada para que el cliente vea su plan de cuotas.
// Solo texto: un objeto (`?dni[not]=x`) llegaría al `where` como operador de Prisma.
// El DNI se guarda solo con dígitos, así que se busca igual aunque se escriba con puntos.
export async function consultarPorDni(dniRaw, db = prisma) {
  const dni = typeof dniRaw === "string" ? soloDigitos(dniRaw) : "";
  if (!dni) throw error("Ingresá tu número de DNI");

  const personas = await db.clientes.findMany({
    where: { dni, ...VIGENTE_CLIENTE },
    select: { id: true },
  });
  const ids = personas.map((p) => p.id);
  if (ids.length === 0) return [];

  const filas = await db.financiaciones.findMany({
    where: { cliente_id: { in: ids }, ...VIGENTE },
    include: CON_RELACIONES,
    orderBy: [{ activo: "desc" }, { created_at: "desc" }],
  });
  return filas.map(mapFinanciacion).map(aPublico);
}

// Crea una financiación. La persona se reconoce por DNI o teléfono con la puerta
// única de alta de clientes y solo se crea su ficha si no existe. Ficha y plan van
// en una sola transacción: si el plan falla, no queda una ficha suelta. Si la ficha
// ya tenía otro teléfono, el que cargó el admin queda como `telefono_alt` del plan.
export async function crearFinanciacion(body = {}, db = prisma) {
  const nombre = validarNombre(body.nombre, "El nombre es obligatorio");

  const telefono = soloDigitos(body.telefono);
  if (!telefono) throw error("El teléfono es obligatorio");

  const dni = validarDni(body.dni);

  const email = validarEmail(body.email, true);
  const cantidadCuotas = parsearEntero(body.cantidadCuotas, "La cantidad de cuotas", { min: 1, max: 600 });
  const precioCuota = parsearMonto(body.precioCuota, "El precio de la cuota");
  const diaPago = parsearEntero(body.diaPago, "El día de pago", { min: 1, max: 31 });
  const telefonoAlt = soloDigitos(body.telefonoAlt) || null; // opcional

  return db.$transaction(async (tx) => {
    const { cliente, creado } = await resolverCliente({ canal: "web", telefono, dni, nombre, email }, tx);

    const f = await tx.financiaciones.create({
      data: {
        cliente_id: cliente.id,
        cantidad_cuotas: cantidadCuotas,
        precio_cuota: precioCuota,
        dia_pago: diaPago,
        telefono_alt: telefonoAlt ?? telefonoSiEsOtro(telefono, cliente.telefono),
      },
      include: CON_RELACIONES,
    });

    return { ...mapFinanciacion(f), clienteVinculado: !creado };
  });
}

// Financia el saldo de una parte de pago. El cliente es el titular del trámite
// (no se vuelve a cargar) y el saldo sale del boleto: sin boleto o sin saldo
// que pague el cliente, no hay nada que financiar. Una sola financiación
// vigente por trámite; se controla dentro de la transacción.
export async function crearFinanciacionDeIngreso(ingresoId, body = {}) {
  const id = parsearEntero(ingresoId, "El ingreso", { min: 1 });
  const cantidadCuotas = parsearEntero(body.cantidadCuotas, "La cantidad de cuotas", { min: 1, max: 600 });
  const precioCuota = parsearMonto(body.precioCuota, "El precio de la cuota");
  const diaPago = parsearEntero(body.diaPago, "El día de pago", { min: 1, max: 31 });

  return prisma.$transaction(async (tx) => {
    const ingreso = await tx.consignacion_ingresos.findFirst({
      where: { id, ...VIGENTE },
      select: { cliente_id: true, modalidad: true, compraventa_contratos: true, sena: true },
    });
    if (!ingreso) throw error("Ingreso no encontrado.", 404);
    if (ingreso.modalidad !== "permuta") throw error("Solo se financia el saldo de una parte de pago.", 409);

    const boleto = ingreso.compraventa_contratos?.deleted_at ? null : mapCompraventa(ingreso.compraventa_contratos, senaDelIngreso(ingreso));
    if (!boleto) throw error("Primero cargá las condiciones del boleto.", 409);
    if (boleto.pago.pagador !== "cliente" || !(boleto.pago.saldo > 0)) {
      throw error("El boleto no tiene saldo a pagar por el cliente.", 409);
    }

    const existente = await tx.financiaciones.findFirst({ where: { ingreso_id: id, ...VIGENTE }, select: { id: true } });
    if (existente) throw error("Este trámite ya tiene una financiación.", 409);

    const f = await tx.financiaciones.create({
      data: {
        cliente_id: ingreso.cliente_id,
        ingreso_id: id,
        cantidad_cuotas: cantidadCuotas,
        precio_cuota: precioCuota,
        dia_pago: diaPago,
      },
      include: CON_RELACIONES,
    });
    return mapFinanciacion(f);
  });
}

// Valida el body y arma lo que se escribe: los datos de identidad (ficha del
// cliente) y el plan (`financiaciones`). Lanza 400 antes de que haya escrituras.
function armarCambios(body, existe) {
  const dataCliente = {};
  if (body.nombre !== undefined) dataCliente.nombre = validarNombre(body.nombre, "El nombre no puede quedar vacío");
  if (body.telefono !== undefined) {
    const tel = soloDigitos(body.telefono);
    if (!tel) throw error("El teléfono no puede quedar vacío");
    dataCliente.telefono = comoSeGuarda(tel);
  }
  if (body.dni !== undefined) dataCliente.dni = validarDni(body.dni);
  if (body.email !== undefined) dataCliente.email = validarEmail(body.email, true);

  const dataPlan = { updated_at: new Date() };
  if (body.cantidadCuotas !== undefined) {
    dataPlan.cantidad_cuotas = parsearEntero(body.cantidadCuotas, "La cantidad de cuotas", { min: 1, max: 600 });
  }
  if (body.precioCuota !== undefined) dataPlan.precio_cuota = parsearMonto(body.precioCuota, "El precio de la cuota");
  if (body.diaPago !== undefined) dataPlan.dia_pago = parsearEntero(body.diaPago, "El día de pago", { min: 1, max: 31 });
  if (body.telefonoAlt !== undefined) dataPlan.telefono_alt = soloDigitos(body.telefonoAlt) || null;
  if (body.activo !== undefined) dataPlan.activo = Boolean(body.activo);
  if (body.avisosWhatsapp !== undefined) {
    if (typeof body.avisosWhatsapp !== "boolean") throw error("avisosWhatsapp debe ser verdadero o falso");
    // Apagados: se conserva la fecha de la baja original (por ejemplo, la del BAJA del cliente).
    dataPlan.avisos_baja_at = body.avisosWhatsapp ? null : existe.avisos_baja_at ?? new Date();
  }
  return { dataCliente, dataPlan };
}

// Lo único que puede chocar al editar la ficha es el índice único de DNI entre
// fichas vigentes (074): se frena con un mensaje claro y la transacción se revierte.
async function actualizarCliente(tx, id, data) {
  try {
    await tx.clientes.update({ where: { id }, data });
  } catch (err) {
    if (esDuplicado(err)) throw error("Ese DNI ya es de otro cliente", 409);
    throw err;
  }
}

// Actualiza una financiación (edición parcial). Los datos de identidad se
// actualizan sobre la ficha del cliente; el plan sobre `financiaciones`. Todo va
// en una sola transacción: si algo falla, no queda nada a medias.
export async function actualizarFinanciacion(id, body = {}, db = prisma) {
  return db.$transaction(async (tx) => {
    const existe = await tx.financiaciones.findFirst({
      where: { id: Number(id), ...VIGENTE },
    });
    if (!existe) return null;

    const { dataCliente, dataPlan } = armarCambios(body, existe);

    if (Object.keys(dataCliente).length) {
      await actualizarCliente(tx, existe.cliente_id, dataCliente);
    }
    // Si se redujo la cantidad de cuotas, se ANULAN (deleted_at) los pagos de las
    // cuotas que ya no existen; no se borran. Los ya anulados no se vuelven a tocar.
    if (dataPlan.cantidad_cuotas != null && dataPlan.cantidad_cuotas < existe.cantidad_cuotas) {
      await tx.financiacion_pagos.updateMany({
        where: { financiacion_id: Number(id), numero: { gt: dataPlan.cantidad_cuotas }, ...VIGENTE },
        data: { deleted_at: dataPlan.updated_at },
      });
    }
    const f = await tx.financiaciones.update({
      where: { id: Number(id) },
      data: dataPlan,
      include: CON_RELACIONES,
    });
    return mapFinanciacion(f);
  });
}

// Registra el pago de la cuota salvo que ya haya uno vigente (así se conserva su
// fecha). Si otra marca simultánea ganó por el índice único (una sola fila
// vigente por cuota), la cuota ya quedó paga: no es error.
async function registrarPago(cuota, db) {
  const vigente = await db.financiacion_pagos.findFirst({ where: { ...cuota, ...VIGENTE }, select: { id: true } });
  if (vigente) return;
  try {
    await db.financiacion_pagos.create({ data: cuota });
  } catch (err) {
    if (!esDuplicado(err)) throw err;
  }
}

// Marca (pagado=true) o desmarca (pagado=false) una cuota por su número.
// Una fila vigente (deleted_at NULL) en `financiacion_pagos` ⇒ esa cuota está paga.
// Desmarcar la anula en vez de borrarla: la fila queda de historial con su fecha de pago.
// Devuelve la financiación actualizada; null si no existe. Un número fuera del plan da error 400.
export async function marcarCuota(id, numero, pagado, db = prisma) {
  const existe = await db.financiaciones.findFirst({
    where: { id: Number(id), ...VIGENTE },
  });
  if (!existe) return null;

  const n = parsearEntero(numero, "El número de cuota", { min: 1, max: existe.cantidad_cuotas });
  const cuota = { financiacion_id: Number(id), numero: n };

  if (pagado) {
    await registrarPago(cuota, db);
  } else {
    await db.financiacion_pagos.updateMany({ where: { ...cuota, ...VIGENTE }, data: { deleted_at: new Date() } });
  }

  return obtenerFinanciacion(id, db);
}

// Self-delete: marca `deleted_at`. La fila queda para auditoría/recuperación.
// No elimina la ficha del cliente (puede tener más financiaciones o historial).
export async function eliminarFinanciacion(id) {
  const existe = await prisma.financiaciones.findFirst({
    where: { id: Number(id), ...VIGENTE },
  });
  if (!existe) return false;

  await prisma.financiaciones.update({
    where: { id: Number(id) },
    data: { deleted_at: new Date(), activo: false, updated_at: new Date() },
  });
  return true;
}
