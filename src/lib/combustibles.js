import { error } from "./contrato-campos.js";

// Los combustibles que maneja la agencia. `nafta_gnc` es un auto que anda con
// los dos. Los mismos valores que muestra el front (lib/combustibles.js).
export const COMBUSTIBLES = ["nafta", "gnc", "nafta_gnc", "diesel"];

// Vacío es "sin especificar". Otro valor se rechaza: guardado, ninguna pantalla
// sabría mostrarlo.
export function normalizarCombustible(valor) {
  const combustible = String(valor ?? "").trim().toLowerCase();
  if (!combustible) return null;
  if (!COMBUSTIBLES.includes(combustible)) throw error("El combustible no es válido.");
  return combustible;
}
