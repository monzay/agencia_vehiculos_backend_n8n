import { contabilidadResumen } from "../services/contabilidad.service.js";

export async function getContabilidad(req, res, next) {
  try {
    res.json({ ok: true, data: await contabilidadResumen() });
  } catch (err) {
    next(err);
  }
}
