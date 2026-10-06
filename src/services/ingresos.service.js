import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { mapIngreso } from "../mappers/ingreso.mapper.js";
import { MODALIDADES } from "../lib/modalidades.js";
import { registrarPersona, SELECT_PERFIL } from "./personas.service.js";

// Toma de un vehículo: el auto entró al playón en consignación, comprado o en
// permuta. En la consignación todavía no está publicado: `consignaciones` no
// cubre esta etapa porque exige `auto_id`, y el auto se carga al catálogo
// recién cuando los papeles están en orden.

const VIGENTE = { deleted_at: null };
const ESTADOS = ["recepcion", "publicado", "retirado", "vendido"];
const ORIGENES = ["nacional", "importado"];

const PERSONA = {
  select: { id: true, nombre: true, dni: true, telefono: true, email: true, canal: true, cliente_perfiles: { select: SELECT_PERFIL } },
};
const USUARIO = { select: { id: true, nombre: true } };

// El listado no necesita papeles ni contrato: solo si el contrato está firmado.
const PARA_LISTA = {
  titular: PERSONA,
  usuarios: USUARIO,
  consignacion_contratos: { select: { firmado_at: true } },
  compraventa_contratos: { select: { firmado_at: true } },
  consignacion_documentos: { where: VIGENTE, select: { tipo: true, tenencia: true, fecha_vencimiento: true, datos_json: true } },
};

export const PARA_DETALLE = {
  titular: PERSONA,
  usuarios: USUARIO,
  consignacion_contratos: true,
  compraventa_contratos: {
    include: { auto_entregado: { select: { ref: true, marca: true, modelo: true, anio: true, kms: true } } },
  },
  consignacion_documentos: {
    where: VIGENTE,
    orderBy: { id: "asc" },
    include: { usuarios: USUARIO },
  },
};

function error(mensaje, status = 400) {
  const e = new Error(mensaje);
  e.status = status;
  return e;
}

const limpiar = (v, max) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : null);
// El dominio se guarda sin espacios ni guiones y en mayúsculas: "ab 123 cd" y
// "AB123CD" son la misma patente y tienen que chocar entre sí.
const normalizarDominio = (v) => (limpiar(v, 20) || "").toUpperCase().replace(/[\s-]/g, "").slice(0, 15);

function entero(valor, campo, { min, max } = {}) {
  const n = Number(valor);
  if (!Number.isInteger(n)) throw error(`${campo} debe ser un número entero.`);
  if (min != null && n < min) throw error(`${campo} no puede ser menor a ${min}.`);
  if (max != null && n > max) throw error(`${campo} no puede ser mayor a ${max}.`);
  return n;
}

// Un mismo auto no puede estar tomado dos veces al mismo tiempo. Se valida al
// cargar el título, que es cuando el ingreso recibe su dominio.
export async function dominioLibre(dominio, excluyendoId, tx) {
  const tomado = await tx.consignacion_ingresos.findFirst({
    where: {
      dominio,
      ...VIGENTE,
      // Retirado o vendido, el auto ya no está en la agencia: puede volver a entrar.
      estado: { notIn: ["retirado", "vendido"] },
      ...(excluyendoId ? { id: { not: excluyendoId } } : {}),
    },
    select: { id: true },
  });
  if (tomado) throw error("Ya hay un ingreso abierto para ese dominio.", 409);
}

// Los datos del vehículo, tal como los declara el título del automotor. El
// título es la fuente: se escriben las siete columnas siempre, así un campo que
// se borra del título también se borra del vehículo.
export function datosVehiculo(titulo) {
  const dominio = normalizarDominio(titulo.dominio);
  if (!dominio) throw error("El dominio es obligatorio.");
  const marca = limpiar(titulo.marca, 60);
  if (!marca) throw error("La marca es obligatoria.");
  const modelo = limpiar(titulo.modelo, 80);
  if (!modelo) throw error("El modelo es obligatorio.");

  const origen = titulo.origen || null;
  if (origen && !ORIGENES.includes(origen)) throw error(`El origen debe ser uno de: ${ORIGENES.join(", ")}.`);

  return {
    dominio,
    marca,
    modelo,
    anio: entero(titulo.anio, "El año", { min: 1900, max: 2200 }),
    motor: limpiar(titulo.motor, 40)?.toUpperCase() || null,
    chasis: limpiar(titulo.chasis, 40)?.toUpperCase() || null,
    origen,
  };
}

// Fotos públicas del vehículo: la principal primero y hasta 3 más. Son URLs del
// store público de imágenes; al publicar pasan tal cual a la ficha del catálogo.
const MAX_FOTOS = 4;

function fotosValidas(fotos) {
  if (fotos === null) return Prisma.DbNull;
  if (!Array.isArray(fotos)) throw error("Las fotos deben ser una lista.");
  if (fotos.length > MAX_FOTOS) throw error(`Se admiten hasta ${MAX_FOTOS} fotos: la principal y ${MAX_FOTOS - 1} más.`);
  const urls = fotos.map((f) => (typeof f === "string" ? f.trim() : ""));
  if (urls.some((u) => !/^https:\/\/\S+$/.test(u) || u.length > 500)) throw error("Cada foto tiene que ser una URL https válida.");
  return urls.length ? urls : Prisma.DbNull;
}

// Lo que se carga al recibir el auto y no figura en ningún papel: los km del
// tablero, las notas y las fotos. Solo se tocan los campos presentes; "" o null
// los borran.
function datosRecepcion(body) {
  const data = {};
  if (body.kmRecepcion !== undefined) {
    data.km_recepcion =
      body.kmRecepcion === "" || body.kmRecepcion === null ? null : entero(body.kmRecepcion, "Los kilómetros", { min: 0, max: 9999999 });
  }
  if (body.notas !== undefined) data.notas = typeof body.notas === "string" ? body.notas.trim() || null : null;
  if (body.fotos !== undefined) data.fotos_json = fotosValidas(body.fotos);
  return data;
}

// Mismo tope que los montos del boleto: DECIMAL(12,2).
const TOPE_MONTO = 9999999999.99;

// Monto opcional en pesos: "" o null lo borran.
function montoOpcional(valor, campo) {
  if (valor === "" || valor === null) return null;
  const monto = Number(valor);
  if (!Number.isFinite(monto) || monto < 0) throw error(`${campo} debe ser un monto válido.`);
  if (monto > TOPE_MONTO) throw error(`${campo} supera el máximo que admite el sistema.`);
  return Math.round(monto * 100) / 100;
}

// Solo en la parte de pago: el usado que deja el cliente, escrito como se lo
// nombra (todavía sin título), en cuánto se lo toma y el efectivo que entrega
// además. Mismas reglas que la recepción: solo los campos presentes; "" o null
// los borran.
function datosParteDePago(body, modalidad) {
  if (modalidad !== "permuta") return {};
  const data = {};
  if (body.parteDePagoVehiculo !== undefined) data.parte_pago_vehiculo = limpiar(body.parteDePagoVehiculo, 150) || null;
  if (body.parteDePagoValor !== undefined) data.parte_pago_valor = montoOpcional(body.parteDePagoValor, "El valor de toma");
  if (body.parteDePagoEfectivo !== undefined) data.parte_pago_efectivo = montoOpcional(body.parteDePagoEfectivo, "Lo que tiene para entregar");
  return data;
}

// ── Lecturas ──

// `q` busca por dominio, vehículo o por el titular (nombre o DNI).
export async function listarIngresos({ modalidad = "", estado = "", q = "", offset = 0, limite = 10 } = {}) {
  const take = Math.max(1, Number(limite) || 10);
  const skip = Math.max(0, Number(offset) || 0);
  const termino = String(q || "").trim();

  const filtros = [VIGENTE];
  if (MODALIDADES.includes(modalidad)) filtros.push({ modalidad });
  if (ESTADOS.includes(estado)) filtros.push({ estado });
  if (termino) {
    const digitos = termino.replace(/\D/g, "");
    filtros.push({
      OR: [
        { dominio: { contains: normalizarDominio(termino) } },
        { marca: { contains: termino } },
        { modelo: { contains: termino } },
        { titular: { nombre: { contains: termino } } },
        ...(digitos.length >= 6 ? [{ titular: { dni: { contains: digitos } } }] : []),
      ],
    });
  }
  const where = { AND: filtros };

  const [filas, total] = await Promise.all([
    prisma.consignacion_ingresos.findMany({ where, include: PARA_LISTA, orderBy: { id: "desc" }, skip, take: take + 1 }),
    prisma.consignacion_ingresos.count({ where }),
  ]);

  const hayMas = filas.length > take;
  return { items: (hayMas ? filas.slice(0, take) : filas).map((i) => mapIngreso(i)), hayMas, total };
}

export async function obtenerIngreso(id) {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) return null;
  const i = await prisma.consignacion_ingresos.findFirst({ where: { id: n, ...VIGENTE }, include: PARA_DETALLE });
  return i ? mapIngreso(i, { conDetalle: true }) : null;
}

// ── Escrituras ──

// El titular se guarda como fila de `clientes` dentro de la misma transacción:
// si el ingreso falla, no queda una persona suelta.
//
// El cónyuge ya no se carga (migración 044). `conyuge_cliente_id` sigue en la
// tabla por los ingresos viejos, pero nada lo escribe ni lo lee.
//
// El vehículo NO se carga acá: sale del título cuando se sube ese papel. Un
// ingreso recién creado no tiene dominio, marca ni modelo todavía.
//
// La modalidad se fija acá y no se edita: cambiarla dejaría colgado un contrato
// del tipo equivocado.
export async function crearIngreso(body = {}, usuarioId = null) {
  if (!body.titular) throw error("Faltan los datos del titular.");
  const modalidad = body.modalidad ?? "consignacion";
  if (!MODALIDADES.includes(modalidad)) throw error(`La modalidad debe ser una de: ${MODALIDADES.join(", ")}.`);
  const recepcion = { ...datosRecepcion(body), ...datosParteDePago(body, modalidad) };

  return prisma.$transaction(async (tx) => {
    const clienteId = await registrarPersona(body.titular, tx);

    const creado = await tx.consignacion_ingresos.create({
      data: { ...recepcion, modalidad, cliente_id: clienteId, recibido_por: usuarioId },
      include: PARA_DETALLE,
    });
    return mapIngreso(creado, { conDetalle: true });
  });
}

export async function actualizarIngreso(id, body = {}) {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) return null;

  return prisma.$transaction(async (tx) => {
    const existe = await tx.consignacion_ingresos.findFirst({ where: { id: n, ...VIGENTE } });
    if (!existe) return null;

    // Los datos del vehículo no se editan acá: se corrigen editando el título.
    const data = { ...datosRecepcion(body), ...datosParteDePago(body, existe.modalidad) };

    if (body.titular) data.cliente_id = await registrarPersona(body.titular, tx, { reemplazarPerfil: true });

    // Publicar = vincular con la fila de `consignaciones` que maneja la venta.
    if (body.consignacionId !== undefined) {
      if (existe.modalidad !== "consignacion") throw error("Solo una consignación se vincula con la venta por cuenta de terceros.", 409);
      if (body.consignacionId === null || body.consignacionId === "") {
        data.consignacion_id = null;
        data.estado = "recepcion";
        data.estado_at = new Date();
      } else {
        const consignacionId = entero(body.consignacionId, "La consignación", { min: 1 });
        const destino = await tx.consignaciones.findFirst({ where: { id: consignacionId, deleted_at: null }, select: { id: true } });
        if (!destino) throw error("Esa consignación no existe.", 404);
        data.consignacion_id = destino.id;
        data.estado = "publicado";
        data.estado_at = new Date();
      }
    } else if (body.estado !== undefined) {
      // El estado NO se cambia por acá. Publicar o retirar tiene que apagar o
      // encender la ficha del catálogo en la misma transacción, y eso vive en
      // ingreso-publicacion.service.js. Dejar una segunda puerta que solo
      // escribe la columna terminaría en un auto "retirado" que sigue a la
      // venta en la web.
      throw error("El estado se cambia desde la acción de publicar o retirar, no editando el ingreso.", 409);
    }

    const actualizado = await tx.consignacion_ingresos.update({ where: { id: existe.id }, data, include: PARA_DETALLE });
    return mapIngreso(actualizado, { conDetalle: true });
  });
}

// Soft delete: la fila queda para auditoría y el dominio vuelve a estar libre.
// Los papeles y el contrato no se borran: cuelgan del ingreso y dejan de verse
// con él, que es justo lo que hace falta si el borrado fue un error.
export async function eliminarIngreso(id) {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) return false;
  const existe = await prisma.consignacion_ingresos.findFirst({ where: { id: n, ...VIGENTE }, select: { id: true } });
  if (!existe) return false;

  await prisma.consignacion_ingresos.update({ where: { id: existe.id }, data: { deleted_at: new Date() } });
  return true;
}
