// ajustes-por-chats-reales: ningún test puede salir de la máquina. `npm test` precarga la barrera
// (`node --import ./src/agente/simulador/masivo/red-precarga.js --test`) antes de cargar el backend.
import { test } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";

const codigoDe = (err) => err?.code ?? err?.cause?.code;

test("la suite corre con la red cortada (npm test precarga la barrera)", () => {
  assert.equal(globalThis.__RED_CORTADA__, true, "corré los tests con npm test: precarga la barrera de red");
});

// Sin la barrera, estos dos ni siquiera intentan conectarse: nunca se contacta una API real desde un test.
const sinBarrera = () => globalThis.__RED_CORTADA__ !== true;

test("con la barrera, un fetch a Anthropic se bloquea", { skip: sinBarrera() && "sin la barrera precargada no se intenta (corré npm test)" }, async () => {
  await assert.rejects(() => fetch("https://api.anthropic.com/v1/messages", { method: "POST" }), (err) => codigoDe(err) === "ERED_CORTADA");
});

test("con la barrera, un socket a Anthropic se bloquea", { skip: sinBarrera() && "sin la barrera precargada no se intenta (corré npm test)" }, async () => {
  const err = await new Promise((listo) => {
    const s = net.connect({ host: "api.anthropic.com", port: 443 });
    s.on("error", listo);
    s.on("connect", () => {
      s.destroy();
      listo(null);
    });
  });
  assert.equal(codigoDe(err), "ERED_CORTADA");
});

test("con la barrera, la máquina local sigue andando", async () => {
  const servidor = net.createServer((s) => s.end("ok"));
  await new Promise((listo) => servidor.listen(0, "127.0.0.1", listo));
  const { port } = servidor.address();
  const recibido = await new Promise((listo, falla) => {
    const s = net.connect({ host: "127.0.0.1", port });
    let datos = "";
    s.on("data", (d) => (datos += d));
    s.on("end", () => listo(datos));
    s.on("error", falla);
  });
  servidor.close();
  assert.equal(recibido, "ok");
});

test("con la barrera, cada intento bloqueado suma al contador que lee el script", { skip: sinBarrera() && "sin la barrera precargada no se intenta (corré npm test)" }, async () => {
  const barrera = globalThis.__RED_BARRERA__;
  assert.equal(typeof barrera?.intentos, "function", "la precarga deja la barrera en globalThis.__RED_BARRERA__");
  const antes = barrera.intentos();
  await assert.rejects(() => fetch("https://api.groq.com/x"), (err) => codigoDe(err) === "ERED_CORTADA");
  const err = await new Promise((listo) => {
    const s = net.connect({ host: "graph.facebook.com", port: 443 });
    s.on("error", listo);
    s.on("connect", () => (s.destroy(), listo(new Error("se conectó: la barrera no bloqueó"))));
  });
  assert.equal(codigoDe(err), "ERED_CORTADA");
  assert.equal(barrera.intentos() - antes, 2);
});
