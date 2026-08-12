import { prisma } from "../lib/prisma.js";
import { hashPassword } from "../lib/auth.js";
import { mapVendedorToAsesor } from "../mappers/asesor.mapper.js";

// Un "asesor" es una fila `vendedores` (roster del bot) que además puede tener
// una CUENTA DE ACCESO al panel: una fila `usuarios` con rol='asesor' vinculada
// por `usuarios.vendedor_id`. El email y el estado activo se mantienen en sync
// entre ambas. La contraseña vive solo en `usuarios` (hasheada, nunca se expone).

// ── Helpers de validacion / normalizacion ──

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MIN_PASSWORD = 6;

// Soft delete: solo se consideran "vigentes" las filas con deleted_at NULL.
const VIGENTE = { deleted_at: null };

function limpiar(valor) {
  return typeof valor === "string" ? valor.trim() : valor;
}

function error(mensaje, status = 400) {
  const e = new Error(mensaje);
  e.status = status;
  return e;
}

// Slug del link de captación: minúsculas, sin tildes, con guiones. Si ya existe
// —incluso en un asesor dado de baja, para no reciclar links publicados— se
// desempata con un sufijo numérico.
async function generarSlug(nombre) {
  const base =
    nombre
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 36) || "asesor";

  for (let i = 0; ; i++) {
    const slug = i === 0 ? base : `${base}-${i}`;
    const tomado = await prisma.vendedores.findFirst({ where: { slug } });
    if (!tomado) return slug;
  }
}

// Resuelve el slug de un link de captación. Es PÚBLICO: lo consulta la ruta
// `/a/<slug>` del sitio, que visita alguien sin sesión. Devuelve lo mínimo
// —nombre para saludar, slug para la cookie—, nunca teléfono, email ni id.
//
// Exige `activo`, pero NO `recibe_consultas`: ese flag decide si le tocan leads
// del reparto general; los que trae por su propio link son suyos igual.
export async function obtenerAsesorPorSlug(slug) {
  const limpio = limpiar(slug);
  if (!limpio) return null;

  const v = await prisma.vendedores.findFirst({
    where: { slug: limpio, activo: true, ...VIGENTE },
    select: { nombre: true, slug: true },
  });
  return v || null;
}

function normalizarTelegram(valor) {
  const t = limpiar(valor);
  if (!t) return null;
  return t.startsWith("@") ? t : `@${t}`;
}

function validarEmail(valor) {
  const email = limpiar(valor) || null;
  if (email && !EMAIL_RE.test(email)) throw error("El email no es valido");
  return email;
}

function validarPassword(valor) {
  if (String(valor).length < MIN_PASSWORD) {
    throw error(`La contraseña debe tener al menos ${MIN_PASSWORD} caracteres`);
  }
}

// Unicidad de email en `vendedores` (a nivel app por el soft delete).
async function chequearEmailAsesorLibre(email, exceptoId = null) {
  if (!email) return;
  const dup = await prisma.vendedores.findFirst({
    where: {
      ...VIGENTE,
      email,
      ...(exceptoId != null ? { id: { not: Number(exceptoId) } } : {}),
    },
  });
  if (dup) throw error("Ya existe un asesor con ese email", 409);
}

// Unicidad de teléfono en `vendedores` vigentes (a nivel app por el soft delete).
async function chequearTelefonoLibre(telefono, exceptoId = null) {
  if (!telefono) return;
  const dup = await prisma.vendedores.findFirst({
    where: { ...VIGENTE, telefono, ...(exceptoId != null ? { id: { not: Number(exceptoId) } } : {}) },
  });
  if (dup) throw error("Ya existe un asesor con ese teléfono", 409);
}

// Unicidad de Telegram en `vendedores` vigentes.
async function chequearTelegramLibre(telegram, exceptoId = null) {
  if (!telegram) return;
  const dup = await prisma.vendedores.findFirst({
    where: { ...VIGENTE, telegram_id: telegram, ...(exceptoId != null ? { id: { not: Number(exceptoId) } } : {}) },
  });
  if (dup) throw error("Ya existe un asesor con ese Telegram", 409);
}

// Unicidad de email entre cuentas `usuarios` vigentes (para el login).
async function chequearEmailCuentaLibre(email, exceptoId = null) {
  if (!email) return;
  const dup = await prisma.usuarios.findFirst({
    where: {
      ...VIGENTE,
      email,
      ...(exceptoId != null ? { id: { not: Number(exceptoId) } } : {}),
    },
  });
  if (dup) throw error("Ya existe una cuenta de acceso con ese email", 409);
}

// Cuenta de acceso (usuario) vinculada a un asesor, si existe y está vigente.
function buscarCuenta(vendedorId) {
  return prisma.usuarios.findFirst({
    where: { ...VIGENTE, vendedor_id: Number(vendedorId) },
  });
}

// ── Operaciones ──

// Lista los asesores vigentes (activos primero) e indica cuáles tienen acceso.
export async function listarAsesores() {
  const vendedores = await prisma.vendedores.findMany({
    where: VIGENTE,
    orderBy: [{ activo: "desc" }, { nombre: "asc" }],
  });

  const ids = vendedores.map((v) => v.id);
  const cuentas = ids.length
    ? await prisma.usuarios.findMany({ where: { ...VIGENTE, vendedor_id: { in: ids } } })
    : [];
  const cuentaPorVendedor = new Map(cuentas.map((c) => [c.vendedor_id, c]));

  return vendedores.map((v) => mapVendedorToAsesor(v, cuentaPorVendedor.get(v.id) ?? null));
}

export async function obtenerAsesor(id) {
  const v = await prisma.vendedores.findFirst({ where: { id: Number(id), ...VIGENTE } });
  if (!v) return null;
  return mapVendedorToAsesor(v, await buscarCuenta(v.id));
}

// Crea un asesor. `nombre` es obligatorio. Si se envía `password` (con email),
// además se crea su cuenta de acceso al panel (rol='asesor').
export async function crearAsesor(body = {}) {
  const nombre = limpiar(body.nombre);
  if (!nombre) throw error("El nombre es obligatorio");

  const email = validarEmail(body.email);
  const telefono = limpiar(body.telefono) || null;
  const telegram = normalizarTelegram(body.telegramId);
  await chequearEmailAsesorLibre(email);
  await chequearTelefonoLibre(telefono);
  await chequearTelegramLibre(telegram);

  const activo = body.activo === false ? false : true;
  const password = body.password ? String(body.password) : null;

  // Si se quiere crear el acceso, se validan email + password ANTES de escribir.
  if (password) {
    if (!email) throw error("Para crear el acceso, el email es obligatorio");
    validarPassword(password);
    await chequearEmailCuentaLibre(email.toLowerCase());
  }

  const v = await prisma.vendedores.create({
    data: {
      nombre,
      slug: await generarSlug(nombre),
      telefono,
      telegram_id: telegram,
      email,
      activo,
    },
  });

  let cuenta = null;
  if (password) {
    cuenta = await prisma.usuarios.create({
      data: {
        nombre,
        email: email.toLowerCase(),
        password_hash: await hashPassword(password),
        rol: "asesor",
        activo,
        vendedor_id: v.id,
      },
    });
  }

  return mapVendedorToAsesor(v, cuenta);
}

// Actualiza un asesor (edición parcial) y su cuenta de acceso. Permite cambiar
// email, activar/desactivar y setear/restablecer la contraseña. Si el asesor no
// tenía cuenta y se envía `password`, se le crea el acceso.
export async function actualizarAsesor(id, body = {}) {
  const existe = await prisma.vendedores.findFirst({ where: { id: Number(id), ...VIGENTE } });
  if (!existe) return null;

  // La cuenta del administrador no se edita desde el roster de asesores
  // (el admin gestiona sus datos en Configuración → /api/auth/me).
  const cuentaAdmin = await prisma.usuarios.findFirst({
    where: { ...VIGENTE, vendedor_id: Number(id), rol: "admin" },
  });
  if (cuentaAdmin) throw error("La cuenta del administrador no se puede editar desde acá", 403);

  // ── Datos del asesor (vendedores) ──
  const data = {};
  if (body.nombre !== undefined) {
    const n = limpiar(body.nombre);
    if (!n) throw error("El nombre no puede quedar vacio");
    data.nombre = n;
  }
  if (body.telefono !== undefined) {
    const tel = limpiar(body.telefono) || null;
    await chequearTelefonoLibre(tel, id);
    data.telefono = tel;
  }
  if (body.telegramId !== undefined) {
    const tg = normalizarTelegram(body.telegramId);
    await chequearTelegramLibre(tg, id);
    data.telegram_id = tg;
  }
  let emailNuevo; // undefined = no cambia
  if (body.email !== undefined) {
    emailNuevo = validarEmail(body.email);
    await chequearEmailAsesorLibre(emailNuevo, id);
    data.email = emailNuevo;
  }
  if (body.activo !== undefined) data.activo = Boolean(body.activo);
  // Participación en el round-robin del bot (toggle por asesor desde el panel).
  if (body.recibeConsultas !== undefined) data.recibe_consultas = Boolean(body.recibeConsultas);

  // ── Cuenta de acceso (usuarios) ──
  const cuenta = await buscarCuenta(id);
  const password = body.password ? String(body.password) : null;
  if (password) validarPassword(password);

  if (cuenta) {
    const patch = {};
    if (data.nombre !== undefined) patch.nombre = data.nombre;
    if (emailNuevo !== undefined) {
      const em = emailNuevo ? emailNuevo.toLowerCase() : null;
      if (!em) throw error("El email del acceso no puede quedar vacío");
      await chequearEmailCuentaLibre(em, cuenta.id);
      patch.email = em;
    }
    if (password) patch.password_hash = await hashPassword(password);
    if (data.activo !== undefined) patch.activo = data.activo;
    if (Object.keys(patch).length) {
      patch.updated_at = new Date();
      await prisma.usuarios.update({ where: { id: cuenta.id }, data: patch });
    }
  } else if (password) {
    // No tenía acceso y se pide contraseña → se crea la cuenta ahora.
    const em = emailNuevo !== undefined ? emailNuevo : existe.email;
    if (!em) throw error("Para crear el acceso, el email es obligatorio");
    await chequearEmailCuentaLibre(em.toLowerCase());
    await prisma.usuarios.create({
      data: {
        nombre: data.nombre ?? existe.nombre,
        email: em.toLowerCase(),
        password_hash: await hashPassword(password),
        rol: "asesor",
        activo: data.activo !== undefined ? data.activo : existe.activo,
        vendedor_id: Number(id),
      },
    });
  }

  data.updated_at = new Date();
  const v = await prisma.vendedores.update({ where: { id: Number(id) }, data });
  return mapVendedorToAsesor(v, await buscarCuenta(id));
}

// Soft delete: marca `deleted_at` en el asesor y en su cuenta de acceso (para que
// no pueda seguir logueando ni ser elegido por el round-robin del bot).
// Devuelve false si no existe o ya estaba eliminado.
export async function eliminarAsesor(id) {
  const existe = await prisma.vendedores.findFirst({ where: { id: Number(id), ...VIGENTE } });
  if (!existe) return false;

  // El administrador no se puede eliminar a sí mismo: si este asesor es la cuenta
  // de un admin vigente, se rechaza (además es el destino de fallback de leads).
  const cuentaAdmin = await prisma.usuarios.findFirst({
    where: { ...VIGENTE, vendedor_id: Number(id), rol: "admin" },
  });
  if (cuentaAdmin) throw error("No se puede eliminar la cuenta del administrador", 403);

  const ahora = new Date();
  await prisma.vendedores.update({
    where: { id: Number(id) },
    data: { deleted_at: ahora, activo: false, updated_at: ahora },
  });

  const cuenta = await buscarCuenta(id);
  if (cuenta) {
    await prisma.usuarios.update({
      where: { id: cuenta.id },
      data: { deleted_at: ahora, activo: false, updated_at: ahora },
    });
  }
  return true;
}
