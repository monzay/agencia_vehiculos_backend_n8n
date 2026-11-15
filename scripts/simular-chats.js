// Chats simulados del bot (respuestas-del-bot, tarea 2). Herramienta de desarrollo: NO corre en producción.
//
// Lee openspec/changes/respuestas-del-bot/chats-simulados.md, arma la base local `agencia_simulacion`
// de cero con el catálogo del documento y le manda cada chat al bot por el camino real
// (`atenderMensaje`), con Claude Haiku de verdad. Lo demás es de prueba: BCRA simulado, audios
// transcriptos por el guion, sin WhatsApp ni Groq. Lo único que sale a la red es Anthropic.
//
// Uso (desde web/backend):
//   node scripts/simular-chats.js --ronda 0 [--solo K1,E1] [--repeticiones 2] [--esfuerzo low|medium|high] [--paralelo 4]
//   node scripts/simular-chats.js --salida <carpeta> --solo N5 --repeticiones 1
//
// Deja en openspec/changes/respuestas-del-bot/simulacion/ronda-<N>/ (o en --salida):
// transcripcion.md, resultados.json y pedido-codex.md. Gasta centavos de Claude.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { prepararEntorno, limitarFetch } from "../src/agente/simulador/chats/entorno.js";

if (existsSync(".env")) process.loadEnvFile(".env");

const argumento = (nombre, porDefecto = null) => {
  const i = process.argv.indexOf(`--${nombre}`);
  return i > 0 ? process.argv[i + 1] : porDefecto;
};
const CAMBIO = path.join("openspec", "changes", "respuestas-del-bot");
const ronda = argumento("ronda");
const salida = argumento("salida") ?? (ronda === null ? null : path.join(CAMBIO, "simulacion", `ronda-${ronda}`));
if (!salida) {
  console.error("Falta --ronda N (o --salida <carpeta>).");
  process.exit(1);
}
const solo = argumento("solo")?.split(",").map((c) => c.trim());
const repeticiones = Number(argumento("repeticiones", 2));
const paralelo = Math.max(1, Number(argumento("paralelo", 1)));
const esfuerzo = argumento("esfuerzo");
if (esfuerzo && !["low", "medium", "high"].includes(esfuerzo)) {
  console.error("--esfuerzo tiene que ser low, medium o high.");
  process.exit(1);
}
if (esfuerzo) process.env.AGENTE_ESFUERZO = esfuerzo;

// Antes de todo: las dos conexiones a agencia_simulacion en localhost o se aborta.
let urls;
try {
  urls = prepararEntorno(process.env);
} catch (err) {
  console.error("Se aborta sin correr nada:", err.message);
  process.exit(1);
}
const guardaDeRed = limitarFetch();

// Las líneas "[agente] herramienta ..." del backend, para anotarlas en cada turno.
const lineasDeHerramientas = [];
for (const metodo of ["info", "log"]) {
  const original = console[metodo].bind(console);
  console[metodo] = (...args) => {
    const texto = args.map(String).join(" ");
    if (texto.startsWith("[agente] herramienta ")) lineasDeHerramientas.push({ texto, sesion: Number(/\(sesión (\d+)\)/.exec(texto)?.[1]), tomada: false });
    else original(...args);
  };
}

let prisma;
let baseAgente;
let codigoDeSalida = 0;
try {
  const { prepararBase } = await import("../src/agente/simulador/masivo/base.js");
  const { DATOS_CATALOGO } = await import("../src/agente/simulador/chats/catalogo.js");
  console.log("Preparando la base agencia_simulacion…");
  await prepararBase(urls, { prohibidas: urls.prohibidas, datos: DATOS_CATALOGO });

  const { crearClienteAnthropic } = await import("../src/lib/anthropic.js");
  const { esfuerzoEfectivo } = await import("../src/agente/agente.js");
  // El nivel que de verdad usa el bot (no lo que se pidió): en producción o con un valor inválido no cambia.
  const esfuerzoUsado = esfuerzoEfectivo();
  ({ prisma } = await import("../src/lib/prisma.js"));
  const { dbAgente } = await import("../src/agente/db.js");
  const { crearBcraSimulado } = await import("../src/agente/simulador/bcra-simulado.js");
  const { leerChats } = await import("../src/agente/simulador/chats/leer.js");
  const { correrChat } = await import("../src/agente/simulador/chats/correr.js");
  const { crearLectorDeGuardado } = await import("../src/agente/simulador/chats/guardado.js");
  const { transcripcionMarkdown, resumir, resumenMarkdown, pedidoCodex } = await import("../src/agente/simulador/chats/informe.js");
  baseAgente = dbAgente();

  const [{ base: baseBackend }] = await prisma.$queryRaw`SELECT DATABASE() AS base`;
  const [{ base: baseDelAgente }] = await baseAgente.$queryRaw`SELECT DATABASE() AS base`;
  if (baseBackend !== "agencia_simulacion" || baseDelAgente !== "agencia_simulacion") {
    throw new Error("Las conexiones no apuntan a agencia_simulacion: se aborta sin correr nada.");
  }

  const todos = leerChats(readFileSync(path.join(CAMBIO, "chats-simulados.md"), "utf8"));
  const chats = todos.filter((c) => !solo || solo.includes(c.codigo));
  const desconocidos = (solo ?? []).filter((c) => !todos.some((t) => t.codigo === c));
  if (desconocidos.length) throw new Error(`No existe(n) el/los chat(s): ${desconocidos.join(", ")}.`);

  // El módulo del recordatorio es de la tarea 9: mientras no exista, las esperas solo adelantan el reloj.
  // Se invoca con los datos de prueba y un envío que solo anota; si devuelve algo, eso se anota; si no, lo "enviado".
  const anthropic = crearClienteAnthropic(); // el mismo cliente que el backend (agrega el workspace)
  const modulo = await import("../src/agente/recordatorio.js").catch(() => null);
  const enviados = [];
  // Envío de prueba: solo anota; nunca sale nada a WhatsApp.
  const enviar = async ({ telefono, texto }) => (enviados.push({ telefono, texto }), { wamid: null });
  const revisarRecordatorios = modulo?.revisarRecordatorios
    ? async ({ ahora, telefono }) => {
        enviados.length = 0;
        const devuelto = await modulo.revisarRecordatorios({ ahora, minutos: 10, root: prisma, dbAgente: baseAgente, anthropic, enviar, soloTelefono: telefono });
        return Array.isArray(devuelto) ? devuelto : enviados.splice(0);
      }
    : undefined;

  const leerGuardado = crearLectorDeGuardado(prisma);
  // Cada turno se queda con las herramientas de las consultas de ese cliente que nadie anotó todavía.
  async function herramientas(telefono) {
    const { cliente_id: clienteId } = await prisma.cliente_canales.findFirstOrThrow({ where: { canal: "whatsapp", identificador: String(telefono) }, select: { cliente_id: true } });
    const sesiones = new Set((await prisma.chat_estado.findMany({ where: { cliente_id: clienteId }, select: { id: true } })).map((s) => s.id));
    const propias = lineasDeHerramientas.filter((l) => !l.tomada && sesiones.has(l.sesion));
    for (const l of propias) l.tomada = true;
    return propias.map((l) => l.texto);
  }

  const deps = {
    root: prisma,
    dbAgente: baseAgente,
    anthropic,
    esperaRafagaMs: 1500,
    pausaRafagaMs: 300,
    // Nunca el BCRA real: los CUIL de los chats son inventados.
    bcra: crearBcraSimulado("verde"),
    leerGuardado,
    herramientas,
    revisarRecordatorios,
  };

  const tareas = chats.flatMap((chat, i) =>
    Array.from({ length: repeticiones }, (_, r) => ({ chat, repeticion: r + 1, telefono: `5490001${String(i * 10 + r).padStart(5, "0")}` }))
  );
  console.log(`Corriendo ${chats.length} chats × ${repeticiones} repeticiones (${paralelo} en paralelo), esfuerzo ${esfuerzoUsado}…`);
  const resultados = new Array(tareas.length);
  let siguiente = 0;
  const trabajador = async () => {
    while (siguiente < tareas.length) {
      const i = siguiente++;
      const { chat, repeticion, telefono } = tareas[i];
      resultados[i] = await correrChat(chat, { telefono, repeticion }, deps);
      const r = resultados[i];
      console.log(`  ${chat.codigo} #${repeticion}: ${r.error ? `ERROR ${r.error}` : r.controles.every((c) => c.ok) ? "controles bien" : "falla algún control"}`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(paralelo, tareas.length) }, trabajador));

  const resumen = resumir(resultados);
  const transcripcion = transcripcionMarkdown(resultados);
  const resumenMd = resumenMarkdown(resumen, { ronda: ronda ?? "(carpeta propia)", esfuerzo: esfuerzoUsado });
  const leerCarpeta = (carpeta) =>
    readdirSync(carpeta, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => path.join(carpeta, d.name, "spec.md"))
      .filter(existsSync)
      .sort();
  const specs = leerCarpeta(path.join(CAMBIO, "specs")).map((ruta) => ({ ruta: path.relative(CAMBIO, ruta).replaceAll("\\", "/"), texto: readFileSync(ruta, "utf8") }));
  const requisitoVigente = readFileSync(path.join("openspec", "specs", "agente-comportamiento", "spec.md"), "utf8");

  mkdirSync(salida, { recursive: true });
  writeFileSync(path.join(salida, "transcripcion.md"), `${transcripcion}\n---\n\n${resumenMd}`);
  writeFileSync(path.join(salida, "resultados.json"), JSON.stringify({ ronda: ronda ?? null, esfuerzo: esfuerzoUsado, resumen, resultados }, null, 2));
  writeFileSync(path.join(salida, "pedido-codex.md"), pedidoCodex({ specs, requisitoVigente, transcripcion }));

  console.log(`\n${resumenMd}\nSalida en ${salida}`);
  const bloqueados = guardaDeRed.intentosBloqueados();
  if (bloqueados.length) console.log(`Atención: se frenaron ${bloqueados.length} intentos de red a ${[...new Set(bloqueados)].join(", ")}.`);
} catch (err) {
  console.error("Los chats simulados se detuvieron:", err?.message ?? err);
  codigoDeSalida = 1;
} finally {
  await prisma?.$disconnect().catch(() => {});
  await baseAgente?.$disconnect().catch(() => {});
  guardaDeRed.restaurar();
}
process.exitCode = codigoDeSalida;
