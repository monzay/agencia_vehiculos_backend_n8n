import { prisma } from "../lib/prisma.js";

// Interés por vehículo: cada visita a la ficha pública /catalogo/<ref> deja una
// fila en `auto_vistas`. Es el único lugar que escribe y lee esa tabla.
//
// Mide algo DISTINTO del "top de autos más consultados" de metricas.service:
// aquel cuenta consultas por WhatsApp, este cuenta miradas a la ficha. El de la
// web siempre da mucho más alto —mirar es gratis, escribir cuesta— y por eso
// van separados en el panel.
//
// Las visitas del staff no llegan hasta acá: el controlador las descarta antes.

const VIGENTE = { deleted_at: null };

// Registra la visita. El cliente solo aporta la ref; el auto_id y la fecha los
// resuelve el servidor, así que no hay nada del visitante que termine en la DB.
// Devuelve false si la ref no existe (o el auto está borrado): no es un error
// del visitante, simplemente no se anota.
export async function registrarVista(ref) {
  const auto = await prisma.autos.findFirst({
    where: { ref, ...VIGENTE },
    select: { id: true },
  });
  if (!auto) return false;
  await prisma.auto_vistas.create({ data: { auto_id: auto.id } });
  return true;
}

// Total histórico de visitas a fichas, para el KPI del panel.
export function totalVistas() {
  return prisma.auto_vistas.count({ where: VIGENTE });
}

// Visitas de hoy. Usa CURDATE() y no un rango calculado en JS para que el
// corte del día sea el MISMO que el del resto de los KPIs del Resumen.
export async function vistasHoy() {
  const [r] = await prisma.$queryRaw`
    SELECT COUNT(*) n FROM auto_vistas
    WHERE deleted_at IS NULL AND DATE(created_at) = CURDATE()`;
  return Number(r.n);
}

// Visitas agrupadas por el bucket temporal que le pasen. `grupo` y `where` los
// arma metricas.service con los mismos tramos que usa para clientes y
// consultas: así las tres series caen sobre el mismo eje.
export function vistasPorBucket(grupo, where) {
  return prisma.$queryRawUnsafe(
    `SELECT ${grupo} k, COUNT(*) n FROM auto_vistas ` +
      `WHERE deleted_at IS NULL AND ${where} GROUP BY k ORDER BY k`
  );
}

// Ranking de los vehículos más vistos en la web.
// `groupBy` + lookup de nombres: la marca y el modelo se leen de `autos` en el
// momento, nunca se copian en `auto_vistas`, así el ranking sigue al vehículo
// si lo editan.
export async function topVehiculosVistos(limite = 5) {
  const grupos = await prisma.auto_vistas.groupBy({
    by: ["auto_id"],
    where: VIGENTE,
    _count: { _all: true },
    orderBy: { _count: { auto_id: "desc" } },
    take: limite,
  });
  if (grupos.length === 0) return [];

  const autos = await prisma.autos.findMany({
    where: { id: { in: grupos.map((g) => g.auto_id) }, ...VIGENTE },
    select: { id: true, marca: true, modelo: true },
  });
  const porId = new Map(autos.map((a) => [a.id, `${a.marca} ${a.modelo}`]));

  // Un auto borrado queda fuera del mapa: se descarta en vez de mostrarse sin
  // nombre.
  return grupos
    .filter((g) => porId.has(g.auto_id))
    .map((g) => ({ nombre: porId.get(g.auto_id), total: g._count._all }));
}
