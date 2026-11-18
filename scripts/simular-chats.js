// Chats simulados del bot. Herramienta de desarrollo: NO corre en producción.
//
// Lee src/agente/simulador/chats/chats-simulados.md, arma la base local `agencia_simulacion`
// de cero con el catálogo del documento y le manda cada chat al bot por el camino real
// (`atenderMensaje`). El modelo es un Haiku 5.5 SIMULADO (`crearClaudeFalsoPorTurnos`): responde el
// guion que trae cada paso del documento (`Modelo:` / `Modelo (herramienta):`). Lo demás es de prueba:
// BCRA simulado, audios transcriptos por el guion, sin WhatsApp, Groq ni Blob. Nunca sale nada a la
// red: la barrera de red se precarga primero y la corrida falla si hubo un solo intento de salir.
//
// Uso (desde web/backend):
//   node scripts/simular-chats.js --ronda 0 [--solo K1,E1] [--repeticiones 2] [--esfuerzo low|medium|high] [--cambio <nombre>]
//   node scripts/simular-chats.js --salida <carpeta> --solo N5 --repeticiones 1
//
// Deja en simulacion/chats/ronda-<N>/ (dentro de web/backend, ignorada por git; o en --salida):
// transcripcion.md, resultados.json y pedido-codex.md. No gasta nada: no hay API real.

// Lo primero de todo: corta la red antes de cargar cualquier otro módulo (deja globalThis.__RED_BARRERA__).
import * as redPrecarga from "../src/agente/simulador/masivo/red-precarga.js";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { crearClaudeFalsoPorTurnos } from "../src/agente/simulador/masivo/claude-falso.js";
import { prepararEntorno, limitarFetch, verificarSinClaves, codigoDeSalida } from "../src/agente/simulador/chats/entorno.js";

if (existsSync(".env")) process.loadEnvFile(".env");

if (!redPrecarga || globalThis.__RED_CORTADA__ !== true) {
  console.error("La barrera de red no quedó puesta: se aborta sin correr nada.");
  process.exit(1);
}

const argumento = (nombre, porDefecto = null) => {
  const i = process.argv.indexOf(`--${nombre}`);
  return i > 0 ? process.argv[i + 1] : porDefecto;
};
const DOCUMENTO = path.join("src", "agente", "simulador", "chats", "chats-simulados.md");
// Cambio OpenSpec en curso (opcional, --cambio <nombre>): sus deltas de specs van en el pedido a Codex.
const CAMBIO = argumento("cambio") ? path.join("openspec", "changes", argumento("cambio")) : null;
const ronda = argumento("ronda");
const salida = argumento("salida") ?? (ronda === null ? null : path.join("simulacion", "chats", `ronda-${ronda}`));
if (!salida) {
  console.error("Falta --ronda N (o --salida <carpeta>).");
  process.exit(1);
}
const solo = argumento("solo")?.split(",").map((c) => c.trim());
const repeticiones = Number(argumento("repeticiones", 1));
// El Haiku simulado lleva un solo guion abierto a la vez: los chats corren de a uno.
if (Number(argumento("paralelo", 1)) > 1) console.log("--paralelo se ignora: el modelo simulado por turnos corre un chat a la vez.");
const paralelo = 1;
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
// prepararEntorno vació las claves que trae el .env de desarrollo; acá se confirma que no quedó ninguna con
// valor (si quedara, se aborta antes de tocar la base). La barrera de red corta igual cualquier salida.
try {
  verificarSinClaves(process.env);
} catch (err) {
  console.error("Se aborta sin correr nada:", err.message);
  process.exit(1);
}
// Las fotos del usado se guardan en disco local (Blob simulado): sin BLOB_SIMULADO=1 o con token real, no corre.
try {
  const { exigirBlobSimulado } = await import("../src/lib/blob-privado.js");
  exigirBlobSimulado(process.env);
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
let error = null;
try {
  const { prepararBase } = await import("../src/agente/simulador/masivo/base.js");
  const { DATOS_CATALOGO } = await import("../src/agente/simulador/chats/catalogo.js");
  console.log("Preparando la base agencia_simulacion…");
  await prepararBase(urls, { prohibidas: urls.prohibidas, datos: DATOS_CATALOGO });

  const { esfuerzoEfectivo } = await import("../src/agente/agente.js");
  // El nivel que de verdad usa el bot (no lo que se pidió): en producción o con un valor inválido no cambia.
  const esfuerzoUsado = esfuerzoEfectivo();
  ({ prisma } = await import("../src/lib/prisma.js"));
  const { dbAgente } = await import("../src/agente/db.js");
  const { crearBcraSimulado } = await import("../src/agente/simulador/bcra-simulado.js");
  const { leerChats } = await import("../src/agente/simulador/chats/leer.js");
  const { correrChat } = await import("../src/agente/simulador/chats/correr.js");
  const { crearLectorDeGuardado } = await import("../src/agente/simulador/chats/guardado.js");
  const { traeCuil, crearExclusion } = await import("../src/agente/simulador/chats/cuil.js");
  const unoConCuil = crearExclusion(); // los chats con CUIL usan el mismo: de a uno
  const { transcripcionMarkdown, resumir, resumenMarkdown, pedidoCodex } = await import("../src/agente/simulador/chats/informe.js");
  baseAgente = dbAgente();

  const [{ base: baseBackend }] = await prisma.$queryRaw`SELECT DATABASE() AS base`;
  const [{ base: baseDelAgente }] = await baseAgente.$queryRaw`SELECT DATABASE() AS base`;
  if (baseBackend !== "agencia_simulacion" || baseDelAgente !== "agencia_simulacion") {
    throw new Error("Las conexiones no apuntan a agencia_simulacion: se aborta sin correr nada.");
  }

  const todos = leerChats(readFileSync(DOCUMENTO, "utf8"));
  const conGuion = (c) => c.pasos.some((p) => p.guion?.length);
  const sinGuion = todos.filter((c) => !conGuion(c) && (!solo || solo.includes(c.codigo)));
  if (sinGuion.length) {
    console.log(`Se saltean ${sinGuion.length} chats sin guion del modelo (necesitan el Haiku real): ${sinGuion.map((c) => c.codigo).join(", ")}.`);
  }
  const chats = todos.filter((c) => conGuion(c) && (!solo || solo.includes(c.codigo)));
  const desconocidos = (solo ?? []).filter((c) => !todos.some((t) => t.codigo === c));
  if (desconocidos.length) throw new Error(`No existe(n) el/los chat(s): ${desconocidos.join(", ")}.`);

  // El módulo del recordatorio es de la tarea 9: mientras no exista, las esperas solo adelantan el reloj.
  // Se invoca con los datos de prueba y un envío que solo anota; si devuelve algo, eso se anota; si no, lo "enviado".
  // El Haiku 5.5 simulado: responde el guion de cada paso. Es el `anthropic` del bot, del recordatorio y el modelo por turnos.
  const modelo = crearClaudeFalsoPorTurnos();
  const modulo = await import("../src/agente/recordatorio.js").catch(() => null);
  const enviados = [];
  // Envío de prueba: solo anota; nunca sale nada a WhatsApp.
  const enviar = async ({ telefono, texto }) => (enviados.push({ telefono, texto }), { wamid: null });
  const revisarRecordatorios = modulo?.revisarRecordatorios
    ? async ({ ahora, telefono }) => {
        enviados.length = 0;
        const devuelto = await modulo.revisarRecordatorios({ ahora, minutos: 10, root: prisma, dbAgente: baseAgente, anthropic: modelo, enviar, soloTelefono: telefono });
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
    anthropic: modelo,
    modelo,
    esperaRafagaMs: 1500,
    pausaRafagaMs: 300,
    // Nunca el BCRA real: los CUIL de los chats son inventados.
    bcra: crearBcraSimulado("verde"),
    leerGuardado,
    revisarRecordatorios,
  };

  const tareas = chats.flatMap((chat, i) =>
    Array.from({ length: repeticiones }, (_, r) => ({ chat, repeticion: r + 1, telefono: `5490001${String(i * 10 + r).padStart(5, "0")}` }))
  );
  console.log(`Corriendo ${chats.length} chats × ${repeticiones} repeticiones (de a uno), esfuerzo ${esfuerzoUsado}…`);
  const resultados = new Array(tareas.length);
  let siguiente = 0;
  const trabajador = async () => {
    while (siguiente < tareas.length) {
      const i = siguiente++;
      const { chat, repeticion, telefono } = tareas[i];
      const correr = () => correrChat(chat, { telefono, repeticion }, deps);
      // El backend guarda el CUIL en la ficha y no deja usar el de otra: se libera al terminar (base de simulación, verificada arriba).
      const conCuil = async () => {
        try {
          return await correr();
        } finally {
          await prisma.clientes.updateMany({ where: { cuil: { not: null } }, data: { cuil: null } });
        }
      };
      resultados[i] = await (traeCuil(chat) ? unoConCuil(conCuil) : correr());
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
  const specs = (CAMBIO && existsSync(path.join(CAMBIO, "specs")) ? leerCarpeta(path.join(CAMBIO, "specs")) : []).map((ruta) => ({ ruta: path.relative(CAMBIO, ruta).replaceAll("\\", "/"), texto: readFileSync(ruta, "utf8") }));
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
  error = err ?? new Error("falló");
} finally {
  await prisma?.$disconnect().catch(() => {});
  await baseAgente?.$disconnect().catch(() => {});
  guardaDeRed.restaurar();
}
// Los intentos de conexión fuera de la máquina tienen que ser 0: con uno solo, la corrida falla.
const intentosDeRed = globalThis.__RED_BARRERA__?.intentos();
console.log(`Intentos de conexión fuera de la máquina: ${intentosDeRed ?? "sin dato"}`);
process.exitCode = codigoDeSalida({ error, intentosDeRed });
