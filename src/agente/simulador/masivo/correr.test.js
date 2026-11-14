// Integración: corre dos casos chicos por atenderMensaje contra la base local `agencia_simulacion`
// (creada de cero en cada corrida). Se salta si el .env no trae las dos URLs apuntando a una base local.
// Nunca toca la base `agencia`: antes de abrir cualquier conexión se cambian las dos URLs del proceso.
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { baseAutorizada } from "../../../lib/base-local.js";
import { urlDeSimulacion, verificarBases, basesProhibidas } from "./guardas.js";
import { cortarRed } from "./red.js";
import { crearClaudeFalso } from "./claude-falso.js";
import { crearGroqFalso } from "./groq-falso.js";

if (existsSync(".env")) process.loadEnvFile(".env");

const urlRootDev = process.env.DATABASE_URL;
const urlAgenteDev = process.env.AGENTE_DATABASE_URL;
// Las bases del .env (hoy `agencia`), tomadas antes de pisar las URLs del proceso.
const prohibidas = basesProhibidas({ DATABASE_URL: urlRootDev, AGENTE_DATABASE_URL: urlAgenteDev });

const motivoDeSalto = !urlRootDev
  ? "falta DATABASE_URL"
  : !urlAgenteDev
    ? "falta AGENTE_DATABASE_URL"
    : !baseAutorizada(urlRootDev)
      ? "DATABASE_URL no apunta a una base local"
      : !baseAutorizada(urlAgenteDev)
        ? "AGENTE_DATABASE_URL no apunta a una base local"
        : false;

const nombreDeBase = (url) => new URL(url).pathname.replace(/^\//, "");

const DIA = 24 * 60 * 60 * 1000;
const DIA_CERO = new Date("2026-06-01T15:00:00Z");
const MARCA_VIEJA = "MENSAJE-VIEJO-DEL-PRIMER-CONTACTO";

let red;
let prisma;
let dbAgente;
let correrCaso;
let chequear;
let prepararBase;
let urlRoot;
let urlAgente;
let autos = [];

before(
  async () => {
    if (motivoDeSalto) return;
    urlRoot = urlDeSimulacion(urlRootDev);
    urlAgente = urlDeSimulacion(urlAgenteDev);
    verificarBases({ backend: urlRoot, agente: urlAgente }, { prohibidas });
    // Corre sin claves de Anthropic ni de Groq. Vacías y no borradas: dotenv no pisa lo que ya existe,
    // así que una variable borrada reaparecería cuando Prisma relea el .env.
    process.env.ANTHROPIC_API_KEY = "";
    process.env.GROQ_API_KEY = "";
    // Desde acá todo el proceso (Prisma incluido) apunta a la base de simulación, nunca a `agencia`.
    process.env.DATABASE_URL = urlRoot;
    process.env.AGENTE_DATABASE_URL = urlAgente;
    red = cortarRed();
    ({ prepararBase } = await import("./base.js"));
    ({ correrCaso, chequear } = await import("./correr.js"));
    await prepararBase({ urlRoot, urlAgente }, { prohibidas });
    ({ prisma } = await import("../../../lib/prisma.js"));
    ({ dbAgente } = await import("../../db.js"));
    // Antes de correr nada: las dos conexiones del proceso apuntan a la base de simulación.
    const [{ base: baseBackend }] = await prisma.$queryRaw`SELECT DATABASE() AS base`;
    const [{ base: baseAgente }] = await dbAgente().$queryRaw`SELECT DATABASE() AS base`;
    assert.equal(baseBackend, "agencia_simulacion", "el cliente del backend apunta a agencia_simulacion");
    assert.equal(baseAgente, "agencia_simulacion", "el cliente del agente apunta a agencia_simulacion");
    autos = await prisma.autos.findMany({ where: { deleted_at: null }, orderBy: { id: "asc" } });
  },
  { timeout: 180_000 },
);

after(async () => {
  try {
    if (prisma) await prisma.$disconnect();
    if (dbAgente) await dbAgente().$disconnect();
  } finally {
    red?.restaurar();
  }
});

function dependencias(caso) {
  const claude = crearClaudeFalso(caso.turnos.flatMap((t) => t.claude ?? []));
  const groq = crearGroqFalso(caso.turnos.filter((t) => t.audio).map((t) => t.audio));
  return { claude, groq, deps: { root: prisma, dbAgente: dbAgente(), anthropic: claude, transcribir: groq, esperaRafagaMs: 0 } };
}

async function consultasDe(telefono) {
  const cliente = await prisma.clientes.findFirst({ where: { telefono: { contains: telefono.slice(-8) } } });
  assert.ok(cliente, `el cliente ${telefono} quedó guardado`);
  const consultas = await prisma.chat_estado.findMany({ where: { cliente_id: cliente.id }, orderBy: { id: "asc" } });
  return { cliente, consultas };
}

test("la base de la corrida es agencia_simulacion y no la de desarrollo", { skip: motivoDeSalto }, async () => {
  assert.equal(nombreDeBase(urlRoot), "agencia_simulacion");
  assert.equal(nombreDeBase(urlAgente), "agencia_simulacion");
  assert.notEqual(nombreDeBase(urlRoot), nombreDeBase(urlRootDev));
  const [{ base }] = await prisma.$queryRaw`SELECT DATABASE() AS base`;
  assert.equal(base, "agencia_simulacion");
});

test("las dos conexiones dicen agencia_simulacion", { skip: motivoDeSalto }, async () => {
  const [{ base: deBackend }] = await prisma.$queryRaw`SELECT DATABASE() AS base`;
  const [{ base: deAgente }] = await dbAgente().$queryRaw`SELECT DATABASE() AS base`;
  assert.equal(deBackend, "agencia_simulacion");
  assert.equal(deAgente, "agencia_simulacion");
});

test("no hay claves de Anthropic ni de Groq en el entorno durante la corrida", { skip: motivoDeSalto }, () => {
  assert.ok(!process.env.ANTHROPIC_API_KEY, "no hay clave de Anthropic en el entorno");
  assert.ok(!process.env.GROQ_API_KEY, "no hay clave de Groq en el entorno");
});

test("la base sembrada trae asesores, autos y reparto equitativo", { skip: motivoDeSalto }, async () => {
  const activos = await prisma.vendedores.findMany({ where: { activo: true } });
  assert.deepEqual(activos.map((v) => v.slug).sort(), ["ana", "juan", "pepito"].sort());
  assert.equal(await prisma.vendedores.count({ where: { activo: false } }), 1);
  assert.equal(autos.length, 6, "5 disponibles + 1 vendido");
  assert.equal(await prisma.ubicacion.count(), 1);
  const reparto = await prisma.configuracion.findFirst({ where: { clave: "reparticion_equitativa" } });
  assert.equal(reparto?.valor, "1");
});

test("caso (a): cliente nuevo pregunta por un auto y queda 1 consulta con ese auto y un asesor del turno", { skip: motivoDeSalto, timeout: 120_000 }, async () => {
  const auto = autos.find((a) => a.disponible && !a.vendido_at);
  const caso = {
    id: "nuevo-pregunta-auto",
    telefono: "5493885550201",
    turnos: [
      {
        ahora: DIA_CERO.toISOString(),
        texto: `Hola, me interesa el auto REF #${auto.ref}`,
        claude: [
          { herramienta: "registrar_calificacion", entrada: { auto_ref: auto.ref } },
          { texto: "Perfecto, ¿lo pensás pagar de contado o financiado?" },
        ],
      },
    ],
    esperado: { consultas: 1, autoFinal: auto.ref },
  };
  const { claude, deps } = dependencias(caso);
  await correrCaso(caso, deps);

  const resultado = await chequear(caso, { root: prisma, claude });
  assert.deepEqual(resultado.fallas, []);
  assert.equal(resultado.ok, true);

  // Además se lee la base directamente: lo que devuelve el chequeo no se toma como prueba.
  const { consultas } = await consultasDe(caso.telefono);
  assert.equal(consultas.length, 1);
  assert.equal(consultas[0].auto_id, auto.id);
  const asesor = await prisma.vendedores.findUnique({ where: { id: consultas[0].vendedor_id } });
  assert.ok(asesor?.activo, "la consulta quedó con un asesor activo del reparto");
  assert.ok(["juan", "pepito", "ana"].includes(asesor.slug));
  assert.equal(claude.llamadas.length, 2, "Claude recibió el mensaje, llamó a la herramienta y respondió");
});

test("caso (b): vuelve a los 31 días: 2 consultas y a Claude no le llega el mensaje viejo", { skip: motivoDeSalto, timeout: 120_000 }, async () => {
  const auto = autos.find((a) => a.disponible && !a.vendido_at);
  const caso = {
    id: "vuelve-a-los-31-dias",
    telefono: "5493885550202",
    turnos: [
      {
        ahora: DIA_CERO.toISOString(),
        texto: `Hola, me interesa el auto REF #${auto.ref}. ${MARCA_VIEJA}`,
        claude: [
          { herramienta: "registrar_calificacion", entrada: { auto_ref: auto.ref } },
          { texto: "Perfecto, ¿lo pensás pagar de contado o financiado?" },
        ],
      },
      {
        ahora: new Date(DIA_CERO.getTime() + 31 * DIA).toISOString(),
        texto: "Hola, ¿sigue el auto?",
        claude: [{ texto: "Hola de nuevo, contame qué estás buscando." }],
      },
    ],
    esperado: { consultas: 2, noLlegaAClaude: [MARCA_VIEJA] },
  };
  const { claude, deps } = dependencias(caso);
  await correrCaso(caso, deps);

  const resultado = await chequear(caso, { root: prisma, claude });
  assert.deepEqual(resultado.fallas, []);
  assert.equal(resultado.ok, true);

  const { cliente, consultas } = await consultasDe(caso.telefono);
  assert.equal(consultas.length, 2, "pasado el mes se abre una consulta nueva");
  assert.notEqual(consultas[0].id, consultas[1].id);

  // Las llamadas del segundo turno son las que vienen después de las 2 del primero.
  const delSegundoTurno = claude.llamadas.slice(2);
  assert.ok(delSegundoTurno.length >= 1);
  for (const llamada of delSegundoTurno) {
    assert.doesNotMatch(JSON.stringify(llamada.messages), new RegExp(MARCA_VIEJA), "el mensaje viejo no le llega a Claude");
  }
  // Pero sigue guardado en el historial.
  const viejo = await prisma.historial_mensajes.count({ where: { cliente_id: cliente.id, mensaje: { contains: MARCA_VIEJA } } });
  assert.ok(viejo >= 1, "el mensaje viejo queda en historial_mensajes");
});

test("chequear devuelve fallas cuando lo esperado no coincide con la base", { skip: motivoDeSalto, timeout: 60_000 }, async () => {
  const { claude } = dependencias({ turnos: [] });
  const caso = { id: "inexistente", telefono: "5493885550202", turnos: [], esperado: { consultas: 7 } };
  const resultado = await chequear(caso, { root: prisma, claude });
  assert.equal(resultado.ok, false);
  assert.ok(resultado.fallas.length >= 1);
});

test("la red quedó cortada y sin intentos durante toda la corrida", { skip: motivoDeSalto }, () => {
  assert.equal(red.intentos(), 0);
  assert.ok(!process.env.ANTHROPIC_API_KEY, "al final sigue sin haber clave de Anthropic");
  assert.ok(!process.env.GROQ_API_KEY, "no hay clave de Groq en el entorno");
});
