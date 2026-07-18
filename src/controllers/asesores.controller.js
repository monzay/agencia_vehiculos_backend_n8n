import {
  listarAsesores,
  obtenerAsesor,
  crearAsesor,
  actualizarAsesor,
  eliminarAsesor,
} from "../services/asesores.service.js";

export async function getAsesores(req, res, next) {
  try {
    const asesores = await listarAsesores();
    res.json({ ok: true, total: asesores.length, data: asesores });
  } catch (err) {
    next(err);
  }
}

export async function getAsesor(req, res, next) {
  try {
    const asesor = await obtenerAsesor(req.params.id);
    if (!asesor) {
      return res.status(404).json({ ok: false, error: "Asesor no encontrado" });
    }
    res.json({ ok: true, data: asesor });
  } catch (err) {
    next(err);
  }
}

export async function postAsesor(req, res, next) {
  try {
    const asesor = await crearAsesor(req.body);
    res.status(201).json({ ok: true, data: asesor });
  } catch (err) {
    next(err);
  }
}

export async function patchAsesor(req, res, next) {
  try {
    const asesor = await actualizarAsesor(req.params.id, req.body);
    if (!asesor) {
      return res.status(404).json({ ok: false, error: "Asesor no encontrado" });
    }
    res.json({ ok: true, data: asesor });
  } catch (err) {
    next(err);
  }
}

export async function deleteAsesor(req, res, next) {
  try {
    const ok = await eliminarAsesor(req.params.id);
    if (!ok) {
      return res.status(404).json({ ok: false, error: "Asesor no encontrado" });
    }
    res.json({ ok: true, data: { eliminado: true } });
  } catch (err) {
    next(err);
  }
}
