// Simulación masiva del agente (tarea 10 de huecos-del-bot). Herramienta de desarrollo: NO corre en producción.
//
// Arma más de 1000 charlas de clientes, las corre por el camino real (orquestador + base) contra la base local
// `agencia_simulacion` (creada de cero), con Claude y Groq simulados, sin red y sin claves de IA, y chequea
// lo que quedó en la base contra el oráculo de `generar.js`.
//
// Uso (desde web/backend):
//   node scripts/simular-masivo.js [--cantidad 1200] [--semilla 1]
//
// Escribe en openspec/changes/huecos-del-bot/simulacion/: reporte.json, resumen.md y casos-masivos.json.
// Sale con 0 si se cumple el criterio de cierre y con 1 si no.

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { existsSync } from "node:fs";
import { urlDeSimulacion, verificarBases, basesProhibidas } from "../src/agente/simulador/masivo/guardas.js";
import { cortarRed } from "../src/agente/simulador/masivo/red.js";
import { crearClaudeFalso } from "../src/agente/simulador/masivo/claude-falso.js";
import { crearGroqFalso } from "../src/agente/simulador/masivo/groq-falso.js";
import { prepararBase } from "../src/agente/simulador/masivo/base.js";

if (existsSync(".env")) process.loadEnvFile(".env");

const argumento = (nombre, porDefecto) => {
  const i = process.argv.indexOf(`--${nombre}`);
  return i > 0 ? process.argv[i + 1] : porDefecto;
};
const cantidad = Number(argumento("cantidad", 1200));
const semilla = Number(argumento("semilla", 1));
const SALIDA = path.join("openspec", "changes", "huecos-del-bot", "simulacion");

// Las bases del .env (hoy `agencia`) son las prohibidas; se toman antes de pisar las URLs del proceso.
const prohibidas = basesProhibidas(process.env);
const urlRoot = urlDeSimulacion(process.env.DATABASE_URL);
const urlAgente = urlDeSimulacion(process.env.AGENTE_DATABASE_URL);
verificarBases({ backend: urlRoot, agente: urlAgente }, { prohibidas });

// Desde acá todo el proceso (Prisma incluido) apunta a la base de simulación y no hay claves de IA
// (vacías y no borradas: dotenv no pisa lo que ya existe).
process.env.DATABASE_URL = urlRoot;
process.env.AGENTE_DATABASE_URL = urlAgente;
process.env.ANTHROPIC_API_KEY = "";
process.env.GROQ_API_KEY = "";
const red = cortarRed();

const inicio = Date.now();
let prisma;
let dbDelAgente;
let codigo = 1;
try {
  console.log("Preparando la base agencia_simulacion…");
  await prepararBase({ urlRoot, urlAgente }, { prohibidas });
  ({ prisma } = await import("../src/lib/prisma.js"));
  const { dbAgente } = await import("../src/agente/db.js");
  const { correrCaso, chequear } = await import("../src/agente/simulador/masivo/correr.js");
  const { generarCasos } = await import("../src/agente/simulador/masivo/generar.js");
  const { resumir, cumpleCriterio } = await import("../src/agente/simulador/masivo/resumen.js");
  dbDelAgente = dbAgente();

  const [{ base: baseBackend }] = await prisma.$queryRaw`SELECT DATABASE() AS base`;
  const [{ base: baseAgente }] = await dbDelAgente.$queryRaw`SELECT DATABASE() AS base`;
  if (baseBackend !== "agencia_simulacion" || baseAgente !== "agencia_simulacion") {
    throw new Error("Las conexiones no apuntan a agencia_simulacion: se aborta sin correr nada.");
  }

  const casos = generarCasos({ cantidad, semilla });
  console.log(`Corriendo ${casos.length} casos (semilla ${semilla})…`);
  const resultados = [];
  for (const [i, caso] of casos.entries()) {
    const claude = crearClaudeFalso(caso.turnos.flatMap((t) => t.claude ?? []));
    const groq = crearGroqFalso(caso.turnos.filter((t) => t.audio).map((t) => t.audio));
    const deps = { root: prisma, dbAgente: dbDelAgente, anthropic: claude, transcribir: groq, esperaRafagaMs: 0 };
    try {
      await correrCaso(caso, deps);
      const { ok, fallas } = await chequear(caso, { root: prisma, claude });
      resultados.push({ caso, ok, fallas });
    } catch (err) {
      resultados.push({ caso, ok: false, fallas: [], error: err?.message ?? String(err) });
    }
    // La seña de prueba de un caso reserva el auto y no tiene que afectar a los siguientes.
    // `prisma` apunta a agencia_simulacion (verificado arriba con SELECT DATABASE()).
    await prisma.senas.deleteMany({});
    if ((i + 1) % 100 === 0) console.log(`  ${i + 1}/${casos.length} (${resultados.filter((r) => !r.ok).length} fallidos hasta ahora)`);
  }

  const resumen = resumir(resultados);
  const intentosDeRed = red.intentos();
  const cumple = cumpleCriterio(resumen, { intentosDeRed });
  const segundos = Math.round((Date.now() - inicio) / 1000);

  mkdirSync(SALIDA, { recursive: true });
  writeFileSync(path.join(SALIDA, "casos-masivos.json"), JSON.stringify(casos, null, 2));
  writeFileSync(path.join(SALIDA, "reporte.json"), JSON.stringify({ ...resumen, intentosDeRed, cumpleCriterio: cumple, segundos, semilla }, null, 2));

  // Las primeras 50 fallas, agrupadas por la clave del chequeo (lo que va antes de los dos puntos).
  const grupos = new Map();
  for (const f of resumen.fallas.slice(0, 50)) {
    for (const texto of f.fallas.length ? f.fallas : ["(sin detalle)"]) {
      const clave = texto.includes(":") ? texto.slice(0, texto.indexOf(":")) : "otra";
      if (!grupos.has(clave)) grupos.set(clave, []);
      grupos.get(clave).push(`- ${f.id} (${Object.values(f.ejes).join(", ")}): ${texto}`);
    }
  }
  const cobertura = Object.entries(resumen.cobertura)
    .map(([eje, valores]) => `- **${eje}**: ${Object.entries(valores).map(([v, n]) => `${v} ${n}`).join(", ")}`)
    .join("\n");
  const md = `# Simulación masiva (semilla ${semilla})

- Total: ${resumen.total}
- OK: ${resumen.ok}
- Fallidos: ${resumen.fallidos}
- Intentos de red: ${intentosDeRed}
- Cumple el criterio: ${cumple ? "sí" : "no"}
- Tiempo: ${segundos} s

## Cobertura por eje y valor

${cobertura}

## Primeras 50 fallas, por clave

${[...grupos].map(([clave, lineas]) => `### ${clave} (${lineas.length})\n\n${lineas.join("\n")}`).join("\n\n") || "Ninguna."}
`;
  writeFileSync(path.join(SALIDA, "resumen.md"), md);

  console.log(`\nTotal ${resumen.total} · ok ${resumen.ok} · fallidos ${resumen.fallidos} · intentos de red ${intentosDeRed} · cumple ${cumple} · ${segundos} s`);
  codigo = cumple ? 0 : 1;
} catch (err) {
  console.error("La simulación se detuvo:", err?.message ?? err);
} finally {
  try {
    await prisma?.$disconnect();
    await dbDelAgente?.$disconnect();
  } finally {
    red.restaurar();
  }
}
process.exit(codigo);
