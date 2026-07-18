import { obtenerHorarios, guardarHorarios } from "../services/horarios.service.js";

export async function getHorarios(req, res, next) {
  try {
    res.json({ ok: true, data: await obtenerHorarios() });
  } catch (err) {
    next(err);
  }
}

// Reemplaza los horarios de los días enviados. El service valida y lanza 400 si
// los datos no sirven.
export async function putHorarios(req, res, next) {
  try {
    const dias = req.body?.dias ?? req.body;
    res.json({ ok: true, data: await guardarHorarios(dias) });
  } catch (err) {
    next(err);
  }
}
