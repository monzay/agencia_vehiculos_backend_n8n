// A qué base apunta una DATABASE_URL. Los scripts que escriben datos (unificación de clientes)
// se niegan a correr contra una base que no sea la local salvo orden explícita.

const HOSTS_LOCALES = ["localhost", "127.0.0.1", "[::1]"];

function leerUrl(url) {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

// Se mira el host de verdad: un "localhost" en la clave, la base o los parámetros no cuenta.
export function esBaseLocal(url) {
  const partes = leerUrl(url);
  return partes !== null && HOSTS_LOCALES.includes(partes.hostname.toLowerCase());
}

// Contra la base local se corre sin más; contra cualquier otra, solo si se pidió `--produccion`
// (el booleano `true`, no algo que se le parezca).
export function baseAutorizada(url, { produccion = false } = {}) {
  return produccion === true || esBaseLocal(url);
}

// "host:puerto/base", para mostrar en qué se está por escribir; nunca el usuario ni la clave.
export function destinoDeLaBase(url) {
  const partes = leerUrl(url);
  if (!partes) return "(DATABASE_URL ausente o inválida)";
  return `${partes.hostname}${partes.port ? `:${partes.port}` : ""}${partes.pathname}`;
}
