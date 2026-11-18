import { test } from "node:test";
import assert from "node:assert/strict";
import { crearClaudeFalso, crearClaudeFalsoPorTurnos } from "./claude-falso.js";

test("una respuesta de texto sale como end_turn con un bloque text", async () => {
  const claude = crearClaudeFalso([{ texto: "Hola, ¿cómo andás?" }]);
  const r = await claude.messages.create({ system: "s", messages: [] });
  assert.equal(r.stop_reason, "end_turn");
  assert.deepEqual(r.content, [{ type: "text", text: "Hola, ¿cómo andás?" }]);
});

test("una herramienta sale como tool_use con id, name e input", async () => {
  const claude = crearClaudeFalso([{ herramienta: "registrar_calificacion", entrada: { auto_ref: "13" } }]);
  const r = await claude.messages.create({ system: "s", messages: [] });
  assert.equal(r.stop_reason, "tool_use");
  assert.equal(r.content.length, 1);
  const [bloque] = r.content;
  assert.equal(bloque.type, "tool_use");
  assert.equal(bloque.name, "registrar_calificacion");
  assert.deepEqual(bloque.input, { auto_ref: "13" });
  assert.equal(typeof bloque.id, "string");
  assert.ok(bloque.id.length > 0);
});

test("cada tool_use tiene un id distinto", async () => {
  const claude = crearClaudeFalso([
    { herramienta: "a", entrada: {} },
    { herramienta: "a", entrada: {} },
  ]);
  const uno = await claude.messages.create({ messages: [] });
  const dos = await claude.messages.create({ messages: [] });
  assert.notEqual(uno.content[0].id, dos.content[0].id);
});

test("siempre trae usage con ceros", async () => {
  const claude = crearClaudeFalso([{ texto: "a" }, { herramienta: "x", entrada: {} }, {}]);
  for (let i = 0; i < 4; i++) {
    const r = await claude.messages.create({ messages: [] });
    assert.ok(r.usage, "tiene usage");
    assert.equal(r.usage.input_tokens, 0);
    assert.equal(r.usage.output_tokens, 0);
    for (const [clave, valor] of Object.entries(r.usage)) assert.equal(valor, 0, clave);
  }
});

test("responde en el orden del guion, una por llamada", async () => {
  const claude = crearClaudeFalso([{ texto: "uno" }, { herramienta: "h", entrada: { a: 1 } }, { texto: "tres" }]);
  const r1 = await claude.messages.create({ messages: [] });
  const r2 = await claude.messages.create({ messages: [] });
  const r3 = await claude.messages.create({ messages: [] });
  assert.equal(r1.content[0].text, "uno");
  assert.equal(r2.content[0].name, "h");
  assert.equal(r3.content[0].text, "tres");
});

test("si el guion se termina, responde el respaldo", async () => {
  const claude = crearClaudeFalso([{ texto: "uno" }]);
  await claude.messages.create({ messages: [] });
  const r = await claude.messages.create({ messages: [] });
  assert.equal(r.stop_reason, "end_turn");
  assert.deepEqual(r.content, [{ type: "text", text: "Dale, te paso con un asesor." }]);
  assert.equal(r.usage.input_tokens, 0);
});

test("un guion vacío responde siempre el respaldo", async () => {
  const claude = crearClaudeFalso([]);
  const r = await claude.messages.create({ messages: [] });
  assert.equal(r.content[0].text, "Dale, te paso con un asesor.");
});

test("guarda los params de cada llamada, system y messages incluidos", async () => {
  const claude = crearClaudeFalso([{ texto: "a" }, { texto: "b" }]);
  const p1 = { system: "reglas", messages: [{ role: "user", content: "hola" }], model: "x" };
  const p2 = { system: "reglas", messages: [{ role: "user", content: "chau" }] };
  await claude.messages.create(p1);
  await claude.messages.create(p2);
  assert.equal(claude.llamadas.length, 2);
  assert.equal(claude.llamadas[0].system, "reglas");
  assert.deepEqual(claude.llamadas[0].messages, p1.messages);
  assert.deepEqual(claude.llamadas[1].messages, p2.messages);
});

test("cuenta también las llamadas que se atienden con el respaldo", async () => {
  const claude = crearClaudeFalso([]);
  await claude.messages.create({ messages: [] });
  await claude.messages.create({ messages: [] });
  assert.equal(claude.llamadas.length, 2);
});

// ── Por turnos (ajustes-por-chats-reales): el guion va por mensaje del cliente y no se desfasa ──

test("por turnos: un turno con una herramienta y un texto consume exactamente esas dos respuestas", async () => {
  const claude = crearClaudeFalsoPorTurnos();
  claude.abrirTurno([{ herramienta: "registrar_calificacion", entrada: { pago_tipo: "financiado" } }, { texto: "¿Con cuánto de anticipo contás?" }], "X1 paso 2");
  const a = await claude.messages.create({ messages: [] });
  const b = await claude.messages.create({ messages: [] });
  assert.equal(a.stop_reason, "tool_use");
  assert.equal(a.content[0].name, "registrar_calificacion");
  assert.deepEqual(a.content[0].input, { pago_tipo: "financiado" });
  assert.equal(b.stop_reason, "end_turn");
  assert.deepEqual(b.content, [{ type: "text", text: "¿Con cuánto de anticipo contás?" }]);
  assert.doesNotThrow(() => claude.cerrarTurno());
});

test("por turnos: una llamada de más falla nombrando el paso y no toma la respuesta del turno siguiente", async () => {
  const claude = crearClaudeFalsoPorTurnos();
  claude.abrirTurno([{ texto: "uno" }], "X1 paso 1");
  await claude.messages.create({ messages: [] });
  await assert.rejects(() => claude.messages.create({ messages: [] }), /X1 paso 1/);
  // Aunque el código de afuera se trague el error (atender responde el respaldo), el cierre del turno lo dice.
  assert.throws(() => claude.cerrarTurno(), /X1 paso 1/);
  claude.abrirTurno([{ texto: "dos" }], "X1 paso 2");
  const r = await claude.messages.create({ messages: [] });
  assert.equal(r.content[0].text, "dos");
  assert.doesNotThrow(() => claude.cerrarTurno());
});

test("por turnos: si sobran respuestas del guion, cerrarTurno falla nombrando el paso y cuántas sobraron", async () => {
  const claude = crearClaudeFalsoPorTurnos();
  claude.abrirTurno([{ texto: "uno" }, { texto: "dos" }], "X9 paso 7");
  await claude.messages.create({ messages: [] });
  assert.throws(() => claude.cerrarTurno(), (err) => /X9 paso 7/.test(err.message) && /1/.test(err.message));
});

test("por turnos: un turno sin guion y sin llamadas cierra bien (una espera sin recordatorio)", () => {
  const claude = crearClaudeFalsoPorTurnos();
  claude.abrirTurno([], "X14 paso 3");
  assert.doesNotThrow(() => claude.cerrarTurno());
});

test("por turnos: sin un turno abierto, una llamada falla", async () => {
  const claude = crearClaudeFalsoPorTurnos();
  await assert.rejects(() => claude.messages.create({ messages: [] }));
});

test("por turnos: lo que sobró de un turno no pasa al siguiente", async () => {
  const claude = crearClaudeFalsoPorTurnos();
  claude.abrirTurno([{ texto: "sobra" }], "X1 paso 1");
  assert.throws(() => claude.cerrarTurno());
  claude.abrirTurno([], "X1 paso 2");
  await assert.rejects(() => claude.messages.create({ messages: [] }), /X1 paso 2/);
});

test("por turnos: anota cada llamada con los parámetros que mandó el código, y el uso de tokens es 0", async () => {
  const claude = crearClaudeFalsoPorTurnos();
  claude.abrirTurno([{ texto: "hola" }], "X1 paso 1");
  const r = await claude.messages.create({ system: "s", messages: [{ role: "user", content: "hola" }] });
  assert.equal(claude.llamadas.length, 1);
  assert.equal(claude.llamadas[0].system, "s");
  assert.equal(r.usage.input_tokens, 0);
  assert.equal(r.usage.output_tokens, 0);
});
