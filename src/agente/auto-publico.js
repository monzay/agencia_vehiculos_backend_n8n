import { senaReservando, SIN_RESERVA } from "../lib/senas.js";
import { aplicarDescuento } from "../mappers/descuento.mapper.js";
import { mapPromosDeAuto } from "../mappers/promocion.mapper.js";
import { normalizarTipoVehiculo } from "../lib/tipos-vehiculo.js";

// Lo que el agente puede saber de un auto. Es una lista blanca: el costo, el
// precio de venta interno y quién lo reservó nunca llegan a la IA, así no los
// puede contar aunque la manipulen.

const CONSIGNACION_CERRADA = { deleted_at: null, estado: { in: ["vendido", "retirado"] } };
const TRAMITE_ABIERTO = { deleted_at: null, estado: { not: "vendido" } };
const BOLETO_ABIERTO = { deleted_at: null, consignacion_ingresos: { deleted_at: null } };
const MAX_FOTOS = 4;

// Autos que el agente puede ofrecer: a la venta, visibles, sin seña vigente y
// sin un trámite abierto que ya los comprometa.
export const whereDisponible = () => ({
  deleted_at: null,
  vendido_at: null,
  disponible: true,
  consignaciones: { none: CONSIGNACION_CERRADA },
  ...SIN_RESERVA(),
  tramites_interes: { none: TRAMITE_ABIERTO },
  permutas: { none: BOLETO_ABIERTO },
});

// Lo que hay que traer de la base para armar la ficha y saber si está disponible.
// Columnas explícitas: el usuario de base del agente no tiene permiso sobre
// `costo` ni `precio_venta`, y un "traer todo" fallaría.
export const selectFicha = () => ({
  ref: true,
  marca: true,
  modelo: true,
  anio: true,
  kms: true,
  tipo: true,
  tipo_vehiculo: true,
  combustible: true,
  precio: true,
  disponible: true,
  vendido_at: true,
  deleted_at: true,
  fotos_json: true,
  descuentos: true,
  auto_promociones: { include: { promociones: true } },
  senas: { where: senaReservando(), select: { id: true } },
  tramites_interes: { where: TRAMITE_ABIERTO, select: { id: true } },
  permutas: { where: BOLETO_ABIERTO, select: { id: true } },
  consignaciones: { where: CONSIGNACION_CERRADA, select: { estado: true } },
});

const tiene = (lista) => Array.isArray(lista) && lista.length > 0;

export function disponibilidad(auto) {
  if (auto.vendido_at) return "vendido";
  if (auto.deleted_at || !auto.disponible || tiene(auto.consignaciones)) return "no_disponible";
  if (tiene(auto.senas) || tiene(auto.tramites_interes) || tiene(auto.permutas)) return "reservado";
  return "disponible";
}

const listaDeFotos = (fotosJson) => (Array.isArray(fotosJson) ? fotosJson.filter((f) => typeof f === "string" && f.trim()) : []);

export function autoPublico(auto) {
  const precio = auto.precio != null ? Number(auto.precio) : 0;
  const { descuento, precio_final, ahorro } = aplicarDescuento(precio, auto.descuentos);
  return {
    ref: auto.ref,
    marca: auto.marca,
    modelo: auto.modelo,
    anio: auto.anio,
    km: auto.kms ?? null,
    tipo: normalizarTipoVehiculo(auto.tipo_vehiculo),
    condicion: auto.tipo === "km" ? "0km" : "usado",
    combustible: auto.combustible ?? null,
    precio,
    precio_final,
    ahorro,
    descuento: descuento ? { nombre: descuento.nombre } : null,
    promociones: mapPromosDeAuto(auto.auto_promociones),
    tiene_fotos: listaDeFotos(auto.fotos_json).length > 0,
    disponibilidad: disponibilidad(auto),
  };
}

// Las fotos como direcciones completas, para que n8n las mande por WhatsApp.
export function fotosPublicas(auto, urlPublica) {
  const base = String(urlPublica ?? "").replace(/\/+$/, "");
  return listaDeFotos(auto.fotos_json)
    .slice(0, MAX_FOTOS)
    .map((f) => (/^https?:\/\//i.test(f) ? f : `${base}/${f.replace(/^\.?\/+/, "")}`));
}
