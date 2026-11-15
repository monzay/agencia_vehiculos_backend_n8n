import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { leerChats } from "./leer.js";

const RUTA_DOCUMENTO = fileURLToPath(new URL("../../../../openspec/changes/respuestas-del-bot/chats-simulados.md", import.meta.url));

// Arma un documento con un solo chat para probar cada línea por separado.
const chat = (...lineas) => ["## X1 · Prueba", ...lineas].join("\n");

// ── El documento real ──

test("lee los 25 chats del documento real, con códigos únicos", () => {
  const chats = leerChats(readFileSync(RUTA_DOCUMENTO, "utf8"));
  assert.equal(chats.length, 25);
  assert.equal(new Set(chats.map((c) => c.codigo)).size, 25);
  for (const c of chats) assert.ok(c.pasos.length > 0, c.codigo);
});

test("en el documento real E1 tiene un mensaje seguido y P6 un audio", () => {
  const chats = leerChats(readFileSync(RUTA_DOCUMENTO, "utf8"));
  const e1 = chats.find((c) => c.codigo === "E1");
  assert.deepEqual(e1.pasos[2], { tipo: "mensaje", texto: "La entrega minima", seguido: true });
  const p6 = chats.find((c) => c.codigo === "P6");
  assert.equal(p6.pasos[0].tipo, "audio");
});

test("en el documento real R1 espera 10 y 30 minutos y P7 espera 2880 y empieza el 11/11 a las 10 en Argentina", () => {
  const chats = leerChats(readFileSync(RUTA_DOCUMENTO, "utf8"));
  const r1 = chats.find((c) => c.codigo === "R1");
  assert.deepEqual(r1.pasos.filter((p) => p.tipo === "espera").map((p) => p.minutos), [10, 30]);
  const p7 = chats.find((c) => c.codigo === "P7");
  assert.deepEqual(p7.pasos.filter((p) => p.tipo === "espera").map((p) => p.minutos), [2880]);
  assert.equal(p7.empieza.toISOString(), "2026-11-11T13:00:00.000Z");
  assert.equal(chats.find((c) => c.codigo === "K1").empieza, null);
});

// ── Estructura ──

test("ignora lo que está antes del primer chat y los otros encabezados no abren chats", () => {
  const chats = leerChats(["# Título", "## Cómo se lee", "texto suelto", "---", "## K1 · Uno", "Cliente: hola", "# Otra parte", "texto ignorado", "## K2 · Dos", "Cliente: chau"].join("\n"));
  assert.deepEqual(chats.map((c) => [c.codigo, c.nombre]), [["K1", "Uno"], ["K2", "Dos"]]);
});

test("lo que sigue a un encabezado que no es un chat se ignora hasta el próximo chat", () => {
  const chats = leerChats(["## K1 · Uno", "Cliente: hola", "## Catálogo", "esto ya no es del chat", "## K2 · Dos", "Cliente: chau"].join("\n"));
  assert.deepEqual(chats.map((c) => c.pasos.length), [1, 1]);
});

test("las líneas vacías y las --- se ignoran", () => {
  const [c] = leerChats(chat("", "Cliente: hola", "---", "", "Cliente: chau"));
  assert.equal(c.pasos.length, 2);
});

test("lee el código y el nombre del título", () => {
  const [c] = leerChats("## P10 · Después del permiso viene el CUIL\nCliente: hola");
  assert.equal(c.codigo, "P10");
  assert.equal(c.nombre, "Después del permiso viene el CUIL");
});

// ── Pasos ──

test("lee un mensaje del cliente", () => {
  assert.deepEqual(leerChats(chat("Cliente: Hola: ¿qué tal?"))[0].pasos, [{ tipo: "mensaje", texto: "Hola: ¿qué tal?" }]);
});

test("lee un mensaje seguido", () => {
  assert.deepEqual(leerChats(chat("Cliente (seguido): La entrega minima"))[0].pasos, [{ tipo: "mensaje", texto: "La entrega minima", seguido: true }]);
});

test("lee una nota de voz", () => {
  assert.deepEqual(leerChats(chat("Cliente (audio): quería saber el precio"))[0].pasos, [{ tipo: "audio", texto: "quería saber el precio" }]);
});

test("lee las esperas en minutos y en días, en singular y plural", () => {
  const pasos = leerChats(chat("Cliente: hola", "(pasan 10 minutos)", "(pasan 1 minuto)", "(pasan 2 días)", "(pasan 1 día)"))[0].pasos;
  assert.deepEqual(pasos.slice(1), [
    { tipo: "espera", minutos: 10 },
    { tipo: "espera", minutos: 1 },
    { tipo: "espera", minutos: 2880 },
    { tipo: "espera", minutos: 1440 },
  ]);
});

test("mantiene el orden de los pasos", () => {
  const pasos = leerChats(chat("Cliente: a", "(pasan 5 minutos)", "Cliente: b"))[0].pasos;
  assert.deepEqual(pasos.map((p) => p.tipo), ["mensaje", "espera", "mensaje"]);
});

// ── Empieza y Regla ──

test("lee cuándo empieza el chat como hora de Argentina e ignora el nombre del día", () => {
  const [c] = leerChats(chat("Empieza: lunes 16/11/2026 10:00", "Cliente: hola"));
  assert.equal(c.empieza.toISOString(), "2026-11-16T13:00:00.000Z");
  const [otro] = leerChats(chat("Empieza: cualquiera 16/11/2026 10:00", "Cliente: hola"));
  assert.equal(otro.empieza.getTime(), c.empieza.getTime());
});

test("sin línea Empieza, empieza es null", () => {
  assert.equal(leerChats(chat("Cliente: hola"))[0].empieza, null);
});

test("lee la regla tal cual", () => {
  assert.equal(leerChats(chat("Regla: agente › Kilómetros · otra › Cosa", "Cliente: hola"))[0].reglas, "agente › Kilómetros · otra › Cosa");
});

// ── Debe y No debe ──

test("lee las viñetas de Debe y de No debe", () => {
  const [c] = leerChats(chat("Cliente: hola", "", "Debe:", "- una cosa", "- otra", "", "No debe:", "- prohibida"));
  assert.deepEqual(c.debe, ["una cosa", "otra"]);
  assert.deepEqual(c.noDebe, ["prohibida"]);
});

test("sin Debe ni No debe, las listas quedan vacías", () => {
  const [c] = leerChats(chat("Cliente: hola"));
  assert.deepEqual(c.debe, []);
  assert.deepEqual(c.noDebe, []);
  assert.deepEqual(c.controles, []);
});

// ── Controles ──

test("lee prohibido y obligatorio con su texto", () => {
  const [c] = leerChats(chat("Cliente: hola", "Control automático:", '- prohibido: "0 km"', '- obligatorio: "19.800.000"'));
  assert.deepEqual(c.controles, [
    { tipo: "prohibido", texto: "0 km" },
    { tipo: "obligatorio", texto: "19.800.000" },
  ]);
});

test("lee guardado con el dato y el valor", () => {
  const [c] = leerChats(chat("Cliente: hola", "Control automático:", "- guardado: pago_tipo = financiado", "- guardado: entrega_usado = vacío", "- guardado: permisos = 1"));
  assert.deepEqual(c.controles, [
    { tipo: "guardado", dato: "pago_tipo", valor: "financiado" },
    { tipo: "guardado", dato: "entrega_usado", valor: "vacío" },
    { tipo: "guardado", dato: "permisos", valor: "1" },
  ]);
});

test("acepta los ocho datos de guardado", () => {
  const datos = ["pago_tipo", "anticipo", "entrega_usado", "auto", "visita", "requiere_vendedor", "permisos", "cuil"];
  const [c] = leerChats(chat("Cliente: hola", "Control automático:", ...datos.map((d) => `- guardado: ${d} = sí`)));
  assert.deepEqual(c.controles.map((x) => x.dato), datos);
});

test("lee fotos y recordatorios con su cantidad", () => {
  const [c] = leerChats(chat("Cliente: hola", "Control automático:", "- fotos: 1", "- recordatorios: 0"));
  assert.deepEqual(c.controles, [
    { tipo: "fotos", cantidad: 1 },
    { tipo: "recordatorios", cantidad: 0 },
  ]);
});

test("lee los tres controles de sí o no", () => {
  const [c] = leerChats(chat("Cliente: hola", "Control automático:", "- repite pregunta seguida: no", "- cuotas con números: no", "- termina con 👍: no"));
  assert.deepEqual(c.controles, [{ tipo: "repite_pregunta" }, { tipo: "cuotas_con_numeros" }, { tipo: "termina_con_pulgar" }]);
});

// ── Errores con número de línea ──

test("una línea que no encaja en nada falla con su número de línea", () => {
  assert.throws(() => leerChats(["# Título", "", "## K1 · Uno", "Cliente: hola", "esto no es nada"].join("\n")), /línea 5/);
});

test("un control desconocido falla con su número de línea", () => {
  assert.throws(() => leerChats(chat("Cliente: hola", "Control automático:", "- inventado: sí")), /línea 4/);
});

test("un dato de guardado inválido falla con su número de línea", () => {
  assert.throws(() => leerChats(chat("Cliente: hola", "Control automático:", "- guardado: color = rojo")), /línea 4/);
});

test("un chat sin pasos falla con la línea de su título", () => {
  assert.throws(() => leerChats(["intro", "## K1 · Vacío", "Regla: algo", "", "## K2 · Otro", "Cliente: hola"].join("\n")), /línea 2/);
});

test("un código repetido falla con la línea del segundo título", () => {
  assert.throws(() => leerChats(["## K1 · Uno", "Cliente: a", "## K1 · Repetido", "Cliente: b"].join("\n")), /línea 3/);
});

test("una viñeta fuera de Debe, No debe o Control automático falla con su línea", () => {
  assert.throws(() => leerChats(chat("Cliente: hola", "- suelta")), /línea 3/);
});

test("un Empieza con formato inválido falla con su línea", () => {
  assert.throws(() => leerChats(chat("Empieza: mañana", "Cliente: hola")), /línea 2/);
});
