import { prisma } from "../lib/prisma.js";
import { sqlSesionUtil, sqlClienteUtil } from "../lib/consultas-utiles.js";
import { topVehiculosVistos, totalVistas, vistasHoy, vistasPorBucket } from "./vistas.service.js";
import { PERIODOS, bucketsPorPeriodo, etiquetaBucket } from "../lib/periodos.js";

// Métricas del panel Resumen: totales del día, fluctuación temporal de clientes
// y consultas, y top de autos más consultados por período.
// `sesiones` (chat_estado) = consultas; `clientes` = clientes que llegaron.
// Las consultas vacías (y los clientes que solo tienen de esas) no cuentan.

const num = (v) => Number(v ?? 0);
const raw = (sql) => prisma.$queryRawUnsafe(sql);

// Serie temporal unificada por período: clientes que llegaron + consultas
// (total y por clasificación), fusionadas sobre el mismo bucket temporal.
async function fluctuacionSerie() {
  const gCli = bucketsPorPeriodo("created_at");
  const gSes = bucketsPorPeriodo("sesion_inicio");
  const gVis = bucketsPorPeriodo("created_at"); // sobre auto_vistas
  const salida = {};
  for (const p of PERIODOS) {
    const cli = await raw(
      `SELECT ${gCli[p].g} k, COUNT(*) n FROM clientes ` +
        `WHERE ${gCli[p].where} AND ${sqlClienteUtil()} GROUP BY k ORDER BY k`
    );
    const con = await raw(
      `SELECT ${gSes[p].g} k, COUNT(*) total, ` +
        `SUM(clasificacion='CALIENTE') c, SUM(clasificacion='TIBIO') t, SUM(clasificacion='FRIO') f ` +
        `FROM sesiones WHERE ${gSes[p].where} AND ${sqlSesionUtil()} GROUP BY k ORDER BY k`
    );
    const mapa = new Map();
    for (const r of con)
      mapa.set(r.k, { periodo: etiquetaBucket(p, r.k), clientes: 0, vistas: 0, consultas: num(r.total), CALIENTE: num(r.c), TIBIO: num(r.t), FRIO: num(r.f) });
    for (const r of cli) {
      const prev = mapa.get(r.k) ?? { periodo: etiquetaBucket(p, r.k), vistas: 0, consultas: 0, CALIENTE: 0, TIBIO: 0, FRIO: 0 };
      prev.clientes = num(r.n);
      mapa.set(r.k, prev);
    }
    // Visitas a fichas del catálogo: otra escala (mirar es gratis), por eso en
    // el gráfico van contra su propio eje.
    const vis = await vistasPorBucket(gVis[p].g, gVis[p].where);
    for (const r of vis) {
      const prev = mapa.get(r.k) ?? { periodo: etiquetaBucket(p, r.k), clientes: 0, consultas: 0, CALIENTE: 0, TIBIO: 0, FRIO: 0 };
      prev.vistas = num(r.n);
      mapa.set(r.k, prev);
    }
    salida[p] = [...mapa.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([, v]) => v);
  }
  return salida;
}

export async function metricasResumen() {
  // ── Hoy ──
  const [cliHoy] = await raw(
    `SELECT COUNT(*) n FROM clientes WHERE DATE(created_at)=CURDATE() AND ${sqlClienteUtil()}`
  );
  const [consHoy] = await raw(
    `SELECT COUNT(*) n FROM sesiones WHERE DATE(sesion_inicio)=CURDATE() AND ${sqlSesionUtil()}`
  );
  const [ventaHoy] = await raw("SELECT COUNT(*) n FROM sesiones WHERE DATE(sesion_inicio)=CURDATE() AND tipo_lead='venta'");
  const [ventaTot] = await raw("SELECT COUNT(*) n FROM sesiones WHERE tipo_lead='venta'");
  const clasifHoyRows = await raw(
    "SELECT clasificacion, COUNT(*) n FROM sesiones WHERE DATE(sesion_inicio)=CURDATE() AND clasificacion IS NOT NULL GROUP BY clasificacion"
  );
  const clasifHoy = { CALIENTE: 0, TIBIO: 0, FRIO: 0 };
  for (const r of clasifHoyRows) clasifHoy[r.clasificacion] = num(r.n);

  // ── Fluctuación unificada (clientes + consultas por clasificación) ──
  const fluc = await fluctuacionSerie();

  // ── Top 3 autos más consultados por período ──
  const topSQL = (dias) =>
    `SELECT a.marca, a.modelo, COUNT(*) n FROM sesiones s JOIN autos a ON a.id=s.auto_id ` +
    `WHERE s.sesion_inicio >= DATE_SUB(NOW(), INTERVAL ${dias} DAY) GROUP BY a.id, a.marca, a.modelo ORDER BY n DESC LIMIT 3`;
  const [topDia, topSemana, topMes] = await Promise.all([raw(topSQL(1)), raw(topSQL(7)), raw(topSQL(30))]);

  const fmtTop = (rows) => rows.map((r) => ({ nombre: `${r.marca} ${r.modelo}`, total: num(r.n) }));

  // ── Interés por vehículo en la WEB (visitas a la ficha) ──
  // Va aparte de `topAutos`: aquel cuenta consultas por WhatsApp, este miradas
  // a la ficha. Son señales distintas y dan números muy distintos.
  const [topVistas, vistasTotal, visitasHoy] = await Promise.all([
    topVehiculosVistos(),
    totalVistas(),
    vistasHoy(),
  ]);

  return {
    hoy: {
      clientes: num(cliHoy.n),
      consultas: num(consHoy.n),
      calientes: clasifHoy.CALIENTE,
      tibios: clasifHoy.TIBIO,
      frios: clasifHoy.FRIO,
      ventas: num(ventaHoy.n),
      vistas: visitasHoy,
    },
    ventasTotal: num(ventaTot.n),
    fluctuacion: fluc,
    topAutos: { dia: fmtTop(topDia), semana: fmtTop(topSemana), mes: fmtTop(topMes) },
    topVistas,
    vistasTotal,
  };
}
