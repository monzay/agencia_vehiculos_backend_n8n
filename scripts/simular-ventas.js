// Simulador de ventas del agente (herramienta de desarrollo, NO corre en producción).
//
// Cada escenario es un cliente simulado (otro Claude Haiku con una ficha de datos)
// que le escribe al agente por el camino real (orquestador + base local). Al final
// se evalúa qué quedó guardado, si repitió preguntas, si cerró con una visita y
// cuántos mensajes de WhatsApp (los que cobra Meta) mandó el bot.
//
// Uso (desde web/backend):
//   node scripts/simular-ventas.js --etiqueta antes --informe "<ruta.md>" [--solo contado,financia] [--fotos-de-muestra]
//
// Gasta plata real (centavos): las llamadas del agente suman al tope del mes.
// Crea clientes "SIM ..." en la base local; sus ids quedan en la salida JSON.
// --fotos-de-muestra: los autos sin fotos devuelven 4 fotos de muestra (no se
// escribe nada en la base), para poder medir el envío de fotos.
// --semaforo verde|amarillo|rojo|sin_datos|error: lo que contesta el BCRA simulado
// (el simulador nunca consulta el BCRA real).

import { writeFileSync, appendFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { baseAutorizada, destinoDeLaBase } from "../src/lib/base-local.js";

process.loadEnvFile(".env");

// Solo contra la base local (la del backend y la del agente) y fuera de producción, sin override: crea clientes de
// prueba y gasta en Claude.
const basesNoLocales = ["DATABASE_URL", "AGENTE_DATABASE_URL"].filter((nombre) => !baseAutorizada(process.env[nombre]));
if (process.env.NODE_ENV === "production" || basesNoLocales.length) {
  for (const nombre of basesNoLocales) console.error(`${nombre} apunta a ${destinoDeLaBase(process.env[nombre])}, que no es una base local.`);
  console.error("El simulador corre solo contra la base local y fuera de producción.");
  process.exit(1);
}

const { default: Anthropic } = await import("@anthropic-ai/sdk");
const { prisma } = await import("../src/lib/prisma.js");
const { dbAgente } = await import("../src/agente/db.js");
const { atenderMensaje } = await import("../src/agente/atender.js");
const { MODELO } = await import("../src/agente/agente.js");
const { ESCENARIOS } = await import("../src/agente/simulador/escenarios.js");
const { evaluarConversacion } = await import("../src/agente/simulador/evaluar.js");
const { crearBcraSimulado } = await import("../src/agente/simulador/bcra-simulado.js");

const MAX_TURNOS = 12;
const FIN = "FIN";
const PAUSA_RAFAGA_MS = 300; // entre los mensajes de una ráfaga del cliente
const ESPERA_RAFAGA_MS = 1500; // lo que el bot espera para juntarlos (en producción es más)
const FOTOS_MUESTRA = ["vehiculos/muestra-1.jpg", "vehiculos/muestra-2.jpg", "vehiculos/muestra-3.jpg", "vehiculos/muestra-4.jpg"];

const argumento = (nombre, porDefecto = null) => {
  const i = process.argv.indexOf(`--${nombre}`);
  return i > 0 ? process.argv[i + 1] : porDefecto;
};
const esperar = (ms) => new Promise((listo) => setTimeout(listo, ms));

// Doble de prueba: a los autos sin fotos les da fotos de muestra al leerlos.
function conFotosDeMuestra(db) {
  const sinFotos = (f) => !Array.isArray(f) || f.length === 0;
  const completar = (args, auto) => (auto && args?.select?.fotos_json && sinFotos(auto.fotos_json) ? { ...auto, fotos_json: FOTOS_MUESTRA } : auto);
  const autos = (delegado) =>
    new Proxy(delegado, {
      get(d, metodo) {
        if (metodo === "findFirst") return async (args) => completar(args, await d.findFirst(args));
        if (metodo === "findMany") return async (args) => (await d.findMany(args)).map((auto) => completar(args, auto));
        const valor = d[metodo];
        return typeof valor === "function" ? valor.bind(d) : valor;
      },
    });
  return new Proxy(db, {
    get(cliente, prop) {
      const valor = cliente[prop];
      if (prop === "autos") return autos(valor);
      return typeof valor === "function" ? valor.bind(cliente) : valor;
    },
  });
}

const anthropic = new Anthropic();
const baseAgente = dbAgente();
const deps = {
  root: prisma,
  dbAgente: process.argv.includes("--fotos-de-muestra") ? conFotosDeMuestra(baseAgente) : baseAgente,
  anthropic,
  esperaRafagaMs: ESPERA_RAFAGA_MS,
  // Nunca el BCRA real: los CUIL de los clientes simulados son inventados y podrían ser de alguien.
  bcra: crearBcraSimulado(argumento("semaforo", "verde")),
};

function instruccionesDelCliente(escenario) {
  return `Sos ${escenario.nombre}, un cliente argentino que le escribe por WhatsApp a una agencia de autos.
Escribís como en WhatsApp: mensajes cortos e informales, con voseo, a veces sin tildes ni mayúsculas.
${escenario.rafagas ? "Muchas veces mandás lo que querés decir en 2 o 3 mensajes cortitos seguidos en vez de uno. Cuando lo hagas, separalos con ' || ' (ejemplo: 'dale || la pago de contado').\n" : ""}
Tus datos (contestá solo con esto):
${escenario.hechos.map((h) => `- ${h}`).join("\n")}

Reglas:
- Respondé SOLO lo que te preguntan. No adelantes datos que no te pidieron.
- Si te preguntan algo que no está en tus datos, contestá algo breve y coherente.
- Sos el cliente, no un asistente: no ofrezcas ayuda.
- Cuando ya acordaste un día para ir a la agencia, o si te despiden, mandá un agradecimiento cortito (por ejemplo "dale, gracias!") y nada más.
- Si después de agradecer te vuelven a escribir, respondé exactamente ${FIN}.`;
}

// Desde el lado del cliente: lo que escribe el agente es "user" y lo suyo "assistant".
const comoLoVeElCliente = (t) =>
  t.de === "cliente"
    ? { role: "assistant", content: t.crudo }
    : { role: "user", content: t.texto + (t.fotos?.length ? "\n[te mandaron fotos del auto]" : "") };

async function respuestaDelCliente(escenario, turnos) {
  const mensajes = [{ role: "user", content: "(Empezá el chat.)" }, ...turnos.filter((t) => t.de !== "reaccion").map(comoLoVeElCliente)];
  const r = await anthropic.messages.create({
    model: MODELO,
    max_tokens: 400,
    system: instruccionesDelCliente(escenario),
    messages: mensajes,
    output_config: { effort: "low" },
  });
  return r.content.filter((b) => b.type === "text").map((b) => b.text).join(" ").trim();
}

// Lo que cobra Meta por una respuesta: cada envío, salvo las reacciones.
const mensajesWA = (r) => (r.envios ?? []).filter((e) => e.type !== "reaction").length;
const soloReaccion = (r) => Array.isArray(r.envios) && r.envios.length > 0 && r.envios.every((e) => e.type === "reaction");

// Una ráfaga: los mensajes salen casi juntos, como cuando alguien escribe rápido.
const enviarRafaga = (telefono, nombre, partes) =>
  Promise.all(
    partes.map((texto, i) =>
      esperar(i * PAUSA_RAFAGA_MS).then(() => atenderMensaje({ telefono, nombre, wamid: `sim.${randomUUID()}`, texto }, deps))
    )
  );

// La ficha de la persona es la que tiene su número de WhatsApp en cliente_canales.
async function datosGuardados(telefono) {
  const { cliente_id: clienteId } = await prisma.cliente_canales.findUniqueOrThrow({
    where: { canal_identificador: { canal: "whatsapp", identificador: telefono } },
    select: { cliente_id: true },
  });
  const sesion = await prisma.chat_estado.findFirst({
    where: { cliente_id: clienteId },
    orderBy: { id: "desc" },
    include: { vehiculo_cliente: true },
  });
  const usado = sesion?.vehiculo_cliente.find((v) => v.contexto === "trade_in" && !v.deleted_at) ?? null;
  const { _sum } = await prisma.ia_consumos.aggregate({ where: { cliente_id: clienteId }, _sum: { costo_usd: true } });
  return { clienteId, sesion, usado, costoUsd: Number(_sum.costo_usd ?? 0) };
}

async function simular(escenario, indice) {
  const telefono = `549000${String(Date.now()).slice(-6)}${indice}`;
  const turnos = [];
  let crudo = escenario.primerMensaje;
  for (let turno = 0; turno < MAX_TURNOS && crudo && crudo.trim() !== FIN; turno++) {
    const partes = crudo.split("||").map((p) => p.trim()).filter(Boolean);
    turnos.push({ de: "cliente", crudo, texto: partes.join("\n"), partes });
    const respuestas = (await enviarRafaga(telefono, `SIM ${escenario.nombre}`, partes)).filter((r) => r && !r.duplicado && !r.juntado);
    if (respuestas.length && respuestas.every(soloReaccion)) {
      turnos.push({ de: "reaccion", texto: "👍" });
      break;
    }
    for (const r of respuestas) turnos.push({ de: "agente", texto: r.texto ?? "", fotos: r.fotos ?? [], mensajesWA: mensajesWA(r) });
    crudo = await respuestaDelCliente(escenario, turnos);
  }
  const guardado = await datosGuardados(telefono);
  const evaluacion = evaluarConversacion({ turnos, sesion: guardado.sesion, usado: guardado.usado, esperado: escenario.esperado });
  return { escenario: escenario.id, telefono, clienteId: guardado.clienteId, turnos, evaluacion, costoUsd: guardado.costoUsd };
}

const si = (v) => (v ? "✅" : "❌");
const QUIEN = { agente: "Agente", cliente: "Cliente", reaccion: "Agente (reacción 👍, gratis)" };

function informe(etiqueta, resultados) {
  const filas = resultados.map(({ escenario, turnos, evaluacion: e, costoUsd }) =>
    `| ${escenario} | ${turnos.filter((t) => t.de === "agente").length} | ${e.mensajesWhatsApp} | ${e.reacciones} | ${e.datosOk}/${e.datosTotal} | ${e.repeticiones} | ${e.preguntasProhibidas} | ${si(!e.hablaDeCuotas)} | ${si(e.invitaVisita)} | ${si(e.proponeDia)} | ${si(e.mandaUbicacion)} | ${si(e.clasificacionOk)} | US$ ${costoUsd.toFixed(4)} |`
  );
  const totalWA = resultados.reduce((s, r) => s + r.evaluacion.mensajesWhatsApp, 0);
  const faltantes = resultados.map(({ escenario, evaluacion }) => {
    const mal = evaluacion.detalle.filter((d) => !d.ok);
    return `- **${escenario}**: ${mal.length ? mal.map((d) => `${d.campo} (esperado ${JSON.stringify(d.esperado)}, quedó ${JSON.stringify(d.obtenido)})`).join("; ") : "todo bien"}`;
  });
  const charlas = resultados.map(({ escenario, turnos }) =>
    `### ${escenario}\n\n${turnos.map((t) => `> **${QUIEN[t.de]}:** ${t.texto.replace(/\n+/g, " / ")}${t.fotos?.length ? ` [${t.fotos.length} fotos]` : ""}`).join("\n>\n")}`
  );
  return `\n\n## ${etiqueta} — ${new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}\n
| Escenario | Respuestas | Mensajes WhatsApp | Reacciones | Datos guardados | Repeticiones | Preguntó km/estado | Sin cuotas | Invita a la agencia | Propone día | Manda ubicación | Clasificación | Costo IA |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
${filas.join("\n")}

**Mensajes de WhatsApp en total:** ${totalWA} (${(totalWA / resultados.length).toFixed(1)} por charla · US$ ${(totalWA * 0.026).toFixed(3)} a USD 0,026 cada uno).

**Datos que no quedaron bien:**
${faltantes.join("\n")}

${charlas.join("\n\n")}\n`;
}

const solo = argumento("solo")?.split(",");
const escenarios = ESCENARIOS.filter((e) => !solo || solo.includes(e.id));
const resultados = [];
for (const [i, escenario] of escenarios.entries()) {
  console.log(`→ ${escenario.id}…`);
  resultados.push(await simular(escenario, i));
}

const etiqueta = argumento("etiqueta", "simulación");
const salida = argumento("salida", `simulacion-${etiqueta}.json`);
writeFileSync(salida, JSON.stringify(resultados, null, 2));
const rutaInforme = argumento("informe");
if (rutaInforme) appendFileSync(rutaInforme, informe(etiqueta, resultados));
console.log(informe(etiqueta, resultados).split("\n").slice(0, 14).join("\n"));
console.log(`\nClientes creados: ${resultados.map((r) => r.clienteId).join(", ")} · resultados en ${salida}`);
await prisma.$disconnect();
await baseAgente.$disconnect();
