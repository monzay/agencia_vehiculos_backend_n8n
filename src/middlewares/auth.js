import { verificarToken } from "../lib/auth.js";

// Extrae y valida el JWT del header Authorization: Bearer <token>.
// Si es valido, deja el payload en req.usuario; si no, corta con 401.
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ ok: false, error: "No autenticado" });
  }
  try {
    const payload = verificarToken(token);
    req.usuario = { id: payload.sub, rol: payload.rol, nombre: payload.nombre };
    next();
  } catch {
    return res.status(401).json({ ok: false, error: "Sesion invalida o expirada" });
  }
}

// Exige uno de los roles indicados. Usar SIEMPRE despues de requireAuth.
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.usuario || !roles.includes(req.usuario.rol)) {
      return res.status(403).json({ ok: false, error: "No autorizado" });
    }
    next();
  };
}
