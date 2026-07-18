// Traduce una fila `promociones` de la DB al shape que consume el front.
//
// Una promo es simple: un nombre, una descripcion, condiciones opcionales y,
// si se quiere, un descuento. El descuento puede ser un porcentaje (%) o un
// monto fijo en $ (lo define `descuento_tipo`).

// Etiqueta y unidad segun el tipo de descuento.
export const DESCUENTO_TIPOS = {
  porcentaje: { label: "Porcentaje", unidad: "%" },
  monto: { label: "Monto fijo", unidad: "$" },
};

export const DESCUENTO_TIPOS_VALIDOS = Object.keys(DESCUENTO_TIPOS);

// Una promo esta "vencida" si tiene fecha_fin y ya pasó.
export function estaVencida(p, ahora = new Date()) {
  return Boolean(p.fecha_fin && new Date(p.fecha_fin) < ahora);
}

export function mapPromocion(p) {
  return {
    id: p.id,
    nombre: p.nombre,
    descripcion: p.descripcion ?? "",
    descuento: p.descuento != null ? Number(p.descuento) : null,
    descuento_tipo: p.descuento_tipo ?? null, // "porcentaje" | "monto" | null
    fecha_fin: p.fecha_fin ? new Date(p.fecha_fin).toISOString() : null,
    vencida: estaVencida(p),
    creado: p.created_at ? new Date(p.created_at).toISOString() : null,
  };
}

// Para el catalogo: dado el array de relaciones auto_promociones (con la promo incluida),
// devuelve solo las promociones no borradas y NO vencidas, ya mapeadas.
export function mapPromosDeAuto(autoPromos) {
  if (!Array.isArray(autoPromos)) return [];
  return autoPromos
    .map((ap) => ap.promociones)
    .filter((p) => p && !p.deleted_at && !estaVencida(p))
    .map(mapPromocion);
}
