// Seed de STOCK: carga 20 vehículos con su info (sin fotos) para probar el
// catálogo y el panel en desarrollo.
//
// Uso:     node prisma/seed/seed-autos.mjs
// Limpiar: node prisma/seed/seed-autos.mjs --wipe
//
// Se apoya en el service de vehículos, así los `ref` se generan con la misma
// regla que usa el panel y las validaciones son las mismas. Sin `imgs`, el
// mapper devuelve "/placeholder.svg" en el front.
//
// El wipe borra (soft delete) solo lo cargado acá, identificado por la marca
// SEED_MARCA al final de la descripción.

import { prisma } from "../../src/lib/prisma.js";
import { crearVehiculo } from "../../src/services/vehiculos.service.js";

const SEED_MARCA = "[seed]";

const VEHICULOS = [
  { marca: "Volkswagen", modelo: "Gol Trend 1.6 Trendline", anio: 2018, condicion: "usado", tipoVehiculo: "auto", combustible: "nafta",  precio: 11500000, kms: 96000,  stock: 1, descripcion: "5 puertas, service al día, único dueño." },
  { marca: "Chevrolet",  modelo: "Onix LT 1.4",              anio: 2020, condicion: "usado", tipoVehiculo: "auto", combustible: "nafta",  precio: 15800000, kms: 62000,  stock: 1, descripcion: "Pantalla táctil, cubiertas nuevas." },
  { marca: "Fiat",       modelo: "Cronos Drive 1.3",         anio: 2022, condicion: "usado", tipoVehiculo: "auto", combustible: "nafta",  precio: 19900000, kms: 38000,  stock: 2, descripcion: "Impecable, con garantía de fábrica vigente." },
  { marca: "Toyota",     modelo: "Etios XLS 1.5",            anio: 2019, condicion: "usado", tipoVehiculo: "auto", combustible: "nafta",  precio: 16200000, kms: 74000,  stock: 1, descripcion: "Sedán, muy bajo consumo." },
  { marca: "Renault",    modelo: "Sandero Stepway Intens",   anio: 2021, condicion: "usado", tipoVehiculo: "auto", combustible: "nafta",  precio: 18700000, kms: 51000,  stock: 1, descripcion: "Levanta vidrios eléctrico, control de estabilidad." },
  { marca: "Peugeot",    modelo: "208 Allure 1.6",           anio: 2020, condicion: "usado", tipoVehiculo: "auto", combustible: "nafta",  precio: 17400000, kms: 58000,  stock: 1, descripcion: "Full, climatizador automático." },
  { marca: "Ford",       modelo: "Fiesta Kinetic SE 1.6",    anio: 2017, condicion: "usado", tipoVehiculo: "auto", combustible: "nafta",  precio: 12300000, kms: 108000, stock: 1, descripcion: "Motor y caja recién revisados." },
  { marca: "Volkswagen", modelo: "Amarok Comfortline 4x2",   anio: 2019, condicion: "usado", tipoVehiculo: "auto", combustible: "diesel", precio: 34500000, kms: 121000, stock: 1, descripcion: "Camioneta doble cabina, cubre caja y barras." },
  { marca: "Toyota",     modelo: "Hilux SR 2.4 4x4",         anio: 2021, condicion: "usado", tipoVehiculo: "auto", combustible: "diesel", precio: 52000000, kms: 89000,  stock: 1, descripcion: "Doble cabina, service oficial completo." },
  { marca: "Ford",       modelo: "Ranger XLS 3.2 4x2",       anio: 2018, condicion: "usado", tipoVehiculo: "auto", combustible: "diesel", precio: 38900000, kms: 134000, stock: 1, descripcion: "Muy buen estado general, lista para trabajar." },
  { marca: "Fiat",       modelo: "Toro Freedom 1.8",         anio: 2020, condicion: "usado", tipoVehiculo: "auto", combustible: "nafta",  precio: 29800000, kms: 77000,  stock: 1, descripcion: "Caja automática, tapizado en buen estado." },
  { marca: "Chevrolet",  modelo: "Tracker LT 1.2 Turbo",     anio: 2023, condicion: "0km",   tipoVehiculo: "auto", combustible: "nafta",  precio: 41500000, kms: 0,      stock: 3, descripcion: "SUV 0km, entrega inmediata." },
  { marca: "Renault",    modelo: "Kwid Zen 1.0",             anio: 2024, condicion: "0km",   tipoVehiculo: "auto", combustible: "nafta",  precio: 22600000, kms: 0,      stock: 4, descripcion: "0km, ideal ciudad, bajo mantenimiento." },
  { marca: "Fiat",       modelo: "Mobi Trekking 1.0",        anio: 2024, condicion: "0km",   tipoVehiculo: "auto", combustible: "nafta",  precio: 21400000, kms: 0,      stock: 2, descripcion: "0km, patentamiento bonificado." },
  { marca: "Volkswagen", modelo: "Polo Track 1.6",           anio: 2024, condicion: "0km",   tipoVehiculo: "auto", combustible: "nafta",  precio: 27300000, kms: 0,      stock: 2, descripcion: "0km, financiación en cuotas fijas." },
  { marca: "Volkswagen", modelo: "Suran Comfortline 1.6",    anio: 2015, condicion: "usado", tipoVehiculo: "auto", combustible: "gnc",    precio: 9800000,  kms: 168000, stock: 1, descripcion: "Con equipo de GNC 5ta generación, oblea al día." },
  { marca: "Honda",      modelo: "Wave 110 S",               anio: 2022, condicion: "usado", tipoVehiculo: "moto", combustible: "nafta",  precio: 2450000,  kms: 12000,  stock: 1, descripcion: "Moto de calle, papeles al día." },
  { marca: "Yamaha",     modelo: "FZ-S FI 150",              anio: 2021, condicion: "usado", tipoVehiculo: "moto", combustible: "nafta",  precio: 4100000,  kms: 19000,  stock: 1, descripcion: "Inyección electrónica, cubiertas nuevas." },
  { marca: "Motomel",    modelo: "Skua 200 V6",              anio: 2023, condicion: "0km",   tipoVehiculo: "moto", combustible: "nafta",  precio: 3300000,  kms: 0,      stock: 3, descripcion: "0km, enduro, entrega con patentamiento." },
  { marca: "Honda",      modelo: "XR 150 L",                 anio: 2024, condicion: "0km",   tipoVehiculo: "moto", combustible: "nafta",  precio: 5200000,  kms: 0,      stock: 2, descripcion: "0km, uso mixto calle/campo." },
];

async function wipe() {
  const { count } = await prisma.autos.updateMany({
    where: { descripcion: { endsWith: SEED_MARCA }, deleted_at: null },
    data: { deleted_at: new Date() },
  });
  console.log(count ? `Borrados ${count} vehículos del seed.` : "No hay vehículos del seed para borrar.");
}

async function seed() {
  for (const v of VEHICULOS) {
    const creado = await crearVehiculo({ ...v, descripcion: `${v.descripcion} ${SEED_MARCA}` });
    console.log(`ref ${creado.ref} · ${creado.brand} ${creado.model} (${creado.year})`);
  }
  console.log(`\nCargados ${VEHICULOS.length} vehículos sin fotos.`);
}

try {
  if (process.argv.includes("--wipe")) await wipe();
  else await seed();
} finally {
  await prisma.$disconnect();
}
