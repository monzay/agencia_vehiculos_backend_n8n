import { prisma } from "../lib/prisma.js";
import { verificarPassword, firmarToken } from "../lib/auth.js";
import { mapUsuario } from "../mappers/usuario.mapper.js";

function error(mensaje, status = 400) {
  const e = new Error(mensaje);
  e.status = status;
  return e;
}

// Login: valida email + password contra usuarios vigentes y activos.
// Devuelve { token, usuario }. Error generico para no filtrar si el email existe.
export async function login(email, password) {
  const mail = (email || "").trim().toLowerCase();
  if (!mail || !password) throw error("Email y contraseña son obligatorios");

  const u = await prisma.usuarios.findFirst({
    where: { email: mail, deleted_at: null },
  });

  const credInvalidas = error("Email o contraseña incorrectos", 401);
  if (!u) throw credInvalidas;
  if (!u.activo) throw error("Usuario inactivo. Contactá al administrador.", 403);

  const ok = await verificarPassword(password, u.password_hash);
  if (!ok) throw credInvalidas;

  return { token: firmarToken(u), usuario: mapUsuario(u) };
}

// Devuelve el usuario actual a partir de su id (para GET /me).
export async function obtenerActual(id) {
  const u = await prisma.usuarios.findFirst({
    where: { id: Number(id), deleted_at: null },
  });
  return u ? mapUsuario(u) : null;
}
