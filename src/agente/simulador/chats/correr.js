// Corre un chat simulado por `atenderMensaje` con un reloj simulado y arma su transcripción.
// No importa Prisma ni Claude: el `atender`, la lectura de lo guardado, la revisión de
// recordatorios y la captura de herramientas llegan por `deps`, para probarlo sin red ni base.
import { randomUUID } from "node:crypto";
import { atenderMensaje } from "../../atender.js";
import { notaDeVoz } from "../../ogg-de-prueba.js";
import { fotoDePrueba } from "../../jpeg-de-prueba.js";
import { aplicarControles } from "./controles.js";

const MIN = 60_000;
const MINUTOS_PARA_RECORDATORIO = 10;
const SEGUNDOS_DE_AUDIO = 3;
const MAX_RESULTADO = 600;

// Lunes 16/11/2026 10:00 en Argentina (UTC-3).
export const INICIO_POR_DEFECTO = new Date("2026-11-16T13:00:00.000Z");

const esperar = (ms) => new Promise((listo) => setTimeout(listo, ms));
const cuentaWhatsApp = (r) => (r.envios ?? []).filter((e) => e.type !== "reaction").length;
const soloReaccion = (r) => Array.isArray(r.envios) && r.envios.length > 0 && r.envios.every((e) => e.type === "reaction");

// Los `seguido` van en la misma ráfaga que el paso anterior (mensajes y fotos); el audio sale solo.
// Cada grupo anota el número (desde 1) de su primer paso y el guion del modelo de todos sus pasos.
function agruparPasos(pasos) {
  const grupos = [];
  pasos.forEach((paso, i) => {
    const ultimo = grupos.at(-1);
    const esRafaga = paso.tipo === "mensaje" || paso.tipo === "foto";
    let grupo;
    if (esRafaga && paso.seguido && ultimo?.tipo === "rafaga") {
      ultimo.mensajes.push(paso);
      grupo = ultimo;
    } else if (esRafaga) {
      grupo = { tipo: "rafaga", mensajes: [paso], numero: i + 1, guion: [] };
      grupos.push(grupo);
    } else {
      grupo = { ...paso, numero: i + 1, guion: [] };
      grupos.push(grupo);
    }
    grupo.guion.push(...(paso.guion ?? []));
  });
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
  const { atender = atenderMensaje, leerGuardado, revisarRecordatorios, herramientas, pausaRafagaMs = 300, modelo, ...depsDeAtender } = deps;
  let textoDelAudio = "";
  // La transcripción de Groq se reemplaza por el texto del guion: nunca hay red.
  // Lo que usó el bot en el turno, con el resultado entero (recortado): lo registra el gancho del orquestador.
  const usosPendientes = [];
  const alUsarHerramienta = ({ nombre, pedido, resultado, esError }) => {
    const texto = typeof resultado === "string" ? resultado : JSON.stringify(resultado ?? null);
    usosPendientes.push({ nombre, pedido, resultado: texto.length > MAX_RESULTADO ? `${texto.slice(0, MAX_RESULTADO)}…` : texto, esError });
  };
  const depsDelChat = { ...depsDeAtender, alUsarHerramienta, transcribir: async () => ({ texto: textoDelAudio, segundos: SEGUNDOS_DE_AUDIO }) };
  const nombre = chat.perfil || `SIM ${chat.codigo}`;
  const turnos = [];
  let reloj = new Date((chat.empieza ?? INICIO_POR_DEFECTO).getTime());
  let error = null;

  const herramientasDelTurno = async () => (herramientas ? await herramientas(telefono) : []);
  const entrada = (extra, ahora) => ({ telefono, nombre, wamid: `sim.${randomUUID()}`, ahora, ...extra });

  async function turnoDeCliente(grupo) {
    const ahora = reloj;
    reloj = new Date(reloj.getTime() + MIN);
    const esAudio = grupo.tipo === "audio";
    const soloFotos = !esAudio && grupo.mensajes.every((m) => m.tipo === "foto");
    const tipo = esAudio ? "audio" : soloFotos ? "foto" : "mensaje";
    turnos.push({ de: "cliente", tipo, textos: esAudio ? [grupo.texto] : grupo.mensajes.map((m) => m.texto ?? m.descripcion), ahora });
    let respuestas;
    if (esAudio) {
      textoDelAudio = grupo.texto;
      const audio = { media_type: "audio/ogg", data: notaDeVoz(SEGUNDOS_DE_AUDIO).toString("base64") };
      respuestas = [await atender(entrada({ audio }, ahora), depsDelChat)];
    } else {
      respuestas = await Promise.all(
        grupo.mensajes.map((m, i) =>
          esperar(i * pausaRafagaMs).then(() => atender(entrada(m.tipo === "foto" ? { imagenes: [{ media_type: "image/jpeg", data: fotoDePrueba().toString("base64") }] } : { texto: m.texto }, ahora), depsDelChat))
        )
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
    primero.usos = usosPendientes.splice(0);
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
      // Con el modelo simulado por turnos, cada grupo abre su guion y lo cierra: si el código
      // llamó de más o de menos al modelo, el cierre falla y el chat termina ahí.
      modelo?.abrirTurno(grupo.guion, `${chat.codigo} paso ${grupo.numero}`);
      if (grupo.tipo === "espera") await espera(grupo.minutos);
      else await turnoDeCliente(grupo);
      modelo?.cerrarTurno();
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
