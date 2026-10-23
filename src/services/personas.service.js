import { prisma } from "../lib/prisma.js";
import { telefonosParaBuscar } from "../lib/busqueda-telefono.js";
import { validarDni } from "../lib/dni.js";
import { VIGENTE_CLIENTE, resolverCliente } from "./clientes.service.js";

// Alta y actualización del titular de una consignación sobre las tablas que ya
// existen: `clientes` + `cliente_perfiles`.
//
// No hay tabla de personas nueva a propósito. El consignante es un cliente de
// la agencia como cualquier otro: si mañana escribe por WhatsApp tiene que ser
// el mismo, no un duplicado. Por eso el vínculo es siempre `clientes.id`.
//
// El DNI es obligatorio. La ficha sale de `resolverCliente`, la puerta única de
// alta de clientes: reconoce a la persona por DNI o por teléfono, venga del canal
// que venga, y solo crea una si no existe.

function error(mensaje, status = 400) {
  const e = new Error(mensaje);
  e.status = status;
  return e;
}

const limpiar = (v, max) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : null);
const soloDigitos = (v) => (typeof v === "string" ? v.replace(/\D/g, "") : "");

// Campos del perfil: todo lo que `clientes` no tiene y una consignación sí pide.
const CAMPOS_PERFIL = [
  "apellido",
  "cuit",
  "domicilio",
  "localidad",
  "provincia",
  "cbu",
  "alias_cbu",
  "banco_cbu",
  "contacto_alt_telefono",
  "contacto_alt_vinculo",
];

// De quién es el teléfono alternativo. Mismos valores que el ENUM de la columna.
const VINCULOS = ["pareja", "padre_madre", "hermano_a", "hijo_a", "otro"];

// Lo que se lee del perfil. Lo usan la búsqueda de acá y los listados de
// ingresos: una sola definición para que un campo nuevo no quede afuera de uno.
export const SELECT_PERFIL = Object.fromEntries(CAMPOS_PERFIL.map((c) => [c, true]));

function validar(datos) {
  const dni = validarDni(datos.dni);

  const nombre = limpiar(datos.nombre, 120);
  if (!nombre) throw error("El nombre es obligatorio.");

  const cuit = soloDigitos(datos.cuit);
  if (datos.cuit && cuit.length !== 11) throw error("El CUIT / CUIL debe tener 11 dígitos.");

  const cbu = soloDigitos(datos.cbu);
  if (datos.cbu && cbu.length !== 22) throw error("El CBU debe tener 22 dígitos.");

  const aliasCbu = limpiar(datos.aliasCbu, 40) || null;
  // El banco describe la cuenta: sin CBU ni alias no hay cuenta que describir.
  const bancoCbu = cbu || aliasCbu ? limpiar(datos.bancoCbu, 60) || null : null;

  const email = limpiar(datos.email, 180);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw error("El email no es válido.");

  // Número y vínculo van juntos: un teléfono sin saber de quién es no sirve para
  // llamar, y la base lo exige con un CHECK.
  const telefonoAlt = limpiar(datos.contactoAltTelefono, 30) || null;
  const vinculoAlt = datos.contactoAltVinculo || null;
  if (Boolean(telefonoAlt) !== Boolean(vinculoAlt)) {
    throw error("El teléfono alternativo y de quién es van juntos: completá los dos o ninguno.");
  }
  if (vinculoAlt && !VINCULOS.includes(vinculoAlt)) {
    throw error(`El vínculo debe ser uno de: ${VINCULOS.join(", ")}.`);
  }

  return {
    dni,
    nombre,
    telefono: limpiar(datos.telefono, 30) || null,
    email: email || null,
    perfil: {
      apellido: limpiar(datos.apellido, 120) || null,
      cuit: cuit || null,
      domicilio: limpiar(datos.domicilio, 200) || null,
      localidad: limpiar(datos.localidad, 120) || null,
      provincia: limpiar(datos.provincia, 80) || null,
      cbu: cbu || null,
      alias_cbu: aliasCbu,
      banco_cbu: bancoCbu,
      contacto_alt_telefono: telefonoAlt,
      contacto_alt_vinculo: vinculoAlt,
    },
  };
}

// Devuelve el `clientes.id` de la persona, creándola si hace falta.
// Recibe `tx` para participar de la transacción del ingreso: si el ingreso
// falla, la persona no queda huérfana.
//
// `reemplazarPerfil`: el perfil se escribe entero y un campo vacío se borra. Es
// para editar, donde el formulario llega con los datos actuales cargados. En el
// alta no: ahí se puede tipear el DNI de alguien que ya existe sin traer su
// perfil, y los vacíos le borrarían datos.
export async function registrarPersona(datos, tx = prisma, { reemplazarPerfil = false } = {}) {
  const { dni, perfil, ...contacto } = validar(datos);

  const { cliente } = await resolverCliente({ canal: "presencial", dni, ...contacto }, tx);
  const clienteId = cliente.id;

  // El perfil sí lo manda el panel entero: es la única fuente que lo escribe.
  const conValor = Object.fromEntries(
    CAMPOS_PERFIL.filter((c) => reemplazarPerfil || perfil[c] != null).map((c) => [c, perfil[c]])
  );
  if (Object.keys(conValor).length) {
    await tx.cliente_perfiles.upsert({
      where: { cliente_id: clienteId },
      create: { cliente_id: clienteId, ...conValor },
      update: { ...conValor, deleted_at: null },
    });
  }

  return clienteId;
}

// Búsqueda para el alta del panel: escribís un DNI o un nombre y te dice si esa
// persona ya está, para reusarla en vez de duplicarla.
export async function buscarPersonas(q = "", limite = 8, db = prisma) {
  const termino = String(q || "").trim();
  if (termino.length < 3) return [];

  const digitos = soloDigitos(termino);
  // El teléfono se guarda con 10 dígitos: pegado como +54 9 388 470-8347 también se busca así.
  const porNumero =
    digitos.length >= 6
      ? [
          { dni: { contains: digitos } },
          ...telefonosParaBuscar(termino).map((telefono) => ({ telefono: { contains: telefono } })),
        ]
      : [];
  const filas = await db.clientes.findMany({
    where: {
      ...VIGENTE_CLIENTE,
      OR: [...porNumero, { nombre: { contains: termino } }],
    },
    select: {
      id: true,
      nombre: true,
      dni: true,
      telefono: true,
      email: true,
      canal: true,
      cliente_perfiles: { select: SELECT_PERFIL },
    },
    orderBy: { id: "desc" },
    take: Math.min(20, Math.max(1, Number(limite) || 8)),
  });

  return filas.map(mapPersona);
}

export function mapPersona(c) {
  if (!c) return null;
  const p = c.cliente_perfiles ?? null;
  return {
    id: c.id,
    nombre: c.nombre ?? null,
    apellido: p?.apellido ?? null,
    dni: c.dni ?? null,
    telefono: c.telefono ?? null,
    email: c.email ?? null,
    canal: c.canal,
    cuit: p?.cuit ?? null,
    domicilio: p?.domicilio ?? null,
    localidad: p?.localidad ?? null,
    provincia: p?.provincia ?? null,
    cbu: p?.cbu ?? null,
    aliasCbu: p?.alias_cbu ?? null,
    bancoCbu: p?.banco_cbu ?? null,
    contactoAlternativo: p?.contacto_alt_telefono
      ? { telefono: p.contacto_alt_telefono, vinculo: p.contacto_alt_vinculo }
      : null,
  };
}
