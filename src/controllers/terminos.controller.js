import { terminosVigentes, publicarTerminos } from "../services/terminos.service.js";

// Sin política publicada responde data null (no 404): así el panel distingue "todavía no
// hay" de un error real.
export async function getTerminos(req, res, next) {
  try {
    res.json({ ok: true, data: await terminosVigentes() });
  } catch (err) {
    next(err);
  }
}

// Publica una versión nueva. El service valida y lanza 400 si el texto no sirve.
export async function postTerminos(req, res, next) {
  try {
    const vigente = await publicarTerminos({ texto: req.body?.texto, publicadoPor: req.usuario?.nombre });
    res.status(201).json({ ok: true, data: vigente });
  } catch (err) {
    next(err);
  }
}
