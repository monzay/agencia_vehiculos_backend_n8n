// Los tipos de vehículo que maneja la agencia, en las palabras que usa el
// cliente. Un valor que no es uno de estos queda como "auto".
export const TIPOS_VEHICULO = ["auto", "camioneta", "moto"];

export function normalizarTipoVehiculo(valor) {
  const tipo = String(valor ?? "").trim().toLowerCase();
  return TIPOS_VEHICULO.includes(tipo) ? tipo : "auto";
}
