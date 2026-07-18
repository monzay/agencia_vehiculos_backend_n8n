import {
  listarConsignaciones,
  obtenerConsignacion,
  crearConsignacion,
  actualizarConsignacion,
  eliminarConsignacion,
} from "../services/consignaciones.service.js";

const NO_ENCONTRADA = { ok: false, error: "Consignación no encontrada" };

export async function getConsignaciones(req, res, next) {
  try {
    const { items, hayMas, total } = await listarConsignaciones({
      estado: req.query.estado,
      q: req.query.q,
      offset: req.query.offset,
      limite: req.query.limite,
    });
    res.json({ ok: true, total, data: { items, hayMas, total } });
  } catch (err) {
    next(err);
  }
}

export async function getConsignacion(req, res, next) {
  try {
    const c = await obtenerConsignacion(req.params.id);
    if (!c) return res.status(404).json(NO_ENCONTRADA);
    res.json({ ok: true, data: c });
  } catch (err) {
    next(err);
  }
}

export async function postConsignacion(req, res, next) {
  try {
    res.status(201).json({ ok: true, data: await crearConsignacion(req.body) });
  } catch (err) {
    next(err);
  }
}

export async function patchConsignacion(req, res, next) {
  try {
    const c = await actualizarConsignacion(req.params.id, req.body);
    if (!c) return res.status(404).json(NO_ENCONTRADA);
    res.json({ ok: true, data: c });
  } catch (err) {
    next(err);
  }
}

export async function deleteConsignacion(req, res, next) {
  try {
    const ok = await eliminarConsignacion(req.params.id);
    if (!ok) return res.status(404).json(NO_ENCONTRADA);
    res.json({ ok: true, data: { eliminado: true } });
  } catch (err) {
    next(err);
  }
}
