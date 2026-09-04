// Seed de DEMO para el panel: consultas de vehículos + visualizaciones web.
//
// 400 filas en total, repartidas 300 vistas / 100 consultas. La proporción no
// es caprichosa: mirar una ficha es gratis y escribir por WhatsApp cuesta, así
// que en la realidad las vistas superan a las consultas por varias veces. Con
// un 50/50 el panel mostraría una relación que no se parece a la de producción.
//
// Uso:
//   node prisma/seed/seed-consultas-vistas.mjs            # sembrar
//   node prisma/seed/seed-consultas-vistas.mjs --limpiar  # borrar lo sembrado
//
// OJO: --limpiar vacía la tabla auto_vistas ENTERA. Las vistas no guardan de
// dónde vinieron (es telemetría anónima), así que no hay forma de distinguir
// las sembradas de las reales. Los clientes y sesiones sí se borran selectivos,
// por el prefijo del canal_id.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TOTAL_VISTAS = 300;
const TOTAL_CONSULTAS = 100;
const TOTAL_CLIENTES = 70; // menos que consultas: algunos vuelven a consultar
const DIAS_ATRAS = 365;

// Marca de agua para poder borrar después solo lo sembrado.
const PREFIJO = "seed-demo-";

// Este script INSERTA cientos de filas. Contra la base de producción sería un
// desastre difícil de revertir, y en .env conviven la URL local y la de Aiven
// comentada: un descuido de una línea alcanza. Por eso exige base local.
function verificarBaseLocal() {
  const url = process.env.DATABASE_URL || "";
  const esLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  if (!esLocal && !process.argv.includes("--forzar")) {
    console.error(
      "✖ DATABASE_URL no apunta a una base local.\n" +
        "  Este seed escribe cientos de filas de demo. Si de verdad querés\n" +
        "  correrlo contra esa base, agregá --forzar."
    );
    process.exit(1);
  }
}

const azar = (n) => Math.floor(Math.random() * n);
const elegir = (arr) => arr[azar(arr.length)];

// Fecha al azar dentro del último año, sesgada hacia lo reciente: elevar al
// cuadrado un valor entre 0 y 1 empuja la distribución hacia 0 (hoy). Sin el
// sesgo, la actividad quedaría plana y el gráfico de "día" saldría casi vacío.
function fechaAlAzar() {
  const dias = Math.pow(Math.random(), 2) * DIAS_ATRAS;
  const fecha = new Date(Date.now() - dias * 86400000);
  fecha.setHours(azar(24), azar(60), azar(60), 0);
  return fecha;
}

// Reparto desigual entre vehículos: unos pocos concentran la mayoría del
// interés. Un reparto uniforme daría un ranking donde todos empatan, que no
// sirve para probar la sección.
function pesosPorAuto(autos) {
  return autos.flatMap((auto, i) => Array(Math.max(1, autos.length - i)).fill(auto));
}

const NOMBRES = ["Juan", "María", "Carlos", "Lucía", "Diego", "Sofía", "Martín", "Valentina", "Pablo", "Camila", "Nicolás", "Julieta", "Federico", "Agustina", "Rodrigo"];
const APELLIDOS = ["Pérez", "González", "Rodríguez", "Fernández", "López", "Martínez", "Sánchez", "Romero", "Díaz", "Álvarez", "Torres", "Ruiz"];
const CLASIFICACIONES = ["CALIENTE", "TIBIO", "TIBIO", "FRIO", "FRIO", "FRIO"]; // pirámide: pocos calientes
const CANALES = ["whatsapp", "whatsapp", "whatsapp", "instagram", "facebook", "web"];

async function limpiar() {
  const clientes = await prisma.clientes.findMany({
    where: { canal_id: { startsWith: PREFIJO } },
    select: { id: true },
  });
  const ids = clientes.map((c) => c.id);

  // Orden: primero las sesiones (FK hacia clientes), después los clientes.
  const sesiones = await prisma.chat_estado.deleteMany({ where: { cliente_id: { in: ids } } });
  await prisma.clientes.deleteMany({ where: { id: { in: ids } } });
  const vistas = await prisma.auto_vistas.deleteMany({});

  console.log(`✔ Borradas ${vistas.count} vistas, ${sesiones.count} consultas y ${ids.length} clientes de demo.`);
}

async function sembrar() {
  const autos = await prisma.autos.findMany({
    where: { deleted_at: null },
    select: { id: true, marca: true, modelo: true },
    orderBy: { id: "desc" },
  });
  if (autos.length === 0) {
    console.error("✖ No hay vehículos cargados: sin autos no hay a qué asociar las consultas.");
    process.exit(1);
  }
  const bolsa = pesosPorAuto(autos);

  // ── Vistas ──
  const vistas = Array.from({ length: TOTAL_VISTAS }, () => ({
    auto_id: elegir(bolsa).id,
    created_at: fechaAlAzar(),
  }));
  await prisma.auto_vistas.createMany({ data: vistas });

  // ── Clientes ──
  // canal_id es UNIQUE junto con canal: el índice del bucle lo hace único y a
  // la vez sirve de marca para el borrado.
  const clientes = Array.from({ length: TOTAL_CLIENTES }, (_, i) => ({
    nombre: `${elegir(NOMBRES)} ${elegir(APELLIDOS)}`,
    telefono: `+54938${String(10000000 + i).slice(0, 8)}`,
    canal: elegir(CANALES),
    canal_id: `${PREFIJO}${i}`,
    created_at: fechaAlAzar(),
  }));
  await prisma.clientes.createMany({ data: clientes });

  const creados = await prisma.clientes.findMany({
    where: { canal_id: { startsWith: PREFIJO } },
    select: { id: true, created_at: true },
  });

  // ── Consultas ──
  // La sesión nunca puede ser anterior al alta del cliente: si lo fuera, el
  // panel mostraría consultas de gente que todavía no existía.
  const consultas = Array.from({ length: TOTAL_CONSULTAS }, () => {
    const cliente = elegir(creados);
    const inicio = fechaAlAzar();
    const sesion = inicio < cliente.created_at ? cliente.created_at : inicio;
    const clasificacion = elegir(CLASIFICACIONES);
    return {
      cliente_id: cliente.id,
      auto_id: elegir(bolsa).id,
      clasificacion,
      score: clasificacion === "CALIENTE" ? 70 + azar(30) : clasificacion === "TIBIO" ? 40 + azar(30) : azar(40),
      paso_actual: "fin",
      tipo_lead: Math.random() < 0.15 ? "venta" : "compra",
      sesion_inicio: sesion,
      ultimo_mensaje: sesion,
      updated_at: sesion,
    };
  });
  await prisma.chat_estado.createMany({ data: consultas });

  console.log(
    `✔ Sembrado: ${TOTAL_VISTAS} vistas + ${TOTAL_CONSULTAS} consultas = ${TOTAL_VISTAS + TOTAL_CONSULTAS} filas\n` +
      `  (repartidas entre ${autos.length} vehículos y ${TOTAL_CLIENTES} clientes, último año)`
  );
}

verificarBaseLocal();
const tarea = process.argv.includes("--limpiar") ? limpiar : sembrar;
tarea()
  .catch((e) => {
    console.error("✖", e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
