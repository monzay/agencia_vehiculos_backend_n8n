import { error } from "../lib/contrato-campos.js";
import { senaReservando } from "../lib/senas.js";

// El auto que vende la agencia en un trámite (parte de pago o venta al
// contado). Se elige al crear el trámite y el boleto lo usa. Tiene que ser de
// la agencia, estar a la venta y no estar tomado por otra operación: se vende
// una sola vez.

const VIGENTE = { deleted_at: null };

// `ingresoId`: el trámite que lo elige (null al crearlo). Lo que ya está atado a
// ese mismo trámite (su boleto, su seña) no cuenta como "tomado".
export async function autoParaVender(ref, ingresoId, tx) {
  const auto = await tx.autos.findFirst({
    where: { ref: String(ref ?? ""), ...VIGENTE },
    select: {
      id: true,
      vendido_at: true,
      dominio: true,
      motor: true,
      chasis: true,
      consignaciones: { where: VIGENTE, select: { id: true }, take: 1 },
    },
  });
  if (!auto) throw error("Elegí el vehículo que compra el cliente.");
  if (auto.vendido_at) throw error("Ese vehículo ya figura como vendido.", 409);
  // Un auto en consignación es de un tercero: la agencia no lo puede dar.
  if (auto.consignaciones.length) throw error("Ese vehículo está en consignación: no es de la agencia.", 409);

  const otroTramite = ingresoId ? { not: ingresoId } : undefined;
  const comprometido = await tx.compraventa_contratos.findFirst({
    where: { auto_entregado_id: auto.id, ...VIGENTE, ingreso_id: otroTramite, consignacion_ingresos: VIGENTE },
    select: { id: true },
  });
  const enOtroTramite = await tx.consignacion_ingresos.findFirst({
    where: { auto_interes_id: auto.id, ...VIGENTE, id: otroTramite, estado: { not: "vendido" } },
    select: { id: true },
  });
  if (comprometido || enOtroTramite) throw error("Ese vehículo ya está en otro trámite abierto.", 409);

  // Reservado por la seña de otro cliente. La seña de este mismo trámite no cuenta.
  const senado = await tx.senas.findFirst({
    where: {
      auto_id: auto.id,
      AND: [senaReservando(), ingresoId ? { OR: [{ ingreso_id: null }, { ingreso_id: { not: ingresoId } }] } : {}],
    },
    select: { id: true },
  });
  if (senado) throw error("Ese vehículo está señado por otro cliente.", 409);
  return auto;
}
