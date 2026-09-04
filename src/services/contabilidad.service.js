import { prisma } from "../lib/prisma.js";
import { PERIODOS, bucketsPorPeriodo, etiquetaBucket } from "../lib/periodos.js";

// Contabilidad de la concesionaria: qué entró, qué salió y cuánto quedó.
//
// Un auto "ingresó" cuando se cargó (autos.created_at) y "se vendió" cuando
// tiene vendido_at. Los borrados (deleted_at) no cuentan en ninguna de las dos:
// son errores de carga, no movimientos.
//
// ── Cómo se calcula la ganancia ──
// Depende de de quién sea el auto, y son dos negocios distintos:
//
//   Propio      -> precio_venta - costo   (el margen de la reventa)
//   Consignado  -> precio_pactado * comision / 100   (solo la comisión; el auto
//                  nunca fue de la agencia, así que su precio no es ingreso)
//
// Un auto propio vendido SIN costo cargado aporta 0, no la venta entera. Contar
// una venta sin costo como ganancia pura infla el número y es la clase de error
// que se descubre tarde. `sinCosto` avisa cuántos están en esa situación.

const num = (v) => Number(v ?? 0);

// Vigente (no borrado) y efectivamente vendido.
const VENDIDO = "a.deleted_at IS NULL AND a.vendido_at IS NOT NULL";

// Ganancia por fila, resuelta en SQL para no traer todo a memoria.
// El LEFT JOIN decide la rama: si hay consignación vigente, comisión.
const SQL_GANANCIA = `
  CASE WHEN c.id IS NOT NULL
       THEN c.precio_pactado * c.comision / 100
       ELSE a.precio_venta - COALESCE(a.costo, a.precio_venta)
  END`;

// Facturación: lo que entró por caja. En consignación la agencia no factura el
// auto (no es suyo), solo la comisión.
const SQL_FACTURADO = `
  CASE WHEN c.id IS NOT NULL
       THEN c.precio_pactado * c.comision / 100
       ELSE a.precio_venta
  END`;

const JOIN_CONSIGNACION =
  "LEFT JOIN consignaciones c ON c.auto_id = a.id AND c.deleted_at IS NULL";

// Totales de ventas para un recorte temporal arbitrario.
// `where` es SQL armado acá dentro (nunca entrada del usuario).
async function totalesVendidos(where) {
  const [r] = await prisma.$queryRawUnsafe(`
    SELECT
      COUNT(*)                                   vendidos,
      COALESCE(SUM(${SQL_FACTURADO}), 0)         facturado,
      COALESCE(SUM(${SQL_GANANCIA}), 0)          ganancia,
      SUM(c.id IS NULL AND a.costo IS NULL)      sin_costo
    FROM autos a
    ${JOIN_CONSIGNACION}
    WHERE ${VENDIDO} AND ${where}`);
  return {
    vendidos: num(r.vendidos),
    facturado: num(r.facturado),
    ganancia: num(r.ganancia),
    sinCosto: num(r.sin_costo),
  };
}

async function totalIngresados(where) {
  const [r] = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) n FROM autos a WHERE a.deleted_at IS NULL AND ${where}`
  );
  return num(r.n);
}

// Serie por período: ingresos y ventas sobre el mismo eje temporal.
// Son dos columnas de fecha distintas (created_at / vendido_at), así que se
// agrupan por separado y se fusionan por la clave del bucket.
async function serie() {
  const gIng = bucketsPorPeriodo("a.created_at");
  const gVen = bucketsPorPeriodo("a.vendido_at");
  const salida = {};

  for (const p of PERIODOS) {
    const ingresos = await prisma.$queryRawUnsafe(`
      SELECT ${gIng[p].g} k, COUNT(*) n
      FROM autos a
      WHERE a.deleted_at IS NULL AND ${gIng[p].where}
      GROUP BY k ORDER BY k`);

    const ventas = await prisma.$queryRawUnsafe(`
      SELECT ${gVen[p].g} k, COUNT(*) n,
             COALESCE(SUM(${SQL_FACTURADO}), 0) facturado,
             COALESCE(SUM(${SQL_GANANCIA}), 0)  ganancia
      FROM autos a
      ${JOIN_CONSIGNACION}
      WHERE ${VENDIDO} AND ${gVen[p].where}
      GROUP BY k ORDER BY k`);

    const mapa = new Map();
    const fila = (k) =>
      mapa.get(k) ?? { periodo: etiquetaBucket(p, k), ingresados: 0, vendidos: 0, facturado: 0, ganancia: 0 };

    for (const r of ingresos) mapa.set(r.k, { ...fila(r.k), ingresados: num(r.n) });
    for (const r of ventas) {
      mapa.set(r.k, {
        ...fila(r.k),
        vendidos: num(r.n),
        facturado: num(r.facturado),
        ganancia: num(r.ganancia),
      });
    }

    salida[p] = [...mapa.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([, v]) => v);
  }
  return salida;
}

// Variación porcentual contra el período anterior. null cuando la base es 0:
// "subió infinito%" no significa nada y es peor que no mostrar el dato.
const variacion = (actual, previo) => (previo === 0 ? null : ((actual - previo) / previo) * 100);

export async function contabilidadResumen() {
  // Mes en curso vs. mes anterior completo.
  const MES_ACTUAL = (col) => `${col} >= DATE_FORMAT(CURDATE(), '%Y-%m-01')`;
  const MES_PREVIO = (col) =>
    `${col} >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-01') ` +
    `AND ${col} < DATE_FORMAT(CURDATE(), '%Y-%m-01')`;

  const [mes, mesPrevio, ingresadosMes, ingresadosPrevio, historico, ingresadosTotal, enStock] =
    await Promise.all([
      totalesVendidos(MES_ACTUAL("a.vendido_at")),
      totalesVendidos(MES_PREVIO("a.vendido_at")),
      totalIngresados(MES_ACTUAL("a.created_at")),
      totalIngresados(MES_PREVIO("a.created_at")),
      totalesVendidos("1=1"),
      totalIngresados("1=1"),
      prisma.autos.count({ where: { deleted_at: null, vendido_at: null } }),
    ]);

  return {
    mes: { ...mes, ingresados: ingresadosMes },
    comparacion: {
      vendidos: variacion(mes.vendidos, mesPrevio.vendidos),
      facturado: variacion(mes.facturado, mesPrevio.facturado),
      ganancia: variacion(mes.ganancia, mesPrevio.ganancia),
      ingresados: variacion(ingresadosMes, ingresadosPrevio),
    },
    mesPrevio: { ...mesPrevio, ingresados: ingresadosPrevio },
    historico: { ...historico, ingresados: ingresadosTotal, enStock },
    serie: await serie(),
  };
}
