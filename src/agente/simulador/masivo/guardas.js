// Guardas del simulador masivo: las dos conexiones de la corrida solo pueden apuntar a la base local
// `agencia_simulacion`, nunca a `agencia` ni a una base remota. Los errores no muestran la clave.
import { esBaseLocal } from "../../../lib/base-local.js";

export const BASE_SIMULACION = "agencia_simulacion";
const PUERTO_LOCAL = "3306";

function leer(url, nombre) {
  try {
    return new URL(url);
  } catch {
    throw new Error(`La URL de ${nombre} falta o no es válida.`);
  }
}

const nombreDeBase = (partes) => decodeURIComponent(partes.pathname.replace(/^\//, ""));

function verificarUna(url, nombre, prohibidas) {
  const partes = leer(url, nombre);
  if (!esBaseLocal(url)) throw new Error(`La conexión de ${nombre} no es local (host ${partes.hostname}): solo se simula contra la base local.`);
  if ((partes.port || PUERTO_LOCAL) !== PUERTO_LOCAL) throw new Error(`La conexión de ${nombre} usa el puerto ${partes.port}: tiene que ser el ${PUERTO_LOCAL}.`);
  const base = nombreDeBase(partes);
  if (prohibidas.includes(base)) throw new Error(`La base "${base}" de ${nombre} coincide con una base prohibida (la de DATABASE_URL o AGENTE_DATABASE_URL originales).`);
  if (base !== BASE_SIMULACION) throw new Error(`La base de ${nombre} es "${base}": tiene que ser ${BASE_SIMULACION} (nunca la de desarrollo, prohibida).`);
}

export function verificarBases({ backend, agente } = {}, { prohibidas } = {}) {
  if (!Array.isArray(prohibidas)) throw new Error("Falta la lista de bases prohibidas: no hay forma de verificar.");
  verificarUna(backend, "backend", prohibidas);
  verificarUna(agente, "agente", prohibidas);
}

// Misma URL (usuario, clave codificada, host, puerto y parámetros) con la base cambiada.
export function urlDeSimulacion(url) {
  return String(url).replace(/^([a-z][a-z0-9+.-]*:\/\/[^/?#]*)(\/[^?#]*)?/i, `$1/${BASE_SIMULACION}`);
}

export function basesProhibidas(env) {
  const bases = [];
  for (const url of [env.DATABASE_URL, env.AGENTE_DATABASE_URL]) {
    if (!url) continue;
    try {
      const base = nombreDeBase(new URL(url));
      if (base && !bases.includes(base)) bases.push(base);
    } catch {
      // una URL inválida no aporta ninguna base
    }
  }
  return bases;
}
