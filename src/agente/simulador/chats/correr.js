// Corre un chat simulado por `atenderMensaje` con un reloj simulado y arma su transcripción.
// No importa Prisma ni Claude: el `atender`, la lectura de lo guardado, la revisión de
// recordatorios y la captura de herramientas llegan por `deps`, para probarlo sin red ni base.
import { randomUUID } from "node:crypto";
import { atenderMensaje } from "../../atender.js";
import { notaDeVoz } from "../../ogg-de-prueba.js";
import { aplicarControles } from "./controles.js";

const MIN = 60_000;
const MINUTOS_PARA_RECORDATORIO = 10;
const SEGUNDOS_DE_AUDIO = 3;

// Lunes 16/11/2026 10:00 en Argentina (UTC-3).
export const INICIO_POR_DEFECTO = new Date("2026-11-16T13:00:00.000Z");

const esperar = (ms) => new Promise((listo) => setTimeout(listo, ms));
const cuentaWhatsApp = (r) => (r.envios ?? []).filter((e) => e.type !== "reaction").length;
const soloReaccion = (r) => Array.isArray(r.envios) && r.envios.length > 0 && r.envios.every((e) => e.type === "reaction");

// Los `seguido` van en la misma ráfaga que el mensaje anterior; el audio sale solo.
function agruparPasos(pasos) {
  const grupos = [];
  for (const paso of pasos) {
    const ultimo = grupos.at(-1);
    if (paso.tipo === "mensaje" && paso.seguido && ultimo?.tipo === "rafaga") ultimo.mensajes.push(paso);
    else if (paso.tipo === "mensaje") grupos.push({ tipo: "rafaga", mensajes: [paso] });
    else grupos.push(paso);
  }
  return grupos;
}

// Lo que devuelve la revisión de recordatorios, como mensajes del bot (acepta textos sueltos).
function recordatoriosDe(salida, telefono) {
  return (Array.isArray(salida) ? salida : [])
    .map((item) => (typeof item === "string" ? { texto: item } : item))
    .filter((item) => item && item.texto && (!item.telefono || String(item.telefono) === String(telefono)))
    .map((item) => ({ de: "bot", texto: item.texto, fotos: item.fotos?.length ?? 0, reaccion: false, recordatorio: true, herramientas: [], mensajesWA: 1 }));
}

export async function correrChat(chat, { telefono, repeticion = 1 }, deps) {
  const { atender = atenderMensaje, leerGuardado, revisarRecordatorios, herramientas, pausaRafagaMs = 300, ...depsDeAtender } = deps;
  let textoDelAudio = "";
  // La transcripción de Groq se reemplaza por el texto del guion: nunca hay red.
  const depsDelChat = { ...depsDeAtender, transcribir: async () => ({ texto: textoDelAudio, segundos: SEGUNDOS_DE_AUDIO }) };
  const nombre = `SIM ${chat.codigo}`;
  const turnos = [];
  let reloj = new Date((chat.empieza ?? INICIO_POR_DEFECTO).getTime());
  let error = null;

  const herramientasDelTurno = async () => (herramientas ? await herramientas(telefono) : []);
  const entrada = (extra, ahora) => ({ telefono, nombre, wamid: `sim.${randomUUID()}`, ahora, ...extra });

  async function turnoDeCliente(grupo) {
    const ahora = reloj;
    reloj = new Date(reloj.getTime() + MIN);
    const esAudio = grupo.tipo === "audio";
    turnos.push({ de: "cliente", tipo: esAudio ? "audio" : "mensaje", textos: esAudio ? [grupo.texto] : grupo.mensajes.map((m) => m.texto), ahora });
    let respuestas;
    if (esAudio) {
      textoDelAudio = grupo.texto;
      const audio = { media_type: "audio/ogg", data: notaDeVoz(SEGUNDOS_DE_AUDIO).toString("base64") };
      respuestas = [await atender(entrada({ audio }, ahora), depsDelChat)];
    } else {
      respuestas = await Promise.all(
        grupo.mensajes.map((m, i) => esperar(i * pausaRafagaMs).then(() => atender(entrada({ texto: m.texto }, ahora), depsDelChat)))
      );
    }
    const propias = respuestas.filter((r) => r && !r.duplicado && !r.juntado && !r.pausado);
    const nuevos = [];
    for (const r of propias) {
      if (soloReaccion(r)) nuevos.push({ de: "reaccion", texto: "👍" });
      else if (r.texto || r.fotos?.length) {
        nuevos.push({ de: "bot", texto: r.texto ?? "", fotos: r.fotos?.length ?? 0, reaccion: false, recordatorio: false, herramientas: [], mensajesWA: cuentaWhatsApp(r) });
      }
    }
    const usadas = await herramientasDelTurno();
    const primero = nuevos.find((t) => t.de === "bot") ?? turnos.at(-1);
    primero.herramientas = [...(primero.herramientas ?? []), ...usadas];
    turnos.push(...nuevos);
  }

  // La espera pasa en el reloj; el sistema revisa a los 10 minutos y al final.
  async function espera(minutos) {
    const desde = reloj.getTime();
    turnos.push({ de: "espera", minutos });
    const momentos = [...new Set([...(minutos >= MINUTOS_PARA_RECORDATORIO ? [MINUTOS_PARA_RECORDATORIO] : []), minutos])];
    for (const m of momentos) {
      reloj = new Date(desde + m * MIN);
      if (!revisarRecordatorios) continue;
      const nuevos = recordatoriosDe(await revisarRecordatorios({ ahora: reloj, telefono }), telefono);
      const usadas = await herramientasDelTurno();
      if (nuevos[0]) nuevos[0].herramientas = usadas;
      turnos.push(...nuevos);
    }
    reloj = new Date(desde + minutos * MIN);
  }

  try {
    for (const grupo of agruparPasos(chat.pasos)) {
      if (grupo.tipo === "espera") await espera(grupo.minutos);
      else await turnoDeCliente(grupo);
    }
  } catch (err) {
    error = err?.message ?? String(err);
    turnos.push({ de: "error", texto: error });
  }

  const mensajesBot = turnos.filter((t) => t.de === "bot").map((t) => ({ texto: t.texto, fotos: t.fotos, recordatorio: t.recordatorio }));
  let guardado = null;
  let costoUsd = 0;
  try {
    ({ guardado, costoUsd } = await leerGuardado(telefono));
  } catch (err) {
    error ??= `no se pudo leer lo guardado: ${err?.message ?? err}`;
  }
  const controles = guardado ? aplicarControles(chat, { mensajesBot, guardado }) : [];
  const mensajesWhatsApp = turnos.filter((t) => t.de === "bot").reduce((suma, t) => suma + t.mensajesWA, 0);
  const { codigo, nombre: titulo, reglas, debe, noDebe } = chat;
  return { codigo, nombre: titulo, reglas, debe, noDebe, repeticion, telefono, turnos, guardado, costoUsd, mensajesWhatsApp, controles, error };
}
