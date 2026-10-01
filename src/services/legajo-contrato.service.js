import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { CATALOGO } from "../lib/documentos-catalogo.js";
import { error } from "../lib/contrato-campos.js";
import { mapIngreso } from "../mappers/ingreso.mapper.js";

// Lo que comparten todos los contratos del legajo (consignación, compra,
// permuta): la copia congelada que se imprime, y firmar y desfirmar.
//
// Mientras no esté firmado, un contrato se edita todo lo que haga falta.
// Firmado, se congela: si cambian las condiciones, se desfirma y se vuelve a
// imprimir, y así el papel del cliente y el sistema nunca dicen cosas distintas.

const datosAgencia = () => prisma.ubicacion.findFirst({ select: { nombre: true, direccion: true } });

// El vehículo del ingreso sale del título. Sin título, el contrato y los
// recibos no tienen qué auto nombrar.
export function exigirVehiculo(ingreso) {
  if (!ingreso.dominio) throw error("Cargá el título del automotor: el contrato necesita los datos del vehículo.", 409);
}

// La copia congelada: todo lo que hace falta para reimprimir el contrato y sus
// recibos sin volver a consultar ninguna tabla. `ingreso` viene con el titular,
// los papeles y el contrato de su modalidad incluidos.
export async function snapshotDelLegajo(ingreso) {
  const detalle = mapIngreso(ingreso, { conDetalle: true });
  const agencia = await datosAgencia();

  return {
    version: 1,
    generado: new Date().toISOString(),
    modalidad: detalle.modalidad,
    agencia: agencia ? { nombre: agencia.nombre, direccion: agencia.direccion } : null,
    titular: detalle.titular,
    vehiculo: detalle.vehiculo,
    condiciones: detalle.contrato,
    // El recibo de documentación entregada: SOLO los papeles que la agencia
    // recibió de verdad. Un documento escaneado cuyo original nunca llegó no va
    // en un recibo — el recibo es la prueba de que el cliente entregó algo, y
    // firmarlo por algo que no está es el problema que esto evita.
    papelesEntregados: detalle.documentos
      .filter((d) => d.tenencia !== "no_recibido")
      .map((d) => ({
        tipo: d.tipo,
        label: CATALOGO[d.tipo]?.label ?? d.tipo,
        tenencia: d.tenencia, // copia | original
        ubicacionFisica: d.ubicacionFisica,
        fechaVencimiento: d.fechaVencimiento,
        imagenes: d.imagenes.length,
      })),
    // Lo que está escaneado pero cuyo papel no está en la agencia. No entra en
    // el recibo; se imprime aparte como lo que todavía falta traer.
    papelesPendientes: detalle.documentos
      .filter((d) => d.tenencia === "no_recibido")
      .map((d) => ({ tipo: d.tipo, label: CATALOGO[d.tipo]?.label ?? d.tipo })),
    recepcion: {
      kmRecepcion: detalle.vehiculo.kmRecepcion,
      estadoUnidad: detalle.contrato?.estadoUnidad ?? null,
      recibidoPor: detalle.recibidoPor,
      recibido: detalle.recibido,
    },
  };
}

// Lo que se imprime. Antes de firmar se arma en vivo; después sale del snapshot,
// que es la copia exacta de lo que el cliente tiene en la mano.
export async function impresosDe(ingreso, contrato) {
  if (!contrato) throw error("Todavía no hay condiciones cargadas para este ingreso.", 409);
  exigirVehiculo(ingreso);
  if (contrato.firmado_at) return contrato.contrato_json;
  return snapshotDelLegajo(ingreso);
}

// `tabla` es el delegate de Prisma del contrato (consignacion_contratos o
// compraventa_contratos): las dos tablas guardan la firma igual.
export async function firmar(tabla, ingreso, contrato) {
  if (!contrato) throw error("Cargá las condiciones antes de firmar.", 409);
  if (contrato.firmado_at) throw error("El contrato ya está firmado.", 409);
  exigirVehiculo(ingreso);

  const firmadoAt = new Date();
  const congelado = { ...(await snapshotDelLegajo(ingreso)), firmado: firmadoAt.toISOString() };
  return tabla.update({ where: { id: contrato.id }, data: { firmado_at: firmadoAt, contrato_json: congelado } });
}

// Desfirmar borra el congelado: un contrato sin firma no tiene copia que
// preservar, y la base exige que firma y snapshot vayan juntos.
//
// `Prisma.DbNull` y no `null`: en una columna JSON, `null` guarda el VALOR json
// `null`, que para SQL no es NULL y hace saltar el CHECK.
export async function desfirmar(tabla, contrato) {
  if (!contrato?.firmado_at) throw error("Ese contrato no está firmado.", 409);
  return tabla.update({ where: { id: contrato.id }, data: { firmado_at: null, contrato_json: Prisma.DbNull } });
}
