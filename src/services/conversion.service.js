import { prisma } from "../lib/prisma.js";

// Cuántas consultas de compra avanzaron (trámite o seña) y cuántas terminaron en venta,
// en total y por asesor. Cuenta desde el 03/11/2026: antes la consulta no recordaba qué
// nació de ella.

const VIGENTE = { deleted_at: null };
// Medianoche del 03/11/2026 en Argentina (UTC-3).
const DESDE_VINCULO = new Date("2026-11-03T03:00:00Z");
const SIN_ASIGNAR = "Sin asignar";

const avanzo = ({ tramites, senas }) => tramites.length > 0 || senas.length > 0;
// Una seña convertida sin trámite es la de un consignado que ya se vendió.
const vendio = ({ tramites, senas }) =>
  tramites.some((t) => t.estado === "vendido") || senas.some((s) => s.estado === "convertida" && !s.ingreso_id);

const vacio = () => ({ consultas: 0, avanzaron: 0, vendieron: 0 });
const sumar = (cuenta, consulta) => ({
  consultas: cuenta.consultas + 1,
  avanzaron: cuenta.avanzaron + (avanzo(consulta) ? 1 : 0),
  vendieron: cuenta.vendieron + (vendio(consulta) ? 1 : 0),
});

/**
 * @returns {Promise<{ total: object, porAsesor: { asesor: string, consultas: number, avanzaron: number, vendieron: number }[] }>}
 */
export async function conversionPorAsesor(db = prisma) {
  const [consultas, vendedores] = await Promise.all([
    db.chat_estado.findMany({
      where: { sesion_inicio: { gte: DESDE_VINCULO }, OR: [{ tipo_lead: null }, { tipo_lead: { not: "venta" } }] },
      select: {
        vendedor_id: true,
        tramites: { where: VIGENTE, select: { estado: true } },
        senas: { where: { ...VIGENTE, estado: { in: ["vigente", "convertida"] } }, select: { estado: true, ingreso_id: true } },
      },
    }),
    db.vendedores.findMany({ select: { id: true, nombre: true } }),
  ]);

  const nombres = new Map(vendedores.map((v) => [v.id, v.nombre]));
  const porNombre = consultas.reduce((acc, c) => {
    const asesor = nombres.get(c.vendedor_id) ?? SIN_ASIGNAR;
    return { ...acc, [asesor]: sumar(acc[asesor] ?? vacio(), c) };
  }, {});

  return {
    total: consultas.reduce(sumar, vacio()),
    porAsesor: Object.entries(porNombre)
      .map(([asesor, cuenta]) => ({ asesor, ...cuenta }))
      .sort((a, b) => b.consultas - a.consultas),
  };
}
