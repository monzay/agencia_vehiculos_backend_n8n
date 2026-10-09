import { prisma } from "../lib/prisma.js";
import { mapFinanciacion } from "../mappers/financiacion.mapper.js";
import { mapCompraventa, senaDelIngreso } from "../mappers/compraventa.mapper.js";

// ── Helpers de validación / normalización ──

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Self-delete: solo son "vigentes" las filas con deleted_at NULL.
const VIGENTE = { deleted_at: null };

function limpiar(valor) {
  return typeof valor === "string" ? valor.trim() : valor;
}

function error(mensaje, status = 400) {
  const e = new Error(mensaje);
  e.status = status;
  return e;
}

// Deja solo los dígitos del teléfono para comparar sin importar el formato
// (espacios, guiones, +54, etc.).
function soloDigitos(valor) {
  return (valor || "").replace(/\D+/g, "");
}

function validarEmail(valor, obligatorio = false) {
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

// Busca un cliente existente cuyo teléfono coincida (por sus dígitos). Sirve
// para vincular la financiación con el mismo cliente que ya trajo el bot por
// WhatsApp/web sin importar el formato guardado.
async function buscarClientePorTelefono(digitos) {
  const suf = digitos.slice(-8);
  if (!suf) return null;
  const candidatos = await prisma.clientes.findMany({
    where: { telefono: { contains: suf } },
    orderBy: { id: "asc" },
  });
  return candidatos.find((c) => soloDigitos(c.telefono).endsWith(suf)) ?? null;
}

// Resuelve el cliente a asociar: reutiliza el existente (completando datos que
// falten) o crea uno nuevo con canal="web". Devuelve { cliente, vinculado }.
async function resolverCliente({ nombre, telefonoDigitos, dni, email }) {
  const existente = await buscarClientePorTelefono(telefonoDigitos);
  if (existente) {
    // Completa solo los campos que estén vacíos en la ficha del cliente para no
    // pisar datos que ya venían del bot.
    const parche = {};
    if (!existente.nombre && nombre) parche.nombre = nombre;
    if (!existente.dni && dni) parche.dni = dni;
    if (!existente.email && email) parche.email = email;
    const cliente = Object.keys(parche).length
      ? await prisma.clientes.update({ where: { id: existente.id }, data: parche })
      : existente;
    return { cliente, vinculado: true };
  }

  const cliente = await prisma.clientes.create({
    data: {
      nombre,
      telefono: telefonoDigitos,
      dni,
      email,
      canal: "web",
      canal_id: telefonoDigitos, // uq_canal(web, telefono): evita duplicar la ficha
    },
  });
  return { cliente, vinculado: false };
}

// ── Operaciones ──

// `include` estándar: cliente + pagos (para armar el cronograma en el mapper).
const CON_RELACIONES = { clientes: true, pagos: { orderBy: { numero: "asc" } } };

// Lista las financiaciones vigentes (activas primero), con los datos del cliente.
export async function listarFinanciaciones() {
  const filas = await prisma.financiaciones.findMany({
    where: VIGENTE,
    include: CON_RELACIONES,
    orderBy: [{ activo: "desc" }, { created_at: "desc" }],
  });
  return filas.map(mapFinanciacion);
}

// Versión PAGINADA con búsqueda en el server. Devuelve { items, hayMas, total }.
export async function listarFinanciacionesPaginado({ q, offset = 0, limite = 10 } = {}) {
  const off = Math.max(0, Number(offset) || 0);
  const lim = Math.max(1, Number(limite) || 10);

  let arr = await listarFinanciaciones();
  const ql = (q || "").trim().toLowerCase();
  if (ql) {
    arr = arr.filter(
      (f) =>
        (f.nombre || "").toLowerCase().includes(ql) ||
        (f.telefono || "").toLowerCase().includes(ql) ||
        (f.dni || "").toLowerCase().includes(ql) ||
        (f.email || "").toLowerCase().includes(ql)
    );
  }
  const total = arr.length;
  return { items: arr.slice(off, off + lim), hayMas: off + lim < total, total };
}

export async function obtenerFinanciacion(id) {
  const f = await prisma.financiaciones.findFirst({
    where: { id: Number(id), ...VIGENTE },
    include: CON_RELACIONES,
  });
  return f ? mapFinanciacion(f) : null;
}

// Vista pública para la consulta por DNI: devuelve SOLO el plan de cuotas, sin
// ningún dato de identidad ni de contacto. Así, aunque alguien enumere DNIs, no
// obtiene PII (nombre/teléfonos/email/dni) de las personas, únicamente números.
export function aPublico(f) {
  const { telefono, telefonoAlt, email, clienteId, ingresoId, nombre, dni, ...resto } = f;
  return resto;
}

// Consulta PÚBLICA por DNI: devuelve las financiaciones vigentes de la persona,
// sin exponer teléfono/email. Pensada para que el cliente vea su plan de cuotas.
export async function consultarPorDni(dniRaw) {
  const dni = limpiar(dniRaw);
  if (!dni) throw error("Ingresá tu número de DNI");

  const personas = await prisma.clientes.findMany({
    where: { dni },
    select: { id: true },
  });
  const ids = personas.map((p) => p.id);
  if (ids.length === 0) return [];

  const filas = await prisma.financiaciones.findMany({
    where: { cliente_id: { in: ids }, ...VIGENTE },
    include: CON_RELACIONES,
    orderBy: [{ activo: "desc" }, { created_at: "desc" }],
  });
  return filas.map(mapFinanciacion).map(aPublico);
}

// Crea una financiación. Si el teléfono ya existe, la vincula al cliente actual.
export async function crearFinanciacion(body = {}) {
  const nombre = limpiar(body.nombre);
  if (!nombre) throw error("El nombre es obligatorio");

  const telefonoDigitos = soloDigitos(body.telefono);
  if (!telefonoDigitos) throw error("El teléfono es obligatorio");

  const dni = limpiar(body.dni);
  if (!dni) throw error("El DNI es obligatorio");

  const email = validarEmail(body.email, true);
  const cantidadCuotas = parsearEntero(body.cantidadCuotas, "La cantidad de cuotas", { min: 1, max: 600 });
  const precioCuota = parsearMonto(body.precioCuota, "El precio de la cuota");
  const diaPago = parsearEntero(body.diaPago, "El día de pago", { min: 1, max: 31 });
  const telefonoAlt = soloDigitos(body.telefonoAlt) || null; // opcional

  const { cliente, vinculado } = await resolverCliente({ nombre, telefonoDigitos, dni, email });

  const f = await prisma.financiaciones.create({
    data: {
      cliente_id: cliente.id,
      cantidad_cuotas: cantidadCuotas,
      precio_cuota: precioCuota,
      dia_pago: diaPago,
      telefono_alt: telefonoAlt,
    },
    include: CON_RELACIONES,
  });

  return { ...mapFinanciacion(f), clienteVinculado: vinculado };
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

// Actualiza una financiación (edición parcial). Los datos de identidad se
// actualizan sobre la ficha del cliente; el plan sobre `financiaciones`.
export async function actualizarFinanciacion(id, body = {}) {
  const existe = await prisma.financiaciones.findFirst({
    where: { id: Number(id), ...VIGENTE },
  });
  if (!existe) return null;

  const dataCliente = {};
  if (body.nombre !== undefined) {
    const n = limpiar(body.nombre);
    if (!n) throw error("El nombre no puede quedar vacío");
    dataCliente.nombre = n;
  }
  if (body.telefono !== undefined) {
    const tel = soloDigitos(body.telefono);
    if (!tel) throw error("El teléfono no puede quedar vacío");
    dataCliente.telefono = tel;
  }
  if (body.dni !== undefined) {
    const dni = limpiar(body.dni);
    if (!dni) throw error("El DNI no puede quedar vacío");
    dataCliente.dni = dni;
  }
  if (body.email !== undefined) dataCliente.email = validarEmail(body.email, true);

  const dataPlan = { updated_at: new Date() };
  if (body.cantidadCuotas !== undefined) {
    dataPlan.cantidad_cuotas = parsearEntero(body.cantidadCuotas, "La cantidad de cuotas", { min: 1, max: 600 });
  }
  if (body.precioCuota !== undefined) dataPlan.precio_cuota = parsearMonto(body.precioCuota, "El precio de la cuota");
  if (body.diaPago !== undefined) dataPlan.dia_pago = parsearEntero(body.diaPago, "El día de pago", { min: 1, max: 31 });
  if (body.telefonoAlt !== undefined) dataPlan.telefono_alt = soloDigitos(body.telefonoAlt) || null;
  if (body.activo !== undefined) dataPlan.activo = Boolean(body.activo);

  if (Object.keys(dataCliente).length) {
    await prisma.clientes.update({ where: { id: existe.cliente_id }, data: dataCliente });
  }
  // Si se redujo la cantidad de cuotas, se descartan los pagos de cuotas que
  // ya no existen para que el cronograma quede consistente.
  if (dataPlan.cantidad_cuotas != null && dataPlan.cantidad_cuotas < existe.cantidad_cuotas) {
    await prisma.financiacion_pagos.deleteMany({
      where: { financiacion_id: Number(id), numero: { gt: dataPlan.cantidad_cuotas } },
    });
  }
  const f = await prisma.financiaciones.update({
    where: { id: Number(id) },
    data: dataPlan,
    include: CON_RELACIONES,
  });
  return mapFinanciacion(f);
}

// Marca (pagado=true) o desmarca (pagado=false) una cuota por su número.
// Presencia de la fila en `financiacion_pagos` ⇒ esa cuota está paga.
// Devuelve la financiación actualizada, o null si no existe / número inválido.
export async function marcarCuota(id, numero, pagado) {
  const existe = await prisma.financiaciones.findFirst({
    where: { id: Number(id), ...VIGENTE },
  });
  if (!existe) return null;

  const n = parsearEntero(numero, "El número de cuota", { min: 1, max: existe.cantidad_cuotas });

  if (pagado) {
    await prisma.financiacion_pagos.upsert({
      where: { financiacion_id_numero: { financiacion_id: Number(id), numero: n } },
      update: { pagado_en: new Date() },
      create: { financiacion_id: Number(id), numero: n },
    });
  } else {
    await prisma.financiacion_pagos.deleteMany({
      where: { financiacion_id: Number(id), numero: n },
    });
  }

  return obtenerFinanciacion(id);
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
