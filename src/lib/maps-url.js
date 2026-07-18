// Extrae coordenadas de un link de Google Maps, para que el admin no tenga que
// tipear latitud y longitud a mano.

// Hosts aceptados. Sin esta lista, un link cualquiera con `?q=1,2` pasaría por
// bueno. El patrón exige que el TLD sea de 2-3 letras (opcionalmente ccTLD), así
// `google.evil.com` no matchea.
const RE_HOST_LARGO = /^(?:www\.|maps\.)?google(?:\.[a-z]{2,3}){1,2}$/;
const HOSTS_CORTOS = new Set(["maps.app.goo.gl", "goo.gl"]);

// En orden de preferencia:
//   !3d!4d  → coordenadas del LUGAR (las que queremos)
//   @lat,lng → centro del mapa: cerca, pero no es el local
//   ?q= / query= / ll= / center= → coordenadas sueltas
const PATRONES = [
  /!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/,
  /@(-?\d+\.?\d*),(-?\d+\.?\d*)/,
  /[?&](?:q|query|ll|center)=(-?\d+\.?\d*),(-?\d+\.?\d*)/,
];

const enRango = (lat, lng) => Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

function comoUrl(texto) {
  try {
    return new URL(String(texto).trim());
  } catch {
    return null;
  }
}

// 'largo' = trae las coordenadas en la URL. 'corto' = hay que seguir el redirect.
export function clasificarUrl(texto) {
  const url = comoUrl(texto);
  if (!url || !/^https?:$/.test(url.protocol)) return { tipo: "invalido" };
  if (HOSTS_CORTOS.has(url.hostname)) return { tipo: "corto", url: url.href };
  if (RE_HOST_LARGO.test(url.hostname)) return { tipo: "largo", url: url.href };
  return { tipo: "invalido" };
}

// Devuelve { latitud, longitud } o null si la URL no las contiene.
export function extraerCoordenadas(texto) {
  for (const patron of PATRONES) {
    const m = String(texto).match(patron);
    if (!m) continue;
    const latitud = Number(m[1]);
    const longitud = Number(m[2]);
    if (Number.isFinite(latitud) && Number.isFinite(longitud) && enRango(latitud, longitud)) {
      return { latitud, longitud };
    }
  }
  return null;
}

// Sigue los redirects de un link corto hasta dar con la URL larga de Maps.
// No lee el cuerpo de la respuesta y solo navega entre hosts de Google.
const MAX_SALTOS = 3;
export async function resolverLinkCorto(href, fetchImpl = fetch) {
  let actual = href;
  for (let salto = 0; salto < MAX_SALTOS; salto++) {
    const res = await fetchImpl(actual, {
      redirect: "manual",
      signal: AbortSignal.timeout(6000),
      headers: { "User-Agent": "Mozilla/5.0" }, // sin esto Google devuelve una página sin redirect
    });
    const destino = res.headers.get("location");
    if (!destino) return null;

    const siguiente = clasificarUrl(destino);
    if (siguiente.tipo === "largo") return siguiente.url;
    if (siguiente.tipo !== "corto") return null; // no seguimos fuera de Google
    actual = siguiente.url;
  }
  return null;
}
