// ajustes-por-chats-reales: el script de chats simulados nunca usa la API real de Claude.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const fuente = readFileSync(new URL("./simular-chats.js", import.meta.url), "utf8");
const imports = [...fuente.matchAll(/^import\s.+?from\s+"([^"]+)";?$/gm)].map((m) => m[1]);

test("lo primero que importa el script es la barrera de red", () => {
  assert.ok(imports.length > 0);
  assert.match(imports[0], /red-precarga\.js$/);
});

test("el script no crea el cliente real de Anthropic: usa el Claude simulado por turnos", () => {
  assert.doesNotMatch(fuente, /crearClienteAnthropic/);
  assert.doesNotMatch(fuente, /lib\/anthropic\.js/);
  assert.match(fuente, /crearClaudeFalsoPorTurnos/);
});

test("el script verifica que no haya claves de APIs reales antes de correr", () => {
  assert.match(fuente, /verificarSinClaves/);
});

test("el script falla si hubo algún intento de conexión fuera de la máquina", () => {
  assert.match(fuente, /intentos\(\)/);
});

test("el script verifica las claves antes de preparar la base", () => {
  const verifica = fuente.indexOf("verificarSinClaves(");
  const base = fuente.indexOf("prepararBase(");
  assert.ok(verifica > -1 && base > -1);
  assert.ok(verifica < base, "verificarSinClaves tiene que ir antes que prepararBase");
});

test("el código de salida del script sale de codigoDeSalida", () => {
  assert.match(fuente, /codigoDeSalida\(/);
});

test("el script exige el Blob simulado (exigirBlobSimulado) antes de preparar la base: sin eso no corre", () => {
  const exige = fuente.indexOf("exigirBlobSimulado(");
  const base = fuente.indexOf("prepararBase(");
  assert.ok(exige > -1, "el script llama a exigirBlobSimulado");
  assert.ok(exige < base, "exigirBlobSimulado va antes que prepararBase");
});
