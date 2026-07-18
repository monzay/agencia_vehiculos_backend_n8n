// Qué consulta (sesión) cuenta como real y cuál es ruido.
//
// El bot abre una sesión ante el primer mensaje, así que un "hola" suelto ya
// crea una consulta. El panel las muestra como "Consulta general" y ensucian
// las métricas. Se descartan las VACÍAS: sin auto de interés, que no son lead
// de venta, sin clasificación, sin forma de pago y con score 0.
//
// La condición se escribe en positivo (la consulta es ÚTIL si cumple ALGUNA)
// en vez de negar la vacía: evita el `NOT` anidado en Prisma y el manejo de
// NULL de `tipo_lead <> 'venta'` en SQL, que descarta filas con NULL.
//
// Ojo: `clasificacion IS NOT NULL` y `auto_id IS NOT NULL` ya implican útil, así
// que las queries que filtran por eso no necesitan aplicar esto además.

// Para Prisma (modelo `chat_estado`).
export const SESION_UTIL = {
  OR: [
    { auto_id: { not: null } },
    { tipo_lead: "venta" },
    { clasificacion: { not: null } },
    { pago_tipo: { not: null } },
    { score: { gt: 0 } },
  ],
};

// Para SQL crudo. `alias` = prefijo de la tabla `sesiones` ("" si no hay alias).
export const sqlSesionUtil = (alias = "") => {
  const s = alias ? `${alias}.` : "";
  return `(${s}auto_id IS NOT NULL OR ${s}tipo_lead='venta' OR ${s}clasificacion IS NOT NULL OR ${s}pago_tipo IS NOT NULL OR ${s}score > 0)`;
};

// Un cliente cuenta si tiene al menos una consulta útil. `alias` = tabla `clientes`.
export const sqlClienteUtil = (alias = "clientes") =>
  `EXISTS (SELECT 1 FROM sesiones s WHERE s.cliente_id=${alias}.id AND ${sqlSesionUtil("s")})`;
