// Lo que carga la base `agencia_simulacion` para los chats simulados: el catálogo de
// "Catálogo de la simulación" (chats-simulados.md), la agencia, los horarios, los asesores
// y los términos publicados (con ellos la verificación del BCRA queda activa).
// Si cambia la tabla del documento, cambia acá: los códigos (`ref`) son los de los chats.

// Precios en pesos; `null` es "sin cargar". Los km sin cargar van como 0, igual que en producción.
export const AUTOS = [
  { ref: "19", marca: "Chevrolet", modelo: "Prisma", version: "Joy LS 1.4", anio: 2018, precio: 11_900_000, contado: null, entrega: null, kms: 0, combustible: "nafta" },
  { ref: "36", marca: "Fiat", modelo: "Mobi", version: "Like 1.0", anio: 2022, precio: 15_900_000, contado: null, entrega: 6_000_000, kms: 82_000, combustible: "nafta" },
  { ref: "59", marca: "Renault", modelo: "Captur", version: "Intens 2.0", anio: 2018, precio: 21_900_000, contado: 21_500_000, entrega: null, kms: 0, combustible: "nafta" },
  { ref: "60", marca: "Renault", modelo: "Duster", version: "Privilege 1.6", anio: 2017, precio: 18_500_000, contado: null, entrega: null, kms: 143_000, combustible: "nafta" },
  { ref: "64", marca: "Volkswagen", modelo: "Gol Trend", version: "1.6 Trendline 3 puertas", anio: 2015, precio: 12_900_000, contado: null, entrega: null, kms: 0, combustible: "nafta" },
  { ref: "65", marca: "Volkswagen", modelo: "Gol Trend", version: "1.6 Trendline", anio: 2019, precio: 16_500_000, contado: null, entrega: null, kms: 0, combustible: "nafta" },
  { ref: "67", marca: "Volkswagen", modelo: "Voyage", version: "1.6", anio: 2012, precio: 10_900_000, contado: null, entrega: null, kms: 0, combustible: "nafta" },
  { ref: "69", marca: "Volkswagen", modelo: "Vento", version: "Luxury 2.5", anio: 2014, precio: 19_800_000, contado: 19_500_000, entrega: null, kms: 148_000, combustible: "nafta" },
  { ref: "78", marca: "Toyota", modelo: "SW4", version: "SRX 2.8 TDI", anio: 2020, precio: 55_000_000, contado: null, entrega: null, kms: 153_000, combustible: "diesel" },
  { ref: "80", marca: "Toyota", modelo: "Hilux", version: "SR 3.0 TDI", anio: 2013, precio: 27_000_000, contado: 26_500_000, entrega: null, kms: 123_000, combustible: "diesel" },
  { ref: "85", marca: "Citroën", modelo: "C5", version: "Confort 2.0 HDI", anio: 2011, precio: 14_900_000, contado: 14_500_000, entrega: null, kms: 0, combustible: "diesel" },
  { ref: "86", marca: "Chery", modelo: "Tiggo", version: "Comfort 2.0", anio: 2012, precio: 9_500_000, contado: null, entrega: null, kms: 234_000, combustible: "nafta_gnc" },
  { ref: "90", marca: "Fiat", modelo: "Cronos", version: "Drive 1.3", anio: 2022, precio: 17_000_000, contado: null, entrega: null, kms: 40_000, combustible: "nafta", vendido: true },
];

export const AGENCIA = { nombre: "Ortega Automotores", direccion: "C. 293 esq 290, San Salvador de Jujuy", mapsUrl: "https://maps.app.goo.gl/ortega-sim" };

// 0 = domingo … 6 = sábado (como `getDay()`).
export const HORARIOS = [
  { dia: 0, abierto: false },
  { dia: 1, apertura: "08:00", cierre: "21:00" },
  { dia: 2, apertura: "08:00", cierre: "21:00" },
  { dia: 3, apertura: "09:00", cierre: "21:00" },
  { dia: 4, apertura: "08:00", cierre: "21:00" },
  { dia: 5, apertura: "08:00", cierre: "21:00" },
  { dia: 6, apertura: "08:00", cierre: "13:00" },
];

const sql = (v) => (v === null || v === undefined ? "NULL" : typeof v === "number" ? String(v) : `'${String(v).replaceAll("\\", "\\\\").replaceAll("'", "''")}'`);

export const fotosDe = (ref) => Array.from({ length: 4 }, (_, i) => `https://fotos.simulacion.invalid/${ref}-${i + 1}.jpg`);

function insertAutos() {
  const filas = AUTOS.map((a) =>
    `(${[
      sql(a.ref), sql(a.marca), sql(a.modelo), sql(a.version), a.anio, "'usado'", a.precio, sql(a.contado), sql(a.entrega), a.kms,
      sql(a.combustible), sql(JSON.stringify(fotosDe(a.ref))), a.vendido ? 0 : 1, a.vendido ? "NOW()" : "NULL",
    ].join(", ")})`
  );
  return `INSERT INTO autos (ref, marca, modelo, version, anio, tipo, precio, precio_contado, anticipo, kms, combustible, fotos_json, disponible, vendido_at) VALUES\n  ${filas.join(",\n  ")};`;
}

function insertHorarios() {
  const filas = HORARIOS.map((h) => `(${h.dia}, ${h.abierto === false ? 0 : 1}, ${sql(h.apertura ?? null)}, ${sql(h.cierre ?? null)})`);
  return `INSERT INTO horarios_atencion (dia, abierto, apertura, cierre) VALUES ${filas.join(", ")};`;
}

export const DATOS_CATALOGO = `
INSERT INTO vendedores (nombre, slug, activo, recibe_consultas) VALUES
  ('Juan Simulado', 'juan', 1, 1),
  ('Pepito Simulado', 'pepito', 1, 1),
  ('Ana Simulada', 'ana', 1, 1);
INSERT INTO ubicacion (id, nombre, direccion, maps_url) VALUES (1, ${sql(AGENCIA.nombre)}, ${sql(AGENCIA.direccion)}, ${sql(AGENCIA.mapsUrl)});
${insertHorarios()}
INSERT INTO configuracion (clave, valor) VALUES ('reparticion_equitativa', '1');
INSERT INTO terminos_versiones (texto, publicado_por) VALUES ('Política de privacidad de la simulación: la agencia puede consultar tu situación crediticia con tu permiso.', 'simulación');
${insertAutos()}
`;
