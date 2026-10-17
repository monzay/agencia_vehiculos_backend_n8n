// Cuánto cuesta lo que manda el bot por WhatsApp. Meta (desde el 01/10/2026)
// cobra cada mensaje entregado, salvo los primeros 1.000 del mes por número;
// las reacciones son gratis y no cuentan. Tarifa de Argentina: revisarla cada
// trimestre (Meta puede cambiarla el día 1 de enero, abril, julio y octubre).

export const MENSAJES_GRATIS_MES = 1000;
export const PRECIO_MENSAJE_USD = 0.026;

const redondear = (valor) => Math.round(valor * 100) / 100;

export function estadoWhatsApp({ enviados } = {}) {
  const total = Math.max(0, Number(enviados) || 0);
  const gratisUsados = Math.min(total, MENSAJES_GRATIS_MES);
  const cobrados = total - gratisUsados;
  return {
    enviados: total,
    gratisMes: MENSAJES_GRATIS_MES,
    gratisUsados,
    gratisRestantes: MENSAJES_GRATIS_MES - gratisUsados,
    cobrados,
    precioUsd: PRECIO_MENSAJE_USD,
    costoEstimadoUsd: redondear(cobrados * PRECIO_MENSAJE_USD),
    porcentajeGratis: Math.round((gratisUsados / MENSAJES_GRATIS_MES) * 100),
  };
}
