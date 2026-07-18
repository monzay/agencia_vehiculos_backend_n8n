import { listarEntregas, crearEntrega, eliminarEntrega } from "../services/entregas.service.js";

const NO_ENCONTRADA = { ok: false, error: "Entrega no encontrada" };

export async function getEntregas(req, res, next) {
  try {
    res.json({ ok: true, data: await listarEntregas() });
  } catch (err) {
    next(err);
  }
}

export async function postEntrega(req, res, next) {
  try {
    res.status(201).json({ ok: true, data: await crearEntrega(req.body) });
  } catch (err) {
    next(err);
  }
}

export async function deleteEntrega(req, res, next) {
  try {
    const ok = await eliminarEntrega(req.params.id);
    if (!ok) return res.status(404).json(NO_ENCONTRADA);
    res.json({ ok: true, data: { eliminado: true } });
  } catch (err) {
    next(err);
  }
}
