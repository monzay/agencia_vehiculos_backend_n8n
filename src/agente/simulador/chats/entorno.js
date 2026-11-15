// Prepara el proceso del script de chats simulados: las dos conexiones a la base solo pueden
// ser la de simulación (si no, aborta sin tocar nada), no hay claves de WhatsApp ni de Groq y
// el único destino de red permitido es Anthropic.
import { urlDeSimulacion, verificarBases, basesProhibidas } from "../masivo/guardas.js";

export const PUBLIC_WEB_URL_SIMULACION = "https://www.ortegaautomotores.com";
const HOSTS_PERMITIDOS = ["api.anthropic.com", "localhost", "127.0.0.1", "::1", "[::1]"];

// Devuelve las URLs de simulación y cambia `env`. Las claves quedan vacías y no borradas:
// Prisma recarga el .env y no pisa lo que ya existe.
export function prepararEntorno(env) {
  const prohibidas = basesProhibidas(env);
  const urlRoot = urlDeSimulacion(env.DATABASE_URL);
  const urlAgente = urlDeSimulacion(env.AGENTE_DATABASE_URL);
  verificarBases({ backend: urlRoot, agente: urlAgente }, { prohibidas });
  env.DATABASE_URL = urlRoot;
  env.AGENTE_DATABASE_URL = urlAgente;
  for (const clave of ["WA_TOKEN", "WA_PHONE_NUMBER_ID", "GROQ_API_KEY"]) env[clave] = "";
  env.PUBLIC_WEB_URL = PUBLIC_WEB_URL_SIMULACION;
  return { urlRoot, urlAgente, prohibidas };
}

// Reemplaza fetch por uno que solo deja salir a Anthropic. `intentosBloqueados()` dice cuántos frenó.
export function limitarFetch(global = globalThis) {
  const original = global.fetch;
  const bloqueados = [];
  global.fetch = async (entrada, ...resto) => {
    const url = new URL(typeof entrada === "string" || entrada instanceof URL ? entrada : entrada.url);
    if (!HOSTS_PERMITIDOS.includes(url.hostname)) {
      bloqueados.push(url.hostname);
      throw new Error(`red cortada: ${url.hostname} no está permitido en la simulación`);
    }
    return original(entrada, ...resto);
  };
  return { intentosBloqueados: () => [...bloqueados], restaurar: () => void (global.fetch = original) };
}
