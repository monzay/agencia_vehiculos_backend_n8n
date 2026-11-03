import { login, obtenerActual } from "../services/auth.service.js";
import { actualizarUsuario } from "../services/usuarios.service.js";

export async function postLogin(req, res, next) {

  try {
    const { email, password } = req.body || {};
    const resultado = await login(email, password);
    res.json({ ok: true, data: resultado }); // { token, usuario }
  } catch (err) {
    next(err);
  }
}

// Devuelve el usuario logueado (segun el token). Util para validar sesion en el front.
// Si el usuario del token ya no existe (borrado o base reseteada), la sesion es
// invalida: se responde 401 para que el front limpie el token y mande a /login.
export async function getMe(req, res, next) {
  try {
    const usuario = await obtenerActual(req.usuario.id);
    if (!usuario) return res.status(401).json({ ok: false, error: "Sesión inválida" });
    res.json({ ok: true, data: usuario });
  } catch (err) {
    next(err);
  }
}

// Edita los datos del propio usuario logueado. Solo nombre y email (nunca password,
// rol ni activo): se toman explicitamente del body para evitar escalar privilegios.
export async function patchMe(req, res, next) {
  try {
    const { nombre, email } = req.body || {};
    const usuario = await actualizarUsuario(req.usuario.id, { nombre, email });
    if (!usuario) return res.status(401).json({ ok: false, error: "Sesión inválida" });
    res.json({ ok: true, data: usuario });
  } catch (err) {
    next(err);
  }
}
