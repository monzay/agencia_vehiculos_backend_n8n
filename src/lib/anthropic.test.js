import { test } from "node:test";
import assert from "node:assert/strict";
import { opcionesAnthropic } from "./anthropic.js";

test("con ANTHROPIC_WORKSPACE_ID manda el header del workspace en cada llamada", () => {
  assert.deepEqual(opcionesAnthropic({ ANTHROPIC_WORKSPACE_ID: "wrkspc_01ABC" }), {
    defaultHeaders: { "anthropic-workspace-id": "wrkspc_01ABC" },
  });
});

test("sin ANTHROPIC_WORKSPACE_ID (una clave común de workspace) no agrega nada", () => {
  assert.deepEqual(opcionesAnthropic({}), {});
  assert.deepEqual(opcionesAnthropic({ ANTHROPIC_WORKSPACE_ID: "   " }), {});
});

test("un ID que no tiene forma de workspace se rechaza al arrancar, no en cada mensaje", () => {
  for (const malo of ["wrkspc_01ABCCopiado mal", "123", "wrkspc_", "wrkspc_01AB\nX-Otro: 1"]) {
    assert.throws(() => opcionesAnthropic({ ANTHROPIC_WORKSPACE_ID: malo }), /ANTHROPIC_WORKSPACE_ID/, `con ${JSON.stringify(malo)}`);
  }
});
