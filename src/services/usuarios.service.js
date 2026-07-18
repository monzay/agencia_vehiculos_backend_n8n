import { prisma } from "../lib/prisma.js";
import { hashPassword } from "../lib/auth.js";
import { mapUsuario } from "../mappers/usuario.mapper.js";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const VIGENTE = { deleted_at: null };

function limpiar(v) {
  return typeof v === "string" ? v.trim() : v;
}
function error(mensaje, status = 400) {
  const e = new Error(mensaje);
  e.status = status;
  return e;
}

// Email unico entre usuarios vigentes (la unicidad se valida en app por el soft delete).
async function chequearEmailLibre(email, exceptoId = null) {
  const dup = await prisma.usuarios.findFirst({
    where: {
      ...VIGENTE,
      email,
      ...(exceptoId != null ? { id: { not: Number(exceptoId) } } : {}),
    },
  });
  if (dup) throw error("Ya existe un usuario con ese email", 409);
}

// Regla: solo puede existir UN admin vigente.
async function chequearAdminUnico(exceptoId = null) {
  const admin = await prisma.usuarios.findFirst({
    where: {
      ...VIGENTE,
      rol: "admin",
      ...(exceptoId != null ? { id: { not: Number(exceptoId) } } : {}),
    },
  });
  if (admin) throw error("Ya existe un administrador. Solo puede haber uno.", 409);
}

// ── Operaciones ──

// Lista los usuarios vigentes (admin primero, luego por nombre).
export async function listarUsuarios() {
  const us = await prisma.usuarios.findMany({
    where: VIGENTE,
    orderBy: [{ rol: "asc" }, { nombre: "asc" }],
  });
  return us.map(mapUsuario);
}

export async function obtenerUsuario(id) {
  const u = await prisma.usuarios.findFirst({ where: { id: Number(id), ...VIGENTE } });
  return u ? mapUsuario(u) : null;
}

// Crea un usuario. El rol por defecto es 'asesor'. Si se pide 'admin', exige que no haya otro.
export async function crearUsuario(body = {}) {
  const nombre = limpiar(body.nombre);
  if (!nombre) throw error("El nombre es obligatorio");

  const email = (limpiar(body.email) || "").toLowerCase();
  if (!email || !EMAIL_RE.test(email)) throw error("El email no es valido");

  const password = body.password;
  if (!password || String(password).length < 6) {
    throw error("La contraseña debe tener al menos 6 caracteres");
  }

  const rol = body.rol === "admin" ? "admin" : "asesor";
  if (rol === "admin") await chequearAdminUnico();
  await chequearEmailLibre(email);

  const u = await prisma.usuarios.create({
    data: {
      nombre,
      email,
      password_hash: await hashPassword(String(password)),
      rol,
      activo: body.activo === false ? false : true,
      vendedor_id: body.vendedorId != null ? Number(body.vendedorId) : null,
    },
  });
  return mapUsuario(u);
}

// Actualiza un usuario (parcial). Permite cambiar password (re-hashea) y datos.
export async function actualizarUsuario(id, body = {}) {
  const existe = await prisma.usuarios.findFirst({ where: { id: Number(id), ...VIGENTE } });
  if (!existe) return null;

  const data = {};
  if (body.nombre !== undefined) {
    const n = limpiar(body.nombre);
    if (!n) throw error("El nombre no puede quedar vacio");
    data.nombre = n;
  }
  if (body.email !== undefined) {
    const email = (limpiar(body.email) || "").toLowerCase();
    if (!email || !EMAIL_RE.test(email)) throw error("El email no es valido");
    await chequearEmailLibre(email, id);
    data.email = email;
  }
  if (body.rol !== undefined && body.rol !== existe.rol) {
    if (body.rol === "admin") await chequearAdminUnico(id);
    data.rol = body.rol === "admin" ? "admin" : "asesor";
  }
  if (body.password) {
    if (String(body.password).length < 6) throw error("La contraseña debe tener al menos 6 caracteres");
    data.password_hash = await hashPassword(String(body.password));
  }
  if (body.activo !== undefined) data.activo = Boolean(body.activo);
  if (body.vendedorId !== undefined) data.vendedor_id = body.vendedorId != null ? Number(body.vendedorId) : null;
  data.updated_at = new Date();

  const u = await prisma.usuarios.update({ where: { id: Number(id) }, data });
  return mapUsuario(u);
}

// Soft delete. No se permite eliminar al admin (dejaria el sistema sin acceso).
export async function eliminarUsuario(id, solicitanteId) {
  const u = await prisma.usuarios.findFirst({ where: { id: Number(id), ...VIGENTE } });
  if (!u) return false;
  if (u.rol === "admin") throw error("No se puede eliminar al administrador", 409);
  if (Number(id) === Number(solicitanteId)) throw error("No podés eliminar tu propio usuario", 409);

  await prisma.usuarios.update({
    where: { id: Number(id) },
    data: { deleted_at: new Date(), activo: false, updated_at: new Date() },
  });
  return true;
}
