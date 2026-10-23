import {
  listarFinanciaciones,
  listarFinanciacionesPaginado,
  obtenerFinanciacion,
  crearFinanciacion,
  actualizarFinanciacion,
  eliminarFinanciacion,
  marcarCuota,
  consultarPorDni,
} from "../services/financiaciones.service.js";
import { listarAlertasPendientes, marcarAlertaAtendida } from "../services/alertas-financiacion.service.js";
import { prisma } from "../lib/prisma.js";

// Avisos de clientes que respondieron un recordatorio de cuota (solo admin).
export async function getAlertas(req, res, next) {
  try {
    res.json({ ok: true, data: await listarAlertasPendientes({ db: prisma }) });
  } catch (err) {
    next(err);
  }
}

export async function putAlertaAtendida(req, res, next) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ ok: false, error: "Aviso inválido" });
  try {
    const ok = await marcarAlertaAtendida({ db: prisma, id, usuario: req.usuario?.nombre });
    if (!ok) return res.status(404).json({ ok: false, error: "El aviso no existe o ya estaba atendido" });
    res.json({ ok: true, data: { atendida: true } });
  } catch (err) {
    next(err);
  }
}

// Consulta pública por DNI (sin auth). Devuelve las financiaciones del cliente.
export async function getConsultaPorDni(req, res, next) {
  try {
    const financiaciones = await consultarPorDni(req.query.dni);
    res.json({ ok: true, total: financiaciones.length, data: financiaciones });
  } catch (err) {
    next(err);
  }
}

export async function getFinanciaciones(req, res, next) {
  try {
    const { q, offset, limite } = req.query;
    if (limite !== undefined) {
      const data = await listarFinanciacionesPaginado({ q, offset, limite });
      return res.json({ ok: true, data });
    }
    const financiaciones = await listarFinanciaciones();
    res.json({ ok: true, total: financiaciones.length, data: financiaciones });
  } catch (err) {
    next(err);
  }
}

export async function getFinanciacion(req, res, next) {
  try {
    const financiacion = await obtenerFinanciacion(req.params.id);
    if (!financiacion) {
      return res.status(404).json({ ok: false, error: "Financiación no encontrada" });
    }
    res.json({ ok: true, data: financiacion });
  } catch (err) {
    next(err);
  }
}

export async function postFinanciacion(req, res, next) {
  try {
    const financiacion = await crearFinanciacion(req.body);
    res.status(201).json({ ok: true, data: financiacion });
  } catch (err) {
    next(err);
  }
}

export async function patchFinanciacion(req, res, next) {
  try {
    const financiacion = await actualizarFinanciacion(req.params.id, req.body);
    if (!financiacion) {
      return res.status(404).json({ ok: false, error: "Financiación no encontrada" });
    }
    res.json({ ok: true, data: financiacion });
  } catch (err) {
    next(err);
  }
}

export async function putCuota(req, res, next) {
  const pagado = req.body?.pagado;
  if (typeof pagado !== "boolean") return res.status(400).json({ ok: false, error: "Falta indicar si la cuota está paga" });
  try {
    const financiacion = await marcarCuota(req.params.id, req.params.numero, pagado);
    if (!financiacion) {
      return res.status(404).json({ ok: false, error: "Financiación no encontrada" });
    }
    res.json({ ok: true, data: financiacion });
  } catch (err) {
    next(err);
  }
}

export async function deleteFinanciacion(req, res, next) {
  try {
    const ok = await eliminarFinanciacion(req.params.id);
    if (!ok) {
      return res.status(404).json({ ok: false, error: "Financiación no encontrada" });
    }
    res.json({ ok: true, data: { eliminado: true } });
  } catch (err) {
    next(err);
  }
}
