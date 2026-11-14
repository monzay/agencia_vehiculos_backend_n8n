import { test } from "node:test";
import assert from "node:assert/strict";
import { crearClaudeFalso } from "./claude-falso.js";

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
