import {
  listarPreparaciones,
  obtenerPreparacion,
  actualizarPreparacion,
  publicarPreparacion,
  despublicarPreparacion,
} from "../services/preparaciones.service.js";

const comoAdmin = (req) => ({ admin: req.usuario.rol === "admin" });

export async function getPreparaciones(req, res, next) {
  try {
    const { etapa, q, offset, limite } = req.query;
    res.json({ ok: true, data: await listarPreparaciones({ etapa, q, offset, limite }, comoAdmin(req)) });
  } catch (err) {
    next(err);
  }
}

export async function getPreparacion(req, res, next) {
  try {
    res.json({ ok: true, data: await obtenerPreparacion(req.params.id, comoAdmin(req)) });
  } catch (err) {
    next(err);
  }
}

export async function patchPreparacion(req, res, next) {
  try {
    res.json({ ok: true, data: await actualizarPreparacion(req.params.id, req.body ?? {}) });
  } catch (err) {
    next(err);
  }
}

export async function postPublicacion(req, res, next) {
  try {
    await publicarPreparacion(req.params.id);
    res.json({ ok: true, data: await obtenerPreparacion(req.params.id, comoAdmin(req)) });
  } catch (err) {
    next(err);
  }
}

export async function deletePublicacion(req, res, next) {
  try {
    await despublicarPreparacion(req.params.id);
    res.json({ ok: true, data: await obtenerPreparacion(req.params.id, comoAdmin(req)) });
  } catch (err) {
    next(err);
  }
}
