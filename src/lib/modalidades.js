// Cómo entra un vehículo a la agencia. Los valores son los del ENUM
// `consignacion_ingresos.modalidad`.
//
// La toma (titular, papeles, tenencia, imágenes) es la misma para las tres. El
// contrato no: la consignación usa `consignacion_contratos`; la compra y la
// permuta, `compraventa_contratos`.
export const MODALIDADES = ["consignacion", "compra", "permuta"];

export const esCompraventa = (modalidad) => modalidad === "compra" || modalidad === "permuta";
