import { test } from "node:test";
import assert from "node:assert/strict";
import { transcripcionMarkdown, resumir, resumenMarkdown, pedidoCodex } from "./informe.js";

const resultado = (extra = {}) => ({
  codigo: "K1",
  nombre: "Pregunta los km",
  repeticion: 1,
  reglas: "agente-comportamiento › Kilómetros sin cargar",
  debe: ["decir que no tiene el dato"],
  noDebe: ["decir 0 km"],
  telefono: "5490001",
  turnos: [
    { de: "cliente", tipo: "mensaje", textos: ["Buenas tardes km?"] },
    { de: "bot", texto: "No lo tengo a mano, ¿venís a verlo?", fotos: 4, recordatorio: false, herramientas: ["[agente] herramienta ver_auto (sesión 3) {}"], mensajesWA: 1 },
    { de: "espera", minutos: 10 },
    { de: "bot", texto: "¿Seguís por ahí?", fotos: 0, recordatorio: true, herramientas: [], mensajesWA: 1 },
    { de: "reaccion", texto: "👍" },
  ],
  guardado: { pago_tipo: "contado", anticipo: null, entrega_usado: false, auto: "69", visita: null, requiere_vendedor: false, permisos: 0, cuil: null },
  costoUsd: 0.0123,
  mensajesWhatsApp: 2,
  controles: [
    { control: { tipo: "prohibido", texto: "0 km" }, ok: true, detalle: null },
    { control: { tipo: "fotos", cantidad: 2 }, ok: false, detalle: "salieron 1 mensajes con fotos y se esperaban 2" },
  ],
  error: null,
  ...extra,
});

test("la transcripción en markdown trae las respuestas, el guardado, las herramientas y los controles con ✅ y ❌", () => {
  const md = transcripcionMarkdown([resultado()]);
  assert.match(md, /## K1 · Pregunta los km/);
  assert.match(md, /repetición 1/);
  assert.match(md, /Buenas tardes km\?/);
  assert.match(md, /No lo tengo a mano, ¿venís a verlo\?/);
  assert.match(md, /4 fotos/);
  assert.match(md, /recordatorio/i);
  assert.match(md, /pasan 10 minutos/);
  assert.match(md, /👍/);
  assert.match(md, /herramienta ver_auto/);
  assert.match(md, /pago_tipo.*contado/);
  assert.match(md, /✅.*prohibido.*0 km/);
  assert.match(md, /❌.*fotos.*2/);
  assert.match(md, /salieron 1 mensajes con fotos/);
  assert.match(md, /decir que no tiene el dato/);
  assert.match(md, /decir 0 km/);
});

test("la transcripción muestra el error de un chat que se cortó", () => {
  assert.match(transcripcionMarkdown([resultado({ error: "se cayó Claude" })]), /se cayó Claude/);
});

test("el resumen cuenta los chats que pasan todos los controles en todas las repeticiones", () => {
  const bien = resultado({ codigo: "A1", controles: [{ control: { tipo: "fotos", cantidad: 0 }, ok: true, detalle: null }] });
  const bien2 = resultado({ codigo: "A1", repeticion: 2, controles: [{ control: { tipo: "fotos", cantidad: 0 }, ok: true, detalle: null }] });
  const mixto = resultado({ codigo: "B1" });
  const mixto2 = resultado({ codigo: "B1", repeticion: 2, controles: [] });
  const conError = resultado({ codigo: "C1", controles: [], error: "x" });
  const r = resumir([bien, bien2, mixto, mixto2, conError]);
  assert.deepEqual(r.chatsQuePasan, ["A1"]);
  assert.deepEqual(r.chatsQueFallan, ["B1", "C1"]);
  assert.equal(r.totalChats, 3);
  assert.equal(r.mensajesWhatsApp, 10);
  assert.ok(Math.abs(r.costoUsd - 0.0615) < 1e-9);
});

test("el resumen en markdown dice cuántos pasan, el costo, los mensajes de WhatsApp y el esfuerzo", () => {
  const md = resumenMarkdown(resumir([resultado()]), { ronda: 0, esfuerzo: "medium" });
  assert.match(md, /ronda 0/i);
  assert.match(md, /medium/);
  assert.match(md, /0 de 1/);
  assert.match(md, /US\$ 0\.0123/);
  assert.match(md, /2 mensajes de WhatsApp/);
  assert.match(md, /K1/);
});

test("el pedido para Codex lleva las instrucciones, los specs, el requisito vigente y la transcripción", () => {
  const md = pedidoCodex({
    specs: [{ ruta: "specs/agente-comportamiento/spec.md", texto: "SPEC NUEVO" }],
    requisitoVigente: "REQUISITO VIGENTE",
    transcripcion: "TRANSCRIPCION",
  });
  assert.match(md, /no ejecutes comandos/i);
  assert.match(md, /"veredicto"/);
  assert.match(md, /"aprueba"/);
  assert.match(md, /severidad/);
  assert.match(md, /specs\/agente-comportamiento\/spec\.md/);
  assert.ok(md.indexOf("SPEC NUEVO") < md.indexOf("REQUISITO VIGENTE"));
  assert.ok(md.indexOf("REQUISITO VIGENTE") < md.indexOf("TRANSCRIPCION"));
});

test("la transcripción muestra debajo de cada respuesta el resultado completo de las herramientas", () => {
  const r = resultado();
  r.turnos[1].usos = [{ nombre: "horarios_atencion", pedido: {}, resultado: '{"horarios":[{"dia":"Lunes","apertura":"08:00"}]}', esError: false }];
  const md = transcripcionMarkdown([r]);
  assert.match(md, /horarios_atencion/);
  assert.match(md, /"apertura":"08:00"/);
});
