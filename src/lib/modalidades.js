// Cómo entra o sale un vehículo de la agencia. Los valores son los del ENUM
// `consignacion_ingresos.modalidad`.
//
// La consignación usa `consignacion_contratos`; las demás, un boleto en
// `compraventa_contratos`:
//   - compra:  la agencia le compra el auto al cliente.
//   - permuta: parte de pago. La agencia vende un auto de su stock y el cliente
//              puede entregar un usado a cuenta (opcional). Se puede financiar.
//   - contado: la agencia vende un auto de su stock y el cliente lo paga.
export const MODALIDADES = ["consignacion", "compra", "permuta", "contado"];

export const esCompraventa = (modalidad) => ["compra", "permuta", "contado"].includes(modalidad);

// La agencia vende un auto propio: el boleto lleva `auto_entregado_*`.
export const vendeLaAgencia = (modalidad) => modalidad === "permuta" || modalidad === "contado";

// Si el trámite recibe un vehículo del cliente (y por eso lleva papeles, título
// y recibos). En la parte de pago depende de si el cliente entregó un usado.
export function conUsado(ingreso) {
  if (ingreso.modalidad === "contado") return false;
  if (ingreso.modalidad === "permuta") return Number(ingreso.parte_pago_valor ?? 0) > 0 || Boolean(ingreso.parte_pago_vehiculo);
  return true;
}
