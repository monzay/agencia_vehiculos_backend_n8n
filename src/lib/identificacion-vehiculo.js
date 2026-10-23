import { error } from "./contrato-campos.js";

// Dominio, motor y chasis de un auto de la agencia. El alta del vehículo no los
// pide: se cargan en Vehículos → Editar o en el boleto cuando se vende, y en los
// dos casos se escriben igual en la ficha.

// Solo texto (o un número, que es un motor de puros dígitos): un objeto o un
// booleano cuenta como vacío en vez de guardarse como "[OBJECT OBJECT]".
const comoTexto = (v) => (typeof v === "string" || typeof v === "number" ? String(v) : "");

// Mayúsculas y sin espacios de más; vacío = null (la ficha queda sin el dato).
export const normalizarIdentificacion = (v, max) => comoTexto(v).trim().replace(/\s+/g, " ").toUpperCase().slice(0, max) || null;

// El dominio, además, sin espacios ni guiones: "AB 123-CD" y "AB123CD" son el mismo.
export const normalizarDominio = (v) => normalizarIdentificacion(comoTexto(v).replace(/[\s-]/g, ""), 15);

const CAMPOS = [
  { clave: "dominio", label: "el dominio", normalizar: normalizarDominio },
  { clave: "motor", label: "el número de motor", normalizar: (v) => normalizarIdentificacion(v, 40) },
  { clave: "chasis", label: "el número de chasis", normalizar: (v) => normalizarIdentificacion(v, 40) },
];

const enumerar = (partes) => (partes.length > 1 ? `${partes.slice(0, -1).join(", ")} y ${partes.at(-1)}` : partes[0]);

// Lo que el boleto dice del auto que vende la agencia. Lo cargado en el
// formulario manda (completa o corrige la ficha); lo que no vino, sale de la
// ficha. Un boleto de automotor identifica la unidad por los tres: sin alguno no se arma.
export function identificacionParaBoleto(cargado, ficha) {
  const datos = Object.fromEntries(
    CAMPOS.map(({ clave, normalizar }) => [clave, cargado[clave] === undefined ? ficha[clave] ?? null : normalizar(cargado[clave])])
  );
  const faltan = CAMPOS.filter(({ clave }) => !datos[clave]).map(({ label }) => label);
  if (faltan.length) throw error(`Para el boleto falta ${enumerar(faltan)} del vehículo que vende la agencia.`);
  return datos;
}

export const difiereDeLaFicha = (datos, ficha) => CAMPOS.some(({ clave }) => datos[clave] !== (ficha[clave] ?? null));
