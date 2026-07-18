import { prisma } from "../lib/prisma.js";
import { clasificarUrl, extraerCoordenadas, resolverLinkCorto } from "../lib/maps-url.js";

// Ubicación de la agencia: una sola fila (id = 1). La edita el admin desde
// Configuración y la usa el bot para responder dónde queda.
//
// La forma esperada de cargarla es pegando el link de Google Maps: de ahí se
// extraen latitud y longitud. Las coordenadas explícitas, si vienen, ganan.

const LIMITES = { nombre: 120, direccion: 200, mapsUrl: 500 };

class DatosInvalidos extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = "DatosInvalidos";
    this.status = 400;
  }
}

// Recorta y normaliza espacios. Los campos de texto nunca llegan crudos a la base.
const limpiar = (valor, max) => String(valor ?? "").trim().replace(/\s+/g, " ").slice(0, max);

// Coordenada: acepta número, string numérica, o vacío/null (= sin cargar).
// Se valida el rango acá, además del CHECK de la base.
function coordenada(valor, campo, tope) {
  if (valor === null || valor === undefined || String(valor).trim() === "") return null;
  const n = Number(valor);
  if (!Number.isFinite(n)) throw new DatosInvalidos(`${campo} debe ser un número.`);
  if (n < -tope || n > tope) throw new DatosInvalidos(`${campo} debe estar entre ${-tope} y ${tope}.`);
  return n;
}

// Del link de Maps saca { mapsUrl, coords }. El link corto (el del botón
// "Compartir") no trae coordenadas: hay que seguir su redirect.
async function desdeLink(texto) {
  const url = String(texto ?? "").trim();
  if (!url) return { mapsUrl: null, coords: null };

  const { tipo, url: normalizada } = clasificarUrl(url);
  if (tipo === "invalido") {
    throw new DatosInvalidos("El link tiene que ser de Google Maps (google.com/maps o maps.app.goo.gl).");
  }

  if (tipo === "largo") {
    return { mapsUrl: normalizada.slice(0, LIMITES.mapsUrl), coords: extraerCoordenadas(normalizada) };
  }

  // Link corto: se resuelve siguiendo el redirect. Si falla (sin red, o Google
  // cambió el formato), se pide la URL completa en vez de guardar algo incompleto.
  let largo = null;
  try {
    largo = await resolverLinkCorto(normalizada);
  } catch {
    largo = null;
  }
  if (!largo) {
    throw new DatosInvalidos(
      "No pude leer ese link corto. Abrilo en el navegador y pegá la URL completa (la que empieza con google.com/maps)."
    );
  }
  return { mapsUrl: largo.slice(0, LIMITES.mapsUrl), coords: extraerCoordenadas(largo) };
}

const mapear = (u) => ({
  nombre: u.nombre,
  direccion: u.direccion,
  mapsUrl: u.maps_url ?? null,
  latitud: u.latitud != null ? Number(u.latitud) : null,
  longitud: u.longitud != null ? Number(u.longitud) : null,
  // Sin coordenadas el bot no puede mandar el pin de mapa por WhatsApp.
  tieneCoordenadas: u.latitud != null && u.longitud != null,
  actualizado: u.updated_at ? new Date(u.updated_at).toISOString() : null,
});

export async function obtenerUbicacion() {
  const u = await prisma.ubicacion.findUnique({ where: { id: 1 } });
  return u ? mapear(u) : null;
}

// Reemplaza la ubicación completa. Nombre y dirección son obligatorios; el link
// y las coordenadas son opcionales, pero las coordenadas van de a pares.
export async function guardarUbicacion(datos = {}) {
  const nombre = limpiar(datos.nombre, LIMITES.nombre);
  const direccion = limpiar(datos.direccion, LIMITES.direccion);
  if (!nombre) throw new DatosInvalidos("El nombre de la agencia es obligatorio.");
  if (!direccion) throw new DatosInvalidos("La dirección es obligatoria.");

  const { mapsUrl, coords } = await desdeLink(datos.mapsUrl);

  // Lo que el admin escribió a mano pisa lo que dice el link.
  const latManual = coordenada(datos.latitud, "La latitud", 90);
  const lngManual = coordenada(datos.longitud, "La longitud", 180);
  if ((latManual === null) !== (lngManual === null)) {
    throw new DatosInvalidos("Cargá latitud y longitud juntas, o ninguna de las dos.");
  }

  const latitud = latManual ?? coords?.latitud ?? null;
  const longitud = lngManual ?? coords?.longitud ?? null;

  if (mapsUrl && latitud === null) {
    throw new DatosInvalidos("Ese link no tiene coordenadas. Usá el link del lugar, no el de una búsqueda.");
  }

  const u = await prisma.ubicacion.upsert({
    where: { id: 1 },
    update: { nombre, direccion, maps_url: mapsUrl, latitud, longitud },
    create: { id: 1, nombre, direccion, maps_url: mapsUrl, latitud, longitud },
  });
  return mapear(u);
}
