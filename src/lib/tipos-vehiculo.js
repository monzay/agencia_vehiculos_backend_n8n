// Los tipos de vehículo que maneja la agencia, en las palabras que usa el
// cliente. Camioneta incluye SUV, pick-ups y furgones. Un valor que no es uno
// de estos queda como "auto".
export const TIPOS_VEHICULO = ["auto", "camioneta", "camion", "moto"];

export function normalizarTipoVehiculo(valor) {
  // Sin tildes: "Camión" tiene que dar "camion".
  const tipo = String(valor ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return TIPOS_VEHICULO.includes(tipo) ? tipo : "auto";
}
