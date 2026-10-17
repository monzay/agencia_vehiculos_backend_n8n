// Simulador del seguimiento de cuotas (herramienta de desarrollo, NO corre en producción).
//
// Recorre el calendario de una cuota día por día, sin WhatsApp ni Meta, con el
// código real: el backend arma los avisos (como cuando lo llama n8n), cada
// cliente simulado responde el día que le toca y Agustina contesta con Claude.
// El admin marca cuotas pagas cuando corresponde. Al final quedan los avisos
// para el admin en el panel (Financiación) para verlos.
//
// Uso (desde web/backend):
//   node scripts/simular-cuotas.js            → borra la simulación anterior y corre una nueva
//   node scripts/simular-cuotas.js --limpiar  → solo borra lo que creó el simulador
//
// Gasta centavos en Claude (suman al tope del mes). Solo contra la base local.

process.loadEnvFile(".env");

const esLocal = (url) => /@(localhost|127\.0\.0\.1)[:/]/.test(url ?? "");
if (process.env.NODE_ENV === "production" || !esLocal(process.env.DATABASE_URL) || !esLocal(process.env.AGENTE_DATABASE_URL)) {
  console.error("El simulador corre solo contra la base local (localhost).");
  process.exit(1);
}

const { default: Anthropic } = await import("@anthropic-ai/sdk");
const { prisma } = await import("../src/lib/prisma.js");
const { dbAgente } = await import("../src/agente/db.js");
const { atenderMensaje } = await import("../src/agente/atender.js");
const { marcarCuota } = await import("../src/services/financiaciones.service.js");
const { prepararAvisosDelDia, registrarResultado, TEXTO_PLANTILLA_CUOTA } = await import("../src/services/avisos-cuotas.service.js");

// Los clientes del simulador se reconocen por su canal_id (el nombre es real
// porque el aviso saluda con el primer nombre).
const MARCA = "sim-cuotas-";
const UNA_HORA_MS = 3_600_000;
const UN_DIA_MS = 24 * UNA_HORA_MS;
// La cuota 1 vence el 18/11/2026 (alta el 02/11, día de pago 18); la 2, el 18/12.
const ALTA = new Date("2026-11-02T15:00:00Z");
const DIA_PAGO = 18;
const VENCE_1 = Date.parse("2026-11-18T12:00:00Z"); // 9:00 de Argentina
const VENCE_2 = Date.parse("2026-12-18T12:00:00Z");

// Cada cliente: qué responde y qué día (días antes del vencimiento), y si el
// admin marca la cuota paga.
const CLIENTES = [
  { nombre: "Lucía Transferencia", tel: "3887000101", respuestas: { 3: "Hola! La voy a pagar por transferencia" }, pagaDiasAntes: 2 },
  { nombre: "Marcos Agencia", tel: "3887000102", respuestas: { 1: "El sábado paso por la agencia a pagarla" } },
  { nombre: "Ana Yapagó", tel: "3887000103", respuestas: { 3: "Ya la pagué ayer en la agencia" }, pagaDiasAntes: 3 },
  { nombre: "Raúl Nopuede", tel: "3887000104", respuestas: { 0: "Este mes no llego, ¿me das unos días más?" } },
  { nombre: "Número Equivocado", tel: "3887000105", respuestas: { 3: "Perdón, no soy esa persona. Número equivocado" } },
  { nombre: "Sofía Baja", tel: "3887000106", respuestas: { 3: "BAJA" } },
  { nombre: "Pedro Silencio", tel: "3887000107", respuestas: {} },
];

const telWhatsApp = (c) => `549${c.tel}`;

// Borra solo lo que creó el simulador: sus clientes (por marca y por número).
async function limpiar() {
  const clientes = await prisma.clientes.findMany({
    where: { OR: [{ canal: "web", canal_id: { startsWith: MARCA } }, { canal: "whatsapp", canal_id: { in: CLIENTES.map(telWhatsApp) } }] },
    select: { id: true },
  });
  const ids = clientes.map((c) => c.id);
  if (!ids.length) return 0;
  const financiaciones = (await prisma.financiaciones.findMany({ where: { cliente_id: { in: ids } }, select: { id: true } })).map((f) => f.id);
  const sesiones = (await prisma.chat_estado.findMany({ where: { cliente_id: { in: ids } }, select: { id: true } })).map((s) => s.id);
  await prisma.$transaction([
    prisma.financiacion_alertas.deleteMany({ where: { financiacion_id: { in: financiaciones } } }),
    prisma.financiacion_avisos.deleteMany({ where: { financiacion_id: { in: financiaciones } } }),
    prisma.financiacion_pagos.deleteMany({ where: { financiacion_id: { in: financiaciones } } }),
    prisma.financiaciones.deleteMany({ where: { id: { in: financiaciones } } }),
    prisma.ia_consumos.deleteMany({ where: { OR: [{ cliente_id: { in: ids } }, { sesion_id: { in: sesiones } }] } }),
    prisma.historial_mensajes.deleteMany({ where: { cliente_id: { in: ids } } }),
    prisma.verificacion_intentos.deleteMany({ where: { cliente_id: { in: ids } } }),
    prisma.vehiculo_cliente.deleteMany({ where: { sesion_id: { in: sesiones } } }),
    prisma.chat_estado.deleteMany({ where: { id: { in: sesiones } } }),
    prisma.clientes.deleteMany({ where: { id: { in: ids } } }),
  ]);
  return ids.length;
}

async function crearFinanciaciones() {
  const creadas = [];
  for (const c of CLIENTES) {
    const cliente = await prisma.clientes.create({
      data: { nombre: c.nombre, telefono: c.tel, dni: `30${c.tel.slice(-6)}`, canal: "web", canal_id: `${MARCA}${c.tel}` },
    });
    const f = await prisma.financiaciones.create({
      data: { cliente_id: cliente.id, cantidad_cuotas: 12, precio_cuota: 250000, dia_pago: DIA_PAGO, created_at: ALTA },
    });
    creadas.push({ ...c, financiacionId: f.id });
  }
  return creadas;
}

const textoDelAviso = (cuerpo) =>
  cuerpo.template.components[0].parameters.reduce((texto, p, i) => texto.replace(`{{${i + 1}}}`, p.text), TEXTO_PLANTILLA_CUOTA);

const sangria = (texto) => String(texto ?? "").split("\n").map((l) => `      ${l}`).join("\n");
const fechaCorta = (ms) => new Date(ms - 3 * UNA_HORA_MS).toISOString().slice(0, 10).split("-").reverse().join("/");

// Un día: salen los avisos (como n8n) y, si `conRespuestas`, responden los que
// les toca ese día y el admin marca las cuotas pagas.
async function simularDia({ clientes, ahora, diasAntes, deps, contadores, conRespuestas = true }) {
  console.log(`\n── ${fechaCorta(ahora)} (${diasAntes === 0 ? "vence hoy" : `faltan ${diasAntes} días`}) ──`);
  const envios = await prepararAvisosDelDia({ db: prisma, ahora: new Date(ahora), ids: clientes.map((c) => c.financiacionId) });
  for (const envio of envios) {
    await registrarResultado({ db: prisma, avisoId: envio.avisoId, ok: true, wamid: `sim-${envio.avisoId}`, ahora: new Date(ahora) });
    const c = clientes.find((x) => envio.cuerpo.to.endsWith(x.tel));
    contadores[c.nombre] = (contadores[c.nombre] ?? 0) + 1;
    console.log(`  📩 Aviso a ${c.nombre}:\n${sangria(textoDelAviso(envio.cuerpo))}`);
  }
  if (!envios.length) console.log("  (ningún aviso)");
  if (!conRespuestas) return;

  for (const c of clientes) {
    const texto = c.respuestas[diasAntes];
    if (texto) {
      const r = await atenderMensaje({ telefono: telWhatsApp(c), texto, ahora: new Date(ahora + UNA_HORA_MS) }, deps);
      console.log(`  👤 ${c.nombre}: ${texto}\n  🤖 Agustina${r.conIA ? "" : " (sin IA)"}:\n${sangria(r.texto ?? "👍")}`);
    }
    if (c.pagaDiasAntes === diasAntes) {
      await marcarCuota(c.financiacionId, 1, true);
      console.log(`  ✅ El admin marca paga la cuota 1 de ${c.nombre}`);
    }
  }
}

async function resumen(clientes, contadores) {
  const alertas = await prisma.financiacion_alertas.findMany({
    where: { financiacion_id: { in: clientes.map((c) => c.financiacionId) } },
    orderBy: { id: "asc" },
  });
  console.log("\n══ Resumen ══");
  for (const c of clientes) {
    const suyas = alertas.filter((a) => a.financiacion_id === c.financiacionId).map((a) => a.tipo);
    console.log(`  ${c.nombre.padEnd(22)} avisos: ${contadores[c.nombre] ?? 0} · avisos para el admin: ${suyas.join(", ") || "—"}`);
  }
  console.log(`\nLos avisos para el admin quedaron en el panel → Financiación. Para borrar la simulación: node scripts/simular-cuotas.js --limpiar`);
}

async function main() {
  const borrados = await limpiar();
  if (borrados) console.log(`Simulación anterior borrada (${borrados} clientes).`);
  if (process.argv.includes("--limpiar")) return;

  const clientes = await crearFinanciaciones();
  const deps = { root: prisma, dbAgente: dbAgente(), anthropic: new Anthropic(), esperaRafagaMs: 0 };
  const contadores = {};
  console.log(`${clientes.length} financiaciones de 12 cuotas de $250.000; la cuota 1 vence el 18/11/2026.`);
  for (const diasAntes of [3, 2, 1, 0]) {
    await simularDia({ clientes, ahora: VENCE_1 - diasAntes * UN_DIA_MS, diasAntes, deps, contadores });
  }
  console.log("\n… un mes después: la cuota 2 (solo vuelven a recibir los que no se dieron de baja ni tienen el número marcado como equivocado)");
  await simularDia({ clientes, ahora: VENCE_2 - 3 * UN_DIA_MS, diasAntes: 3, deps, contadores, conRespuestas: false });
  await resumen(clientes, contadores);
}

try {
  await main();
} finally {
  await prisma.$disconnect();
  await dbAgente().$disconnect();
}
