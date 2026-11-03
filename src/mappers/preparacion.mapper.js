import { etapaDe, requisitosPreparacion } from "../lib/requisitos-preparacion.js";
import { mapDocumento, datosVehiculo } from "./ingreso.mapper.js";

const DIA_MS = 86_400_000;
const aNumero = (d) => (d != null ? Number(d) : null);

const fotosDe = (ingreso) => (Array.isArray(ingreso.fotos_json) ? ingreso.fotos_json : []);

// `admin`: el valor de toma y el titular son datos de la agencia y de un cliente, no
// se le mandan al asesor. Publicado o vendido, los días dejan de contar.
export function mapPreparacion(p, { admin = false } = {}) {
  const { ingreso } = p;
  const vehiculo = datosVehiculo(ingreso);
  const fotos = fotosDe(ingreso);
  const etapa = etapaDe(p);
  const precioVenta = aNumero(p.precio_venta);
  const documentos = (ingreso.consignacion_documentos ?? []).map((d) => mapDocumento(d, vehiculo));

  return {
    id: p.id,
    ingresoId: ingreso.id,
    origen: ingreso.modalidad, // compra | permuta
    etapa,
    avance: p.estado, // recibido | en_preparacion | listo
    dias: ["publicado", "vendido"].includes(etapa) ? null : Math.floor((Date.now() - new Date(p.created_at).getTime()) / DIA_MS),
    vehiculo: { ...vehiculo, kms: ingreso.km_recepcion ?? null },
    precioVenta,
    descripcion: p.descripcion ?? null,
    fotos,
    requisitos: requisitosPreparacion({ documentos, fotos, precioVenta }),
    auto: p.auto && !p.auto.deleted_at ? { ref: p.auto.ref } : null,
    ...(admin && {
      valorToma: aNumero(ingreso.compraventa_contratos?.precio),
      titular: ingreso.titular ? { id: ingreso.titular.id, nombre: ingreso.titular.nombre } : null,
    }),
  };
}
