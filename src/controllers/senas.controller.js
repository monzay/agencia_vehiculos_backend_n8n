import {
  listarSenas,
  obtenerSena,
  crearSena,
  actualizarSena,
  cancelarSena,
  iniciarTramite,
  eliminarSena,
} from "../services/senas.service.js";

// Cada handler delega en el servicio: los errores de negocio traen su `status`
// y los resuelve el middleware de errores.
const responder = (fn, status = 200) => async (req, res, next) => {
  try {
    res.status(status).json({ ok: true, data: await fn(req) });
  } catch (err) {
    next(err);
  }
};

export const getSenas = responder((req) =>
  listarSenas({ estado: req.query.estado, q: req.query.q, offset: req.query.offset, limite: req.query.limite })
);
export const getSena = responder((req) => obtenerSena(req.params.id));
export const postSena = responder((req) => crearSena(req.body, req.usuario.id), 201);
export const patchSena = responder((req) => actualizarSena(req.params.id, req.body));
export const postCancelacion = responder((req) => cancelarSena(req.params.id));
export const postTramite = responder((req) => iniciarTramite(req.params.id, req.usuario.id), 201);
export const deleteSena = responder(async (req) => ({ eliminado: await eliminarSena(req.params.id) }));
