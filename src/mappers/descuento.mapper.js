// Traduce una fila `descuentos` de la DB al shape que consume el front.
//
// La DB guarda:
//   - tipo (enum): "porcentaje" | "monto"
//   - valor (decimal): si es porcentaje => 0..100 ; si es monto => importe fijo
//   - fecha_fin (datetime|null): cuando vence el descuento. null = sin vencimiento.
//
// El front recibe:
//   { id, nombre, tipo, valor, fecha_fin, vigente }

// Un descuento esta vigente si no esta vencido (fecha_fin null o futura).
export function esVigente(d, ahora = new Date()) {
  if (!d) return false;
  if (!d.fecha_fin) return true;
  return new Date(d.fecha_fin) >= ahora;
}

export function mapDescuento(d) {
  return {
    id: d.id,
    nombre: d.nombre,
    tipo: d.tipo, // "porcentaje" | "monto"
    valor: d.valor != null ? Number(d.valor) : 0,
    fecha_fin: d.fecha_fin ? new Date(d.fecha_fin).toISOString() : null,
    creado: d.created_at ? new Date(d.created_at).toISOString() : null,
    vigente: esVigente(d), // false = vencido (ya no se aplica)
  };
}

// Calcula el precio final de un auto aplicando su descuento (si esta vigente).
// Un descuento vencido (fecha_fin pasada) NO se aplica.
// Devuelve { precio, descuento, precio_final, ahorro }.
export function aplicarDescuento(precio, descuento) {
  const base = Number(precio) || 0;
  if (!descuento || !esVigente(descuento)) {
    return { precio: base, descuento: null, precio_final: base, ahorro: 0 };
  }

  const valor = Number(descuento.valor) || 0;
  const ahorroBruto =
    descuento.tipo === "porcentaje" ? (base * valor) / 100 : valor;

  // El ahorro nunca puede superar el precio (no se permiten precios negativos).
  const ahorro = Math.min(Math.max(ahorroBruto, 0), base);
  const precioFinal = Math.round((base - ahorro) * 100) / 100;

  return {
    precio: base,
    descuento: mapDescuento(descuento),
    precio_final: precioFinal,
    ahorro: Math.round(ahorro * 100) / 100,
  };
}
