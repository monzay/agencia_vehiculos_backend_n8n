// Prepara el proceso del script de chats simulados: las dos conexiones a la base solo pueden
// ser la de simulación (si no, aborta sin tocar nada), no hay claves de ninguna API real
// (Anthropic, WhatsApp, Groq, Blob) y el único destino de red permitido es la máquina local.
import { urlDeSimulacion, verificarBases, basesProhibidas } from "../masivo/guardas.js";

export const PUBLIC_WEB_URL_SIMULACION = "https://www.ortegaautomotores.com";
const HOSTS_PERMITIDOS = ["localhost", "127.0.0.1", "::1", "[::1]"];

// Claves de APIs que gastan o que tocan servicios reales: en la simulación no tiene que haber ninguna.
const CLAVES_REALES = ["ANTHROPIC_API_KEY", "WA_TOKEN", "WA_PHONE_NUMBER_ID", "GROQ_API_KEY", "BLOB_DOCUMENTOS_TOKEN", "BLOB_READ_WRITE_TOKEN"];

// Devuelve las URLs de simulación y cambia `env`. Las claves quedan vacías y no borradas:
// Prisma recarga el .env y no pisa lo que ya existe.
export function prepararEntorno(env) {
  const prohibidas = basesProhibidas(env);
  const urlRoot = urlDeSimulacion(env.DATABASE_URL);
  const urlAgente = urlDeSimulacion(env.AGENTE_DATABASE_URL);
  verificarBases({ backend: urlRoot, agente: urlAgente }, { prohibidas });
  env.DATABASE_URL = urlRoot;
  env.AGENTE_DATABASE_URL = urlAgente;
  for (const clave of CLAVES_REALES) env[clave] = "";
  // Las fotos del usado se guardan en una carpeta local, nunca en el Blob real.
  env.BLOB_SIMULADO = "1";
  env.PUBLIC_WEB_URL = PUBLIC_WEB_URL_SIMULACION;
  return { urlRoot, urlAgente, prohibidas };
}

// Lanza si alguna clave de una API real tiene valor (los espacios cuentan como vacía).
export function verificarSinClaves(env) {
  const conValor = CLAVES_REALES.filter((clave) => String(env[clave] ?? "").trim() !== "");
  if (conValor.length) throw new Error(`hay claves de APIs reales cargadas: ${conValor.join(", ")}. La simulación no corre así.`);
}

// 0 solo si no hubo error y se midieron los intentos de red y fueron 0; sin el contador, la corrida falla.
export function codigoDeSalida({ error, intentosDeRed } = {}) {
  return !error && typeof intentosDeRed === "number" && intentosDeRed === 0 ? 0 : 1;
}

// Reemplaza fetch por uno que solo deja salir a la máquina local. `intentosBloqueados()` dice cuántos frenó.
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
