import { obtenerConfig, actualizarConfig } from "../services/config.service.js";

export async function getConfig(req, res, next) {
  try {
    res.json({ ok: true, data: await obtenerConfig() });
  } catch (err) {
    next(err);
  }
}

export async function patchConfig(req, res, next) {
  try {
    res.json({ ok: true, data: await actualizarConfig(req.body) });
  } catch (err) {
    next(err);
  }
}
