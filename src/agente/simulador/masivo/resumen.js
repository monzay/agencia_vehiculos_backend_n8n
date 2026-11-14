// Resumen del reporte masivo (tarea 10 de huecos-del-bot): totales, cobertura por eje y criterio de cierre.
import { EJES } from "./generar.js";

export function resumir(resultados) {
  const cobertura = Object.fromEntries(Object.entries(EJES).map(([eje, valores]) => [eje, Object.fromEntries(valores.map((v) => [v, 0]))]));
  const fallas = [];
  let ok = 0;
  for (const { caso, ok: bien, fallas: lista = [], error } of resultados) {
    for (const eje of Object.keys(EJES)) {
      const valor = caso.ejes?.[eje];
      if (cobertura[eje][valor] !== undefined) cobertura[eje][valor] += 1;
    }
    if (bien) ok += 1;
    else fallas.push({ id: caso.id, ejes: caso.ejes, fallas: error ? [...lista, `error: ${error}`] : [...lista] });
  }
  return { total: resultados.length, ok, fallidos: resultados.length - ok, cobertura, fallas };
}

// Más de 1000 casos, cada valor de cada eje cubierto, ninguno fallido y ningún intento de salir a la red.
export function cumpleCriterio(resumen, { intentosDeRed } = {}) {
  if (!(resumen.total > 1000) || resumen.fallidos !== 0 || intentosDeRed !== 0) return false;
  return Object.entries(EJES).every(([eje, valores]) => valores.every((v) => resumen.cobertura?.[eje]?.[v] > 0));
}
