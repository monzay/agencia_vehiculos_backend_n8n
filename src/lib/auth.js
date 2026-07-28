import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

// El secreto NO tiene fallback: sin uno fuerte, la app no arranca (fail-closed).
// Un fallback embebido permitiría forjar tokens de admin si la env faltara.
// Generá uno con: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error(
    "JWT_SECRET ausente o demasiado corto (mínimo 32 caracteres). Configuralo en el entorno antes de iniciar."
  );
}
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
