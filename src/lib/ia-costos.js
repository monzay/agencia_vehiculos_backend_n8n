// Cuánto cuesta cada llamada a la IA y en qué estado está el tope del mes.
// Los precios viven solo acá: si Anthropic o Groq los cambian, se actualizan
// en este archivo y las filas ya guardadas en `ia_consumos` conservan su costo.

// Claude Haiku 5.5, en dólares por millón de tokens (precios al 06/10/2026).
// Por encima de UMBRAL_LARGO tokens de entrada rige la tarifa larga.
const UMBRAL_LARGO = 100_000;
const PRECIO_CLAUDE = {
  normal: { entrada: 0.1, cacheEscritura: 0.125, cacheLectura: 0.01, salida: 0.5 },
  largo: { entrada: 0.5, cacheEscritura: 0.625, cacheLectura: 0.05, salida: 2.5 },
};

// Groq (Whisper): dólares por hora de audio y mínimo facturado por audio.
// Estimación a confirmar al crear la cuenta.
const PRECIO_GROQ_HORA = 0.04;
const MINIMO_SEGUNDOS_GROQ = 10;

// Argentina no tiene horario de verano: UTC-3 todo el año.
const DESFASE_AR_HORAS = 3;
const AVISO_PORCENTAJE = 80;

const redondear = (valor, decimales) => {
  const factor = 10 ** decimales;
  return Math.round(valor * factor) / factor;
};

// `usage` es el objeto que devuelve la API de Anthropic en cada respuesta.
export function costoClaude(usage = {}) {
  const u = usage ?? {};
  const entrada = u.input_tokens ?? 0;
  const cacheEscritura = u.cache_creation_input_tokens ?? 0;
  const cacheLectura = u.cache_read_input_tokens ?? 0;
  const salida = u.output_tokens ?? 0;

  const precio = entrada + cacheEscritura + cacheLectura > UMBRAL_LARGO ? PRECIO_CLAUDE.largo : PRECIO_CLAUDE.normal;
  const micro =
    entrada * precio.entrada +
    cacheEscritura * precio.cacheEscritura +
    cacheLectura * precio.cacheLectura +
    salida * precio.salida;
  return redondear(micro / 1_000_000, 6);
}

export function costoGroq(segundos = 0) {
  if (!(segundos > 0)) return 0;
  const facturados = Math.max(segundos, MINIMO_SEGUNDOS_GROQ);
  return redondear((facturados * PRECIO_GROQ_HORA) / 3600, 6);
}

export function estadoTope({ gastoUsd, topeUsd, avisoPorcentaje = AVISO_PORCENTAJE }) {
  const porcentaje = topeUsd > 0 ? redondear((gastoUsd / topeUsd) * 100, 1) : 100;
  const restanteUsd = Math.max(0, redondear(topeUsd - gastoUsd, 2));
  const estado = porcentaje >= 100 ? "tope" : porcentaje >= avisoPorcentaje ? "aviso" : "normal";
  return { estado, porcentaje, restanteUsd };
}

// El día 1 a las 00:00 de Argentina del mes en curso, expresado en UTC (que es
// como se guarda `created_at`).
export function inicioMesAR(ahora = new Date()) {
  const enAR = new Date(ahora.getTime() - DESFASE_AR_HORAS * 3_600_000);
  return new Date(Date.UTC(enAR.getUTCFullYear(), enAR.getUTCMonth(), 1, DESFASE_AR_HORAS));
}
