// Buckets temporales para las series del panel (Resumen y Contabilidad).
//
// Vive acá y no dentro de un service porque las dos secciones tienen que
// agrupar por los MISMOS tramos: si Resumen y Contabilidad definieran cada una
// su "mes", dos gráficos del mismo dato dejarían de coincidir.

export const PERIODOS = ["dia", "semana", "mes", "anio"];

// Etiqueta corta (dd/mm) para los ejes.
// Se formatea en UTC: MySQL devuelve DATE() como medianoche UTC, y así la
// etiqueta coincide con el día que agrupan los KPIs (DATE(...)=CURDATE()).
export function ddmm(fecha) {
  if (!fecha) return "";
  return new Date(fecha).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
}

// Agrupamiento + recorte temporal por período. `col` = columna de fecha.
// La clave del bucket es un string estable, para poder fusionar series
// distintas sobre el mismo eje.
export const bucketsPorPeriodo = (col) => ({
  dia:    { g: `DATE_FORMAT(${col}, '%Y-%m-%d')`, where: `${col} >= DATE_SUB(CURDATE(), INTERVAL 13 DAY)` },
  semana: { g: `DATE_FORMAT(DATE_SUB(DATE(${col}), INTERVAL WEEKDAY(${col}) DAY), '%Y-%m-%d')`, where: `${col} >= DATE_SUB(CURDATE(), INTERVAL 7 WEEK)` },
  mes:    { g: `DATE_FORMAT(${col}, '%Y-%m')`, where: `${col} >= DATE_SUB(CURDATE(), INTERVAL 11 MONTH)` },
  anio:   { g: `DATE_FORMAT(${col}, '%Y')`, where: "1=1" },
});

// Etiqueta legible desde la clave del bucket: dd/mm para día/semana, tal cual
// para mes ('YYYY-MM') y año ('YYYY').
export const etiquetaBucket = (periodo, clave) =>
  periodo === "mes" || periodo === "anio" ? clave : ddmm(clave);
