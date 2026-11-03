import { prisma } from "../lib/prisma.js";
import { construirRespuestas } from "../mappers/consulta.mapper.js";
import { autoParaVender } from "./auto-venta.service.js";
import { autoParaSenar } from "./senas.service.js";
import { mapPersona, SELECT_PERFIL } from "./personas.service.js";

// Lo que el botón Avanzar lleva de una consulta a los formularios de seña y de
// venta. Solo lee: lo crea el admin al confirmar el formulario.
//
// Lo que dijo el cliente es orientativo. El valor de toma y el anticipo no se
// precargan: quedan a la vista, en `respuestas`.

const VIGENTE = { deleted_at: null };

const SELECT_CLIENTE = {
  id: true,
  nombre: true,
  dni: true,
  telefono: true,
  email: true,
  canal: true,
  cuil: true,
  cliente_perfiles: { select: SELECT_PERFIL },
};

const nombreDeVehiculo = (v) => [v?.marca, v?.modelo, v?.anio].filter(Boolean).join(" ");

/** Los km que escribió el cliente, solo si son un número ("45.000" sí, "80 mil" no). */
export function kmDeclarado(texto) {
  const limpio = String(texto ?? "").trim().replace(/\s*km$/i, "").replace(/[.,]/g, "");
  return /^\d+$/.test(limpio) ? Number(limpio) : null;
}

// El motivo del rechazo, con las mismas reglas que al guardar. Un error sin
// `status` no es una regla de negocio: se deja subir.
async function motivoDeRechazo(validar) {
  try {
    await validar();
    return null;
  } catch (e) {
    if (!e.status) throw e;
    return e.message;
  }
}

async function autoDeConsulta(autoId, db) {
  const auto = await db.autos.findFirst({
    where: { id: autoId, ...VIGENTE },
    select: { ref: true, marca: true, modelo: true, anio: true, precio: true, consignaciones: { where: VIGENTE, select: { id: true }, take: 1 } },
  });
  if (!auto) return null;

  const [noVender, noSenar] = await Promise.all([
    motivoDeRechazo(() => autoParaVender(auto.ref, null, db)),
    motivoDeRechazo(() => autoParaSenar(auto.ref, db)),
  ]);
  return {
    ref: auto.ref,
    marca: auto.marca,
    modelo: auto.modelo,
    anio: auto.anio,
    precio: auto.precio == null ? null : Number(auto.precio),
    consignado: auto.consignaciones.length > 0,
    puedeVender: !noVender,
    puedeSenar: !noSenar,
    aviso: noVender ?? noSenar,
  };
}

function parteDePagoDe(sesion, usado) {
  if (!usado && sesion.entrega_usado == null) return null;
  return {
    entregaUsado: sesion.entrega_usado !== false,
    vehiculo: nombreDeVehiculo(usado),
    km: kmDeclarado(usado?.kms),
    notas: usado?.detalles?.trim() ?? "",
  };
}

/**
 * @param {number|string} sesionId viene de la URL
 * @returns {Promise<object|null>} null si la consulta no existe
 */
export async function precargaDeConsulta(sesionId, db = prisma) {
  const id = Number(sesionId);
  if (!Number.isInteger(id) || id <= 0) return null;

  const sesion = await db.chat_estado.findUnique({
    where: { id },
    include: { vehiculo_cliente: { where: VIGENTE }, clientes: { select: SELECT_CLIENTE } },
  });
  if (!sesion) return null;

  const vehiculos = sesion.vehiculo_cliente ?? [];
  const usado = vehiculos.find((v) => v.contexto === "trade_in");
  const auto = sesion.auto_id ? await autoDeConsulta(sesion.auto_id, db) : null;
  const persona = mapPersona(sesion.clientes);

  return {
    sesionId: sesion.id,
    titulo: nombreDeVehiculo(auto) || null,
    cliente: { ...persona, cuit: persona.cuit ?? sesion.clientes.cuil ?? null },
    auto,
    avisoAuto: sesion.auto_id && !auto ? "El auto de esta consulta ya no está en el sistema." : null,
    parteDePago: parteDePagoDe(sesion, usado),
    respuestas: construirRespuestas(sesion, vehiculos, sesion.clientes),
  };
}
