// Los pasos de un trámite y cuál sigue, para la tira de Seguimiento del legajo.
//
// No se guarda ningún estado: cada paso se deduce de los datos del legajo, así la
// tira nunca dice algo distinto que el boleto. `accion` es lo que abre el panel al
// tocar el paso; las reglas de cada acción siguen en su servicio.
//
// `tramite` es el ingreso ya mapeado con su detalle.

const paso = (id, label, hecho, accion, extra = {}) => ({ id, label, hecho: Boolean(hecho), accion, ...extra });

const papelesDelUsado = (t) => paso("papeles", "Papeles", t.vehiculo?.dominio, "papeles");

const quedaSaldo = ({ contrato }) => contrato?.pago?.pagador === "cliente" && contrato.pago.saldo > 0;

// Sin boleto todavía no se sabe. Con financiación se cobra lo que paga en el acto, y
// el resto son cuotas. Lo que ya se marcó se sigue viendo, aunque el boleto cambie.
function hayQueCobrar({ contrato, financiacion, hitos }) {
  if (hitos?.cobrado || !contrato) return true;
  const { pagador, monto, enActo } = contrato.pago ?? {};
  return pagador === "cliente" && (financiacion ? enActo : monto) > 0;
}

// Entregado va antes que Transferido para sugerirlo, pero se puede marcar en cualquier orden.
function pasosDeCierre(t, vendido) {
  const hito = (id, label) => paso(id, label, t.hitos?.[id], vendido ? id : null);
  return [
    ...(hayQueCobrar(t) ? [hito("cobrado", "Cobrado")] : []),
    hito("entregado", "Entregado"),
    hito("transferido", "Transferido"),
  ];
}

function pasosDeVenta(t) {
  const vendido = t.estado === "vendido" || t.contrato?.permuta?.vendido;
  return [
    ...(t.sena ? [paso("sena", "Seña", true, null)] : []),
    ...(t.conUsado ? [papelesDelUsado(t)] : []),
    paso("boleto", "Boleto cargado", t.contrato, "cargar_contrato"),
    paso("firma", "Boleto firmado", t.contrato?.firmado, "firmar"),
    // Es solo de la parte de pago, y opcional: el saldo también se puede pagar en una fecha.
    ...(t.modalidad === "permuta" && quedaSaldo(t) ? [paso("financiacion", "Financiación", t.financiacion, "financiar", { opcional: true })] : []),
    paso("vendido", "Vendido", vendido, "vender"),
    ...pasosDeCierre(t, vendido),
  ];
}

// La compra sigue hasta vender el usado. Se publica desde Preparación, y se vende con
// otro trámite: por eso Vendido no abre nada desde acá.
function pasosDeCompra(t) {
  const etapa = t.preparacion?.etapa;
  return [
    papelesDelUsado(t),
    paso("boleto", "Boleto cargado", t.contrato, "cargar_contrato"),
    paso("firma", "Boleto firmado", t.contrato?.firmado, "firmar"),
    paso("publicado", "Publicado en la web", ["publicado", "vendido"].includes(etapa), t.preparacion ? "preparacion" : null),
    paso("vendido", "Vendido", etapa === "vendido" || t.estado === "vendido", null),
  ];
}

function pasosDeConsignacion(t) {
  const firmado = t.contrato?.firmado;
  const inicio = [
    // Un contrato firmado ya pasó por los requisitos, aunque después cambie algún dato.
    paso("papeles", "Papeles y datos", t.requisitosContrato?.habilitado || firmado, "ver_contrato"),
    paso("contrato", "Contrato cargado", t.contrato, "cargar_contrato"),
    paso("firma", "Contrato firmado", firmado, "firmar"),
  ];
  if (t.estado === "retirado") return [...inicio, paso("retirado", "Retirado por el dueño", true, null)];
  return [
    ...inicio,
    paso("publicado", "Publicado", ["publicado", "vendido"].includes(t.estado), "publicar"),
    paso("vendido", "Vendido", t.estado === "vendido", "vender_consignacion"),
  ];
}

const PASOS_POR_MODALIDAD = {
  contado: pasosDeVenta,
  permuta: pasosDeVenta,
  compra: pasosDeCompra,
  consignacion: pasosDeConsignacion,
};

/**
 * @returns {{ pasos: { id: string, label: string, hecho: boolean, accion: string|null, opcional?: boolean }[], proximo: string|null }}
 */
export function seguimientoTramite(tramite) {
  const pasos = PASOS_POR_MODALIDAD[tramite.modalidad](tramite);
  return { pasos, proximo: pasos.find((p) => !p.hecho && !p.opcional)?.id ?? null };
}
