import { prisma } from "../lib/prisma.js";
import { sqlSesionUtil } from "../lib/consultas-utiles.js";
import { fechaAR } from "./avisos-cuotas.service.js";

// Novedades por sección: cuántas cosas nuevas hay desde la última vez que ESTE
// usuario la revisó. Cada sección lleva su propia marca en `usuarios`, porque el
// usuario puede revisar una y no la otra.
//
// La comparación se hace en SQL para respetar la hora local con la que el bot
// guarda las fechas.

// El nombre de la columna NUNCA viene del request: se resuelve por este mapa.
// `contar` recibe la columna ya validada.
const SECCIONES = {
  // Una consulta nueva = una sesión útil (las vacías no cuentan; ver consultas-utiles).
  // Las de venta/consignación se excluyen: la lista de Consultas no las muestra
  // (tienen su propia sección) y las cuenta el badge `ventas`.
  consultas: {
    columna: "consultas_visto_at",
    contar: (col) =>
      `SELECT COUNT(*) AS n
         FROM sesiones s
         JOIN usuarios u ON u.id = ?
        WHERE ${sqlSesionUtil("s")}
          AND (s.tipo_lead IS NULL OR s.tipo_lead <> 'venta')
          AND (u.${col} IS NULL OR s.sesion_inicio > u.${col})`,
  },
  // La sección "Vender / Consignación" lista una consulta por SESIÓN: se cuentan
  // las sesiones de venta/consignación nuevas, así el badge coincide con las filas.
  // Solo las completas (paso 'handoff'), igual que la lista.
  ventas: {
    columna: "ventas_visto_at",
    contar: (col) =>
      `SELECT COUNT(*) AS n
         FROM sesiones s
         JOIN usuarios u ON u.id = ?
        WHERE s.tipo_lead = 'venta'
          AND s.paso_actual = 'handoff'
          AND (u.${col} IS NULL OR s.sesion_inicio > u.${col})`,
  },
  // Un cliente nuevo = su PRIMERA consulta útil llegó después de la última
  // revisión (los "hola" sueltos sin consulta real no cuentan hasta que la hagan).
  // Coincide con la sección Clientes, que muestra compradores y vendedores.
  clientes: {
    columna: "clientes_visto_at",
    contar: (col) =>
      `SELECT COUNT(*) AS n
         FROM usuarios u
         JOIN (SELECT s.cliente_id, MIN(s.sesion_inicio) AS primera
                 FROM sesiones s
                WHERE ${sqlSesionUtil("s")}
                GROUP BY s.cliente_id) t
        WHERE u.id = ?
          AND (u.${col} IS NULL OR t.primera > u.${col})`,
  },
  // Descuentos/promos recién vencidos: los que ya pasaron su `fecha_fin` desde la
  // última vez que el usuario abrió la sección (mismo "nuevas desde…" que consultas).
  descuentos: {
    columna: "descuentos_visto_at",
    contar: (col) =>
      `SELECT (
         (SELECT COUNT(*) FROM descuentos d
            WHERE d.deleted_at IS NULL AND d.activo = 1
              AND d.fecha_fin IS NOT NULL AND d.fecha_fin <= NOW()
              AND (u.${col} IS NULL OR d.fecha_fin > u.${col}))
         + (SELECT COUNT(*) FROM promociones p
            WHERE p.deleted_at IS NULL AND p.activo = 1
              AND p.fecha_fin IS NOT NULL AND p.fecha_fin <= NOW()
              AND (u.${col} IS NULL OR p.fecha_fin > u.${col}))
       ) AS n
       FROM usuarios u WHERE u.id = ?`,
  },
  // Financiación: clientes con una cuota que vence HOY y sigue pendiente, más los
  // avisos de clientes sin atender (respuestas a recordatorios, bajas). Lo de los
  // vencimientos es una condición del día: se muestra hasta que el usuario abre la
  // sección hoy y reaparece al día siguiente. Los avisos quedan hasta que se atienden.
  // Un día de pago 29-31 en un mes más corto vence el último día del mes.
  financiacion: {
    columna: "financiacion_visto_at",
    contar: (col) =>
      `SELECT (
         (SELECT COUNT(*) FROM financiaciones f
            WHERE f.activo = 1 AND f.deleted_at IS NULL
              AND LEAST(f.dia_pago, DAY(LAST_DAY(?))) = DAY(?)
              AND (f.cantidad_cuotas - (SELECT COUNT(*) FROM financiacion_pagos pp WHERE pp.financiacion_id = f.id)) > 0
              AND (u.${col} IS NULL OR DATE(u.${col}) < CURDATE()))
         + (SELECT COUNT(*) FROM financiacion_alertas a WHERE a.atendida_at IS NULL)
       ) AS n
       FROM usuarios u WHERE u.id = ?`,
    // El día del vencimiento es el de Argentina (la base de producción corre en UTC).
    parametros: (usuarioId, ahora = new Date()) => [fechaAR(ahora), fechaAR(ahora), usuarioId],
  },
};

export const esSeccionValida = (seccion) => Object.hasOwn(SECCIONES, seccion);

// Marca de última revisión del usuario (ISO, o null si nunca revisó).
async function leerVistoAt(usuarioId, columna) {
  const filas = await prisma.$queryRawUnsafe(
    `SELECT ${columna} AS visto FROM usuarios WHERE id = ?`,
    Number(usuarioId)
  );
  const visto = filas?.[0]?.visto ?? null;
  return visto ? new Date(visto).toISOString() : null;
}

export async function contarNuevos(seccion, usuarioId) {
  const { columna, contar, parametros = (id) => [id] } = SECCIONES[seccion];
  const filas = await prisma.$queryRawUnsafe(contar(columna), ...parametros(Number(usuarioId)));
  return { nuevas: Number(filas?.[0]?.n ?? 0), vistoAt: await leerVistoAt(usuarioId, columna) };
}

// Marca "ahora" como la última revisión (resetea el contador). NOW() de MySQL
// para ser consistente con el resto de las fechas que guarda el bot.
export async function marcarVisto(seccion, usuarioId) {
  const { columna } = SECCIONES[seccion];
  await prisma.$executeRawUnsafe(
    `UPDATE usuarios SET ${columna} = NOW() WHERE id = ?`,
    Number(usuarioId)
  );
  return { nuevas: 0, vistoAt: await leerVistoAt(usuarioId, columna) };
}
