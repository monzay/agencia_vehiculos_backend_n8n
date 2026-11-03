// Cliente de la Central de Deudores del BCRA (API pública, sin autenticación).
// Nunca lanza: una caída del BCRA no puede frenar la charla con el cliente.
// El CUIL no se escribe en los logs: es un dato personal.

export const URL_BCRA = "https://api.bcra.gob.ar/CentralDeDeudores/v1.0";
const TIEMPO_MAXIMO_MS = 8_000;
// Límite medido de la API: 10 llamadas cada 10 s por IP. Cada verificación hace 2.
const MAX_LLAMADAS = 10;
const VENTANA_MS = 10_000;
const LLAMADAS_POR_CONSULTA = 2;

function motivoDe(err) {
  if (err?.motivo) return err.motivo;
  return err?.name === "TimeoutError" || err?.name === "AbortError" ? "tiempo_agotado" : "sin_conexion";
}

/**
 * @returns {{ consultar(cuil: string): Promise<{ estado: "ok", deudas: object|null, cheques: object|null } | { estado: "error", motivo: string }> }}
 */
export function crearClienteBcra({ fetch = globalThis.fetch, base = URL_BCRA, tiempoMaximoMs = TIEMPO_MAXIMO_MS, reloj = Date.now } = {}) {
  let recientes = [];

  function hayLugar() {
    const ahora = reloj();
    const vigentes = recientes.filter((momento) => ahora - momento < VENTANA_MS);
    if (vigentes.length + LLAMADAS_POR_CONSULTA > MAX_LLAMADAS) {
      recientes = vigentes;
      return false;
    }
    recientes = [...vigentes, ...Array(LLAMADAS_POR_CONSULTA).fill(ahora)];
    return true;
  }

  // 404 = el BCRA no tiene registros de ese CUIL.
  async function pedir(ruta) {
    const res = await fetch(`${base}${ruta}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(tiempoMaximoMs) });
    if (res.status === 404) return null;
    if (!res.ok) throw Object.assign(new Error(`El BCRA respondió ${res.status}`), { motivo: `http_${res.status}` });
    const cuerpo = await res.json();
    return cuerpo?.results ?? null;
  }

  return {
    async consultar(cuil) {
      // Va en la URL: solo 11 dígitos, nada que pueda cambiar la ruta.
      if (typeof cuil !== "string" || !/^\d{11}$/.test(cuil)) return { estado: "error", motivo: "cuil_invalido" };
      if (!hayLugar()) return { estado: "error", motivo: "limite" };
      try {
        const [deudas, cheques] = await Promise.all([pedir(`/Deudas/${cuil}`), pedir(`/Deudas/ChequesRechazados/${cuil}`)]);
        return { estado: "ok", deudas, cheques };
      } catch (err) {
        const motivo = motivoDe(err);
        console.error("[bcra] no se pudo consultar la Central de Deudores:", motivo);
        return { estado: "error", motivo };
      }
    },
  };
}
