import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-inseguro";
const JWT_EXPIRES = process.env.JWT_EXPIRES || "8h";

// ── Passwords ──
export async function hashPassword(plano) {
  return bcrypt.hash(plano, 10);
}

export async function verificarPassword(plano, hash) {
  return bcrypt.compare(plano, hash);
}

// ── JWT ──
// El token lleva lo minimo: id, rol y nombre. Nunca el password.
export function firmarToken(usuario) {
  return jwt.sign(
    { sub: usuario.id, rol: usuario.rol, nombre: usuario.nombre },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
}

export function verificarToken(token) {
  return jwt.verify(token, JWT_SECRET); // lanza si es invalido/expirado
}
