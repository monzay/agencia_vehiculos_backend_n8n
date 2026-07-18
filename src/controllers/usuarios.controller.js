import {
  listarUsuarios,
  obtenerUsuario,
  crearUsuario,
  actualizarUsuario,
  eliminarUsuario,
} from "../services/usuarios.service.js";

export async function getUsuarios(req, res, next) {
  try {
    const usuarios = await listarUsuarios();
    res.json({ ok: true, total: usuarios.length, data: usuarios });
  } catch (err) {
    next(err);
  }
}

export async function getUsuario(req, res, next) {
  try {
    const usuario = await obtenerUsuario(req.params.id);
    if (!usuario) return res.status(404).json({ ok: false, error: "Usuario no encontrado" });
    res.json({ ok: true, data: usuario });
  } catch (err) {
    next(err);
  }
}

export async function postUsuario(req, res, next) {
  try {
    const usuario = await crearUsuario(req.body);
    res.status(201).json({ ok: true, data: usuario });
  } catch (err) {
    next(err);
  }
}

export async function patchUsuario(req, res, next) {
  try {
    const usuario = await actualizarUsuario(req.params.id, req.body);
    if (!usuario) return res.status(404).json({ ok: false, error: "Usuario no encontrado" });
    res.json({ ok: true, data: usuario });
  } catch (err) {
    next(err);
  }
}

export async function deleteUsuario(req, res, next) {
  try {
    const ok = await eliminarUsuario(req.params.id, req.usuario.id);
    if (!ok) return res.status(404).json({ ok: false, error: "Usuario no encontrado" });
    res.json({ ok: true, data: { eliminado: true } });
  } catch (err) {
    next(err);
  }
}
