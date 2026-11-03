import { prisma } from "../lib/prisma.js";
import { error, TOPE_MONTO, numero, opcion, textoLibre } from "../lib/contrato-campos.js";
import { conUsado } from "../lib/modalidades.js";
import { etapaDe, requisitosPreparacion } from "../lib/requisitos-preparacion.js";
import { mapDocumento, datosVehiculo } from "../mappers/ingreso.mapper.js";
import { mapPreparacion } from "../mappers/preparacion.mapper.js";
import { autoParaSenar } from "./senas.service.js";
import { siguienteRef } from "./ingreso-publicacion.service.js";

// Preparación: lo que pasa entre que la agencia recibe un usado (compra o parte de
// pago) y lo publica. Entra al firmar el boleto. Publicar crea su ficha en `autos`;
// Publicado y Vendido salen de esa ficha.
//
// Las fotos viven en el trámite, igual que en una consignación.

const VIGENTE = { deleted_at: null };
const AVANCES = ["recibido", "en_preparacion", "listo"];

const INCLUDE = {
  auto: { select: { id: true, ref: true, disponible: true, vendido_at: true, deleted_at: true, fotos_json: true } },
  ingreso: {
    include: {
      titular: { select: { id: true, nombre: true } },
      compraventa_contratos: { select: { precio: true, firmado_at: true, deleted_at: true } },
      consignacion_documentos: { where: VIGENTE, select: { tipo: true, tenencia: true, fecha_vencimiento: true, datos_json: true } },
    },
  },
};

// ── Entrada y salida, con la firma del boleto ──

export async function entrarEnPreparacion(ingreso, tx) {
  if (!conUsado(ingreso)) return;
  await tx.preparaciones.upsert({
    where: { ingreso_id: ingreso.id },
    create: { ingreso_id: ingreso.id },
    update: { deleted_at: null, updated_at: new Date() },
  });
}

// `ingreso.preparacion` viene del detalle del trámite.
export async function salirDePreparacion({ preparacion }, tx) {
  if (!preparacion || preparacion.deleted_at) return;
  if (preparacion.auto_id) throw error("Este usado ya tuvo ficha en la web: el boleto no se puede desfirmar.", 409);
  await tx.preparaciones.update({ where: { id: preparacion.id }, data: { deleted_at: new Date(), updated_at: new Date() } });
}

// ── Lecturas ──

const SIN_PUBLICAR = {
  OR: [{ auto_id: null }, { auto: { is: { OR: [{ deleted_at: { not: null } }, { disponible: false, vendido_at: null }] } } }],
};

const FILTRO_ETAPA = {
  recibido: { estado: "recibido", ...SIN_PUBLICAR },
  en_preparacion: { estado: "en_preparacion", ...SIN_PUBLICAR },
  listo: { estado: "listo", ...SIN_PUBLICAR },
  publicado: { auto: { is: { ...VIGENTE, disponible: true, vendido_at: null } } },
  vendido: { auto: { is: { ...VIGENTE, vendido_at: { not: null } } } },
};

export async function listarPreparaciones({ etapa = "", q = "", offset = 0, limite = 10 } = {}, { admin = false } = {}) {
  const take = Math.max(1, Math.min(50, Number(limite) || 10));
  const skip = Math.max(0, Number(offset) || 0);
  const termino = String(q || "").trim();

  const filtros = [VIGENTE, { ingreso: { is: VIGENTE } }];
  if (FILTRO_ETAPA[etapa]) filtros.push(FILTRO_ETAPA[etapa]);
  if (termino) {
    filtros.push({
      ingreso: { is: { OR: [{ dominio: { contains: termino } }, { marca: { contains: termino } }, { modelo: { contains: termino } }] } },
    });
  }
  const where = { AND: filtros };

  const [filas, total] = await Promise.all([
    prisma.preparaciones.findMany({ where, include: INCLUDE, orderBy: { id: "desc" }, skip, take: take + 1 }),
    prisma.preparaciones.count({ where }),
  ]);
  const hayMas = filas.length > take;
  return { items: (hayMas ? filas.slice(0, take) : filas).map((p) => mapPreparacion(p, { admin })), hayMas, total };
}

async function preparacionVigente(id, tx = prisma) {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) throw error("Preparación no encontrada.", 404);
  const p = await tx.preparaciones.findFirst({ where: { id: n, ...VIGENTE, ingreso: { is: VIGENTE } }, include: INCLUDE });
  if (!p) throw error("Preparación no encontrada.", 404);
  return p;
}

export async function obtenerPreparacion(id, { admin = false } = {}) {
  return mapPreparacion(await preparacionVigente(id), { admin });
}

// ── Edición ──

const yaSalio = (p) => ["publicado", "vendido"].includes(etapaDe(p));

// Solo los campos presentes. Una vez en la web, la ficha se edita en Vehículos.
function datosPreparacion(body) {
  const data = {};
  if (body.estado !== undefined) data.estado = opcion(body.estado, "El avance", AVANCES);
  if (body.precioVenta !== undefined) {
    data.precio_venta = body.precioVenta === null || body.precioVenta === "" ? null : numero(body.precioVenta, "El precio de venta", { min: 0.01, max: TOPE_MONTO });
  }
  if (body.descripcion !== undefined) data.descripcion = textoLibre(body.descripcion, "La descripción", 2000);
  return data;
}

export async function actualizarPreparacion(id, body = {}) {
  const p = await preparacionVigente(id);
  if (yaSalio(p)) throw error("Este usado ya salió a la web: su ficha se edita en Vehículos.", 409);

  const actualizada = await prisma.preparaciones.update({
    where: { id: p.id },
    data: { ...datosPreparacion(body), updated_at: new Date() },
    include: INCLUDE,
  });
  return mapPreparacion(actualizada, { admin: true });
}

// ── Publicar ──

function exigirRequisitos(p) {
  const { ingreso } = p;
  const vehiculo = datosVehiculo(ingreso);
  const documentos = (ingreso.consignacion_documentos ?? []).map((d) => mapDocumento(d, vehiculo));
  const { items } = requisitosPreparacion({ documentos, fotos: ingreso.fotos_json, precioVenta: p.precio_venta });
  const faltan = items.filter((i) => !i.cumplido);
  if (faltan.length) throw error(`Para publicar falta: ${faltan.map((i) => i.label).join(", ")}.`, 409);
}

// `costo` es lo que pagó la agencia: el valor de toma del boleto. Contabilidad calcula
// el margen con él. No se pisa al volver a publicar, porque se pudo corregir en Vehículos.
const fichaNueva = async (p, tx) => {
  const { ingreso } = p;
  return tx.autos.create({
    data: {
      ref: await siguienteRef(tx),
      dominio: ingreso.dominio,
      motor: ingreso.motor,
      chasis: ingreso.chasis,
      marca: ingreso.marca,
      modelo: ingreso.modelo,
      anio: ingreso.anio,
      tipo: "usado",
      precio: Number(p.precio_venta),
      costo: Number(ingreso.compraventa_contratos?.precio),
      kms: ingreso.km_recepcion ?? 0,
      descripcion: p.descripcion,
      fotos_json: ingreso.fotos_json,
      disponible: true,
    },
  });
};

export async function publicarPreparacion(id) {
  return prisma.$transaction(async (tx) => {
    const p = await preparacionVigente(id, tx);
    if (yaSalio(p)) throw error("Este usado ya salió a la web.", 409);
    exigirRequisitos(p);

    if (p.auto && !p.auto.deleted_at) {
      // Las fotos del trámite solo completan una ficha que no tiene: si ya se editaron en Vehículos, mandan esas.
      const fotos = Array.isArray(p.auto.fotos_json) && p.auto.fotos_json.length ? p.auto.fotos_json : p.ingreso.fotos_json;
      await tx.autos.update({
        where: { id: p.auto.id },
        data: { disponible: true, precio: Number(p.precio_venta), descripcion: p.descripcion, fotos_json: fotos, updated_at: new Date() },
      });
      return true;
    }

    const auto = await fichaNueva(p, tx);
    await tx.preparaciones.update({ where: { id: p.id }, data: { auto_id: auto.id, updated_at: new Date() } });
    return true;
  });
}

// La ficha se conserva: si se vuelve a publicar, se reusa. Un auto vendido, señado o
// en un trámite tiene a alguien esperándolo, y `autoParaSenar` frena esos casos.
export async function despublicarPreparacion(id) {
  return prisma.$transaction(async (tx) => {
    const p = await preparacionVigente(id, tx);
    if (etapaDe(p) === "vendido") throw error("Este usado ya se vendió.", 409);
    if (etapaDe(p) !== "publicado") throw error("Este usado no está publicado.", 409);
    await autoParaSenar(p.auto.ref, tx);

    await tx.autos.update({ where: { id: p.auto.id }, data: { disponible: false, updated_at: new Date() } });
    return true;
  });
}
