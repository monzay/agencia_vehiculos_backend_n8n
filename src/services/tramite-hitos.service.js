import { prisma } from "../lib/prisma.js";
import { error, fechaSimple } from "../lib/contrato-campos.js";
import { hoyFecha } from "../lib/senas.js";
import { vendeLaAgencia } from "../lib/modalidades.js";
import { mapIngreso } from "../mappers/ingreso.mapper.js";
import { PARA_DETALLE } from "./ingresos.service.js";
import { validarFotoEntrega } from "./entregas.service.js";

// Lo que pasa después de vender: se cobró, se entregó, se transfirió. Es una marca
// con la fecha real: el cobro no es una caja, y la entrega no toca lo pactado en el
// boleto firmado. No hay orden obligatorio entre ellos.

const VIGENTE = { deleted_at: null };
const HITOS = ["cobrado", "entregado", "transferido"];

function exigirTipo(tipo) {
  if (!HITOS.includes(tipo)) throw error("Ese paso no existe.", 404);
}

function fechaDelHito(valor) {
  const fecha = fechaSimple(valor, "La fecha");
  if (fecha > hoyFecha()) throw error("La fecha no puede ser futura.");
  return fecha;
}

async function tramiteVigente(ingresoId, tx) {
  const id = Number(ingresoId);
  if (!Number.isInteger(id) || id <= 0) throw error("Trámite no encontrado.", 404);
  const tramite = await tx.consignacion_ingresos.findFirst({ where: { id, ...VIGENTE }, include: PARA_DETALLE });
  if (!tramite) throw error("Trámite no encontrado.", 404);
  return tramite;
}

function exigirQueCorresponda(tramite, tipo) {
  if (!vendeLaAgencia(tramite.modalidad)) throw error("Solo una venta de la agencia lleva cobro, entrega y transferencia.", 409);
  if (tramite.estado !== "vendido") throw error("Marcá el trámite como vendido antes de seguir.", 409);
  const { pasos } = mapIngreso(tramite, { conDetalle: true }).seguimiento;
  if (!pasos.some((p) => p.id === tipo)) throw error("Este trámite no tiene nada que cobrar en el acto.", 409);
}

const legajo = async (id, tx) => mapIngreso(await tramiteVigente(id, tx), { conDetalle: true });

/**
 * @param {{ fecha: string, fotoUrl?: string }} body la foto solo se usa en la entrega
 * @returns {Promise<object>} el legajo actualizado
 */
export async function marcarHito(ingresoId, tipo, body = {}, usuarioId = null) {
  exigirTipo(tipo);
  const fecha = fechaDelHito(body.fecha);
  const foto = tipo === "entregado" && body.fotoUrl ? validarFotoEntrega(body.fotoUrl) : null;

  return prisma.$transaction(async (tx) => {
    const tramite = await tramiteVigente(ingresoId, tx);
    exigirQueCorresponda(tramite, tipo);

    await tx.tramite_hitos.upsert({
      where: { ingreso_id_tipo: { ingreso_id: tramite.id, tipo } },
      create: { ingreso_id: tramite.id, tipo, fecha, creado_por: usuarioId },
      update: { fecha, creado_por: usuarioId, deleted_at: null, updated_at: new Date() },
    });
    if (foto) await tx.entregas.create({ data: { url: foto, cliente_id: tramite.cliente_id, ingreso_id: tramite.id } });
    return legajo(tramite.id, tx);
  });
}

/**
 * Se marcó por error. Si era la entrega, su foto sale de la galería pública.
 * @returns {Promise<object>} el legajo actualizado
 */
export async function desmarcarHito(ingresoId, tipo) {
  exigirTipo(tipo);

  return prisma.$transaction(async (tx) => {
    const tramite = await tramiteVigente(ingresoId, tx);
    const ahora = new Date();
    const { count } = await tx.tramite_hitos.updateMany({
      where: { ingreso_id: tramite.id, tipo, ...VIGENTE },
      data: { deleted_at: ahora, updated_at: ahora },
    });
    if (!count) throw error("Ese paso no está marcado.", 404);
    if (tipo === "entregado") {
      await tx.entregas.updateMany({ where: { ingreso_id: tramite.id, ...VIGENTE }, data: { deleted_at: ahora } });
    }
    return legajo(tramite.id, tx);
  });
}
