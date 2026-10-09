// Una seña en la forma que consume el panel. El estado que se muestra puede ser
// "vencida", que no se guarda: es una vigente cuyo plazo ya pasó.

import { mapPersona } from "../services/personas.service.js";
import { vencida } from "../lib/senas.js";

const iso = (d) => (d ? new Date(d).toISOString() : null);
// `vence` es DATE: se recorta para que no se corra de día al cruzar husos.
const soloFecha = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

const autoDe = (a) =>
  a
    ? {
        ref: a.ref,
        marca: a.marca,
        modelo: a.modelo,
        anio: a.anio,
        precio: a.precio != null ? Number(a.precio) : null,
        vendido: a.vendido_at != null,
        // En consignación el auto es de un tercero: la seña no pasa a parte de pago.
        deConsignacion: (a.consignaciones ?? []).length > 0,
      }
    : null;

export function mapSena(s) {
  return {
    id: s.id,
    estado: vencida(s) ? "vencida" : s.estado, // vigente | vencida | convertida | cancelada
    monto: Number(s.monto),
    formaPago: s.forma_pago,
    senado: iso(s.senado_at),
    vence: soloFecha(s.vence),
    estadoDesde: iso(s.estado_at),
    ingresoId: s.ingreso_id ?? null,
    notas: s.notas ?? null,
    auto: autoDe(s.autos),
    cliente: mapPersona(s.clientes),
    creadoPor: s.usuarios ? { id: s.usuarios.id, nombre: s.usuarios.nombre } : null,
  };
}
