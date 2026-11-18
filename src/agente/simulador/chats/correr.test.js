import { test } from "node:test";
import assert from "node:assert/strict";
import { correrChat, INICIO_POR_DEFECTO } from "./correr.js";

const chatBase = (pasos, extra = {}) => ({ codigo: "X1", nombre: "Prueba", empieza: null, reglas: "", pasos, debe: [], noDebe: [], controles: [], ...extra });
const mensaje = (texto, extra = {}) => ({ tipo: "mensaje", texto, ...extra });
const GUARDADO = { pago_tipo: "financiado", anticipo: "5.000.000", entrega_usado: null, auto: "69", visita: null, requiere_vendedor: false, permisos: 0, cuil: null };

// Un atender falso: anota cada llamada y responde lo que diga `responder`.
function armar({ responder = (e, n) => ({ texto: `respuesta ${n}`, fotos: [], envios: [{ type: "text" }] }), ...resto } = {}) {
  const llamadas = [];
  const atender = async (entrada, deps) => {
    llamadas.push({ entrada, deps });
    return responder(entrada, llamadas.length, deps);
  };
  return { llamadas, deps: { atender, leerGuardado: async () => ({ guardado: GUARDADO, costoUsd: 0.01 }), pausaRafagaMs: 0, ...resto } };
}

const correr = (chat, deps, opciones = {}) => correrChat(chat, { telefono: "5490001", repeticion: 1, ...opciones }, deps);

test("cada mensaje llama a atender con el teléfono, el nombre SIM y un wamid distinto, y espera la respuesta", async () => {
  const { llamadas, deps } = armar();
  const r = await correr(chatBase([mensaje("hola"), mensaje("chau")]), deps);
  assert.equal(llamadas.length, 2);
  assert.deepEqual(llamadas.map((l) => l.entrada.texto), ["hola", "chau"]);
  assert.ok(llamadas.every((l) => l.entrada.telefono === "5490001" && l.entrada.nombre === "SIM X1"));
  assert.notEqual(llamadas[0].entrada.wamid, llamadas[1].entrada.wamid);
  assert.deepEqual(r.turnos.map((t) => t.de), ["cliente", "bot", "cliente", "bot"]);
  assert.equal(r.turnos[1].texto, "respuesta 1");
});

test("el reloj arranca el lunes 16/11/2026 a las 10 en Argentina y avanza un minuto por turno", async () => {
  const { llamadas, deps } = armar();
  await correr(chatBase([mensaje("a"), mensaje("b"), mensaje("c")]), deps);
  assert.equal(INICIO_POR_DEFECTO.toISOString(), "2026-11-16T13:00:00.000Z");
  assert.deepEqual(llamadas.map((l) => l.entrada.ahora.toISOString()), ["2026-11-16T13:00:00.000Z", "2026-11-16T13:01:00.000Z", "2026-11-16T13:02:00.000Z"]);
});

test("el reloj arranca en `empieza` cuando el chat lo trae", async () => {
  const { llamadas, deps } = armar();
  await correr(chatBase([mensaje("a")], { empieza: new Date("2026-11-11T13:00:00Z") }), deps);
  assert.equal(llamadas[0].entrada.ahora.toISOString(), "2026-11-11T13:00:00.000Z");
});

test("los mensajes seguidos salen en una ráfaga con el mismo ahora, junto con el anterior", async () => {
  const { llamadas, deps } = armar({
    responder: (e, n) => (e.texto === "tres" ? { texto: "una sola respuesta", fotos: [], envios: [{ type: "text" }] } : { juntado: true, texto: null, fotos: [], envios: [] }),
  });
  const r = await correr(chatBase([mensaje("uno"), mensaje("dos", { seguido: true }), mensaje("tres", { seguido: true }), mensaje("otro")]), deps);
  assert.equal(llamadas.length, 4);
  const ahoras = llamadas.slice(0, 3).map((l) => l.entrada.ahora.getTime());
  assert.equal(new Set(ahoras).size, 1);
  assert.ok(llamadas[3].entrada.ahora.getTime() > ahoras[0]);
  // una sola respuesta por la ráfaga y la última del chat
  assert.equal(r.turnos.filter((t) => t.de === "bot" && t.texto === "una sola respuesta").length, 1);
  assert.deepEqual(r.turnos.filter((t) => t.de === "cliente").map((t) => t.textos), [["uno", "dos", "tres"], ["otro"]]);
});

test("el audio llega como ogg y la transcripción es el texto del guion", async () => {
  const { llamadas, deps } = armar({
    responder: async () => ({ texto: "ok", fotos: [], envios: [{ type: "text" }] }),
  });
  await correr(chatBase([{ tipo: "audio", texto: "quería saber el precio del Vento" }]), deps);
  const { entrada, deps: depsAtender } = llamadas[0];
  assert.equal(entrada.audio.media_type, "audio/ogg");
  assert.ok(Buffer.from(entrada.audio.data, "base64").length > 100);
  const t = await depsAtender.transcribir({ buffer: Buffer.alloc(1), mediaType: "audio/ogg" });
  assert.equal(t.texto, "quería saber el precio del Vento");
  assert.ok(t.segundos > 0);
});

test("la espera adelanta el reloj y revisa el recordatorio a los 10 minutos y al final", async () => {
  const revisiones = [];
  const { llamadas, deps } = armar({
    revisarRecordatorios: async ({ ahora }) => {
      revisiones.push(ahora.toISOString());
      return revisiones.length === 1 ? [{ texto: "¿Seguís por ahí?" }] : [];
    },
  });
  const r = await correr(chatBase([mensaje("hola"), { tipo: "espera", minutos: 30 }, mensaje("volví")]), deps);
  // hola a 13:00; el reloj queda en 13:01; la espera de 30 va de 13:01 a 13:31
  assert.deepEqual(revisiones, ["2026-11-16T13:11:00.000Z", "2026-11-16T13:31:00.000Z"]);
  assert.equal(llamadas[1].entrada.ahora.toISOString(), "2026-11-16T13:31:00.000Z");
  const recordatorio = r.turnos.find((t) => t.recordatorio);
  assert.equal(recordatorio.de, "bot");
  assert.equal(recordatorio.texto, "¿Seguís por ahí?");
  assert.deepEqual(r.turnos.map((t) => t.de), ["cliente", "bot", "espera", "bot", "cliente", "bot"]);
});

test("una espera de exactamente 10 minutos revisa una sola vez y una menor, solo al final", async () => {
  const revisiones = [];
  const { deps } = armar({ revisarRecordatorios: async ({ ahora }) => void revisiones.push(ahora.toISOString()) });
  await correr(chatBase([mensaje("hola"), { tipo: "espera", minutos: 10 }, { tipo: "espera", minutos: 5 }]), deps);
  assert.deepEqual(revisiones, ["2026-11-16T13:11:00.000Z", "2026-11-16T13:16:00.000Z"]);
});

test("sin revisarRecordatorios la espera solo adelanta el reloj", async () => {
  const { llamadas, deps } = armar();
  const r = await correr(chatBase([mensaje("hola"), { tipo: "espera", minutos: 2880 }, mensaje("volví")]), deps);
  assert.equal(llamadas[1].entrada.ahora.toISOString(), "2026-11-18T13:01:00.000Z");
  assert.equal(r.turnos.filter((t) => t.recordatorio).length, 0);
});

test("el recordatorio de otro teléfono no entra en la transcripción", async () => {
  const { deps } = armar({
    revisarRecordatorios: async () => [{ telefono: "5490009", texto: "de otro" }, { telefono: "5490001", texto: "mío" }],
  });
  const r = await correr(chatBase([mensaje("hola"), { tipo: "espera", minutos: 10 }]), deps);
  assert.deepEqual(r.turnos.filter((t) => t.recordatorio).map((t) => t.texto), ["mío"]);
});

test("una respuesta con fotos, una reacción y las herramientas quedan en la transcripción", async () => {
  const respuestas = [
    { texto: "Mirá", fotos: ["a", "b", "c", "d"], envios: [{ type: "interactive" }] },
    { texto: null, fotos: [], envios: [{ type: "reaction" }] },
  ];
  const { deps } = armar({ responder: (e, n) => respuestas[n - 1], herramientas: async () => ["[agente] herramienta ver_auto (sesión 1) {}"] });
  const r = await correr(chatBase([mensaje("fotos?"), mensaje("gracias")]), deps);
  const bot = r.turnos.find((t) => t.de === "bot");
  assert.equal(bot.fotos, 4);
  assert.equal(bot.mensajesWA, 1);
  assert.deepEqual(bot.herramientas, ["[agente] herramienta ver_auto (sesión 1) {}"]);
  assert.ok(r.turnos.some((t) => t.de === "reaccion"));
  assert.equal(r.mensajesWhatsApp, 1);
});

test("lee lo guardado y el costo, y aplica los controles al final", async () => {
  const chat = chatBase([mensaje("hola")], {
    controles: [{ tipo: "guardado", dato: "pago_tipo", valor: "financiado" }, { tipo: "prohibido", texto: "respuesta" }],
  });
  const { deps } = armar();
  const r = await correr(chat, deps);
  assert.deepEqual(r.guardado, GUARDADO);
  assert.equal(r.costoUsd, 0.01);
  assert.deepEqual(r.controles.map((c) => c.ok), [true, false]);
  assert.equal(r.codigo, "X1");
  assert.equal(r.repeticion, 1);
});

test("un error de atender queda anotado y corta el chat sin tirar la corrida", async () => {
  const { llamadas, deps } = armar({ responder: () => { throw new Error("se cayó Claude"); } });
  const r = await correr(chatBase([mensaje("hola"), mensaje("chau")]), deps);
  assert.equal(llamadas.length, 1);
  assert.match(r.error, /se cayó Claude/);
});

test("correr un chat no hace ningún fetch (nada llega a WhatsApp) y las deps no traen envío real", async () => {
  const original = globalThis.fetch;
  const pedidos = [];
  globalThis.fetch = async (url) => {
    pedidos.push(String(url));
    throw new Error("sin red");
  };
  try {
    const { llamadas, deps } = armar();
    await correr(chatBase([mensaje("hola"), { tipo: "espera", minutos: 20 }, mensaje("chau")]), deps);
    assert.deepEqual(pedidos.filter((u) => u.includes("graph.facebook.com")), []);
    assert.deepEqual(pedidos, []);
    for (const { deps: d } of llamadas) {
      for (const clave of ["enviar", "enviarWhatsApp", "envioWhatsApp", "crearEnvioWhatsapp"]) assert.equal(d[clave], undefined, clave);
    }
  } finally {
    globalThis.fetch = original;
  }
});

test("cada turno anota el nombre, el pedido y el resultado completo de las herramientas, recortado a 600 caracteres", async () => {
  const { deps } = armar({
    responder: (entrada, n, depsDeAtender) => {
      depsDeAtender.alUsarHerramienta({ nombre: "ver_auto", pedido: { ref: "69" }, resultado: { auto: "x".repeat(2000) }, esError: false });
      depsDeAtender.alUsarHerramienta({ nombre: "horarios_atencion", pedido: {}, resultado: { horarios: [] }, esError: false });
      return { texto: "ok", fotos: [], envios: [{ type: "text" }] };
    },
  });
  const r = await correr(chatBase([mensaje("hola")]), deps);
  const bot = r.turnos.find((t) => t.de === "bot");
  assert.deepEqual(bot.usos.map((u) => u.nombre), ["ver_auto", "horarios_atencion"]);
  assert.deepEqual(bot.usos[0].pedido, { ref: "69" });
  assert.ok(bot.usos[0].resultado.length <= 601, "recortado");
  assert.equal(bot.usos[1].resultado, '{"horarios":[]}');
});

// ── ajustes-por-chats-reales: perfil, fotos y guion del Haiku simulado por turno ──

test("con Perfil:, el nombre del perfil que llega a atender es ese y no el SIM", async () => {
  const { llamadas, deps } = armar();
  await correr(chatBase([mensaje("hola")], { perfil: "Mi Reina" }), deps);
  assert.equal(llamadas[0].entrada.nombre, "Mi Reina");
});

test("un paso de foto llama a atender con una imagen JPEG real en base64 y sin texto", async () => {
  const { llamadas, deps } = armar();
  const r = await correr(chatBase([{ tipo: "foto", descripcion: "el Fox de frente" }]), deps);
  assert.equal(llamadas.length, 1);
  const { imagenes, texto } = llamadas[0].entrada;
  assert.equal(texto ?? "", "");
  assert.equal(imagenes.length, 1);
  assert.equal(imagenes[0].media_type, "image/jpeg");
  const bytes = Buffer.from(imagenes[0].data, "base64");
  assert.deepEqual([...bytes.subarray(0, 3)], [0xff, 0xd8, 0xff], "empieza como un JPEG");
  assert.ok(bytes.length < 5_000_000);
  assert.deepEqual(r.turnos[0], { de: "cliente", tipo: "foto", textos: ["el Fox de frente"], ahora: r.turnos[0].ahora });
});

test("dos fotos seguidas salen en la misma ráfaga, con el mismo ahora", async () => {
  const { llamadas, deps } = armar();
  await correr(chatBase([{ tipo: "foto", descripcion: "frente" }, { tipo: "foto", descripcion: "costado", seguido: true }]), deps);
  assert.equal(llamadas.length, 2);
  assert.equal(llamadas[0].entrada.ahora.getTime(), llamadas[1].entrada.ahora.getTime());
});

// Un modelo por turnos falso que anota qué turnos se abrieron y cerraron.
function modeloEspia({ fallaAlCerrar = null } = {}) {
  const eventos = [];
  return {
    eventos,
    abrirTurno(guion, etiqueta) {
      eventos.push({ abre: etiqueta, guion });
    },
    cerrarTurno() {
      const ultimo = eventos.at(-1)?.abre;
      eventos.push({ cierra: ultimo });
      if (fallaAlCerrar && ultimo === fallaAlCerrar) throw new Error(`el modelo simulado se desfasó en ${ultimo}`);
    },
  };
}

test("con un modelo por turnos, cada turno abre su guion con la etiqueta del chat y del paso, y lo cierra", async () => {
  const modelo = modeloEspia();
  const { deps } = armar({ modelo });
  const g1 = [{ texto: "¿Contado o financiado?" }];
  const g2 = [{ texto: "¿Ya tenés algún auto en mente?" }];
  await correr(chatBase([mensaje("hola", { guion: g1 }), { tipo: "espera", minutos: 10, guion: g2 }]), deps);
  assert.deepEqual(modelo.eventos, [{ abre: "X1 paso 1", guion: g1 }, { cierra: "X1 paso 1" }, { abre: "X1 paso 2", guion: g2 }, { cierra: "X1 paso 2" }]);
});

test("en una ráfaga, el guion del turno es el de sus mensajes en orden, y la etiqueta es la del primero", async () => {
  const modelo = modeloEspia();
  const { deps } = armar({ modelo });
  const a = [{ herramienta: "registrar_calificacion", entrada: {} }];
  const b = [{ texto: "listo" }];
  await correr(chatBase([mensaje("uno", { guion: a }), mensaje("dos", { seguido: true, guion: b })]), deps);
  assert.deepEqual(modelo.eventos[0], { abre: "X1 paso 1", guion: [...a, ...b] });
});

test("un paso sin guion abre su turno con un guion vacío", async () => {
  const modelo = modeloEspia();
  const { deps } = armar({ modelo });
  await correr(chatBase([mensaje("hola")]), deps);
  assert.deepEqual(modelo.eventos[0], { abre: "X1 paso 1", guion: [] });
});

test("si el modelo se desfasa al cerrar un turno, el chat termina con ese error y no sigue", async () => {
  const modelo = modeloEspia({ fallaAlCerrar: "X1 paso 1" });
  const { llamadas, deps } = armar({ modelo });
  const r = await correr(chatBase([mensaje("uno"), mensaje("dos")]), deps);
  assert.match(r.error, /se desfasó en X1 paso 1/);
  assert.equal(llamadas.length, 1, "el segundo mensaje no se manda");
});

test("sin modelo por turnos, el chat corre igual que antes", async () => {
  const { llamadas, deps } = armar();
  const r = await correr(chatBase([mensaje("hola", { guion: [{ texto: "x" }] })]), deps);
  assert.equal(llamadas.length, 1);
  assert.equal(r.error, null);
});

test("integración: con el Claude simulado por turnos como modelo, una llamada de más del código hace fallar el chat con su paso", async () => {
  const { crearClaudeFalsoPorTurnos } = await import("../masivo/claude-falso.js");
  const claude = crearClaudeFalsoPorTurnos();
  // Un atender falso que llama al modelo dos veces, aunque el guion del turno tenga una sola respuesta.
  const atender = async (_entrada, deps) => {
    const r = await deps.anthropic.messages.create({ messages: [] });
    await deps.anthropic.messages.create({ messages: [] }).catch(() => {}); // atender se traga el error y responde el respaldo
    return { texto: r.content[0].text, fotos: [], envios: [{ type: "text" }] };
  };
  const { deps } = armar({ atender, anthropic: claude, modelo: claude });
  const r = await correr(chatBase([mensaje("hola", { guion: [{ texto: "¡Hola!" }] }), mensaje("chau", { guion: [{ texto: "Chau" }] })]), deps);
  assert.match(r.error, /X1 paso 1/);
});

test("integración: con el guion justo, el chat corre sin error y cada turno usa su respuesta", async () => {
  const { crearClaudeFalsoPorTurnos } = await import("../masivo/claude-falso.js");
  const claude = crearClaudeFalsoPorTurnos();
  const atender = async (_entrada, deps) => {
    const r = await deps.anthropic.messages.create({ messages: [] });
    return { texto: r.content[0].text, fotos: [], envios: [{ type: "text" }] };
  };
  const { deps } = armar({ atender, anthropic: claude, modelo: claude });
  const r = await correr(chatBase([mensaje("hola", { guion: [{ texto: "¡Hola!" }] }), mensaje("chau", { guion: [{ texto: "Chau" }] })]), deps);
  assert.equal(r.error, null);
  assert.deepEqual(r.turnos.filter((t) => t.de === "bot").map((t) => t.texto), ["¡Hola!", "Chau"]);
});
