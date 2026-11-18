import { test } from "node:test";
import assert from "node:assert/strict";
import { prepararEntorno, limitarFetch, verificarSinClaves, codigoDeSalida } from "./entorno.js";

const LOCAL = {
  DATABASE_URL: "mysql://root:clave@localhost:3306/agencia",
  AGENTE_DATABASE_URL: "mysql://agente_ia:otra@localhost:3306/agencia",
  WA_TOKEN: "token-real",
  WA_PHONE_NUMBER_ID: "123",
  GROQ_API_KEY: "gsk_real",
  PUBLIC_WEB_URL: "http://localhost:3000",
};

test("apunta las dos conexiones a agencia_simulacion, vacía las claves y fija la web pública", () => {
  const env = { ...LOCAL };
  prepararEntorno(env);
  assert.equal(env.DATABASE_URL, "mysql://root:clave@localhost:3306/agencia_simulacion");
  assert.equal(env.AGENTE_DATABASE_URL, "mysql://agente_ia:otra@localhost:3306/agencia_simulacion");
  for (const clave of ["WA_TOKEN", "WA_PHONE_NUMBER_ID", "GROQ_API_KEY"]) assert.equal(env[clave], "", clave);
  assert.equal(env.PUBLIC_WEB_URL, "https://www.ortegaautomotores.com");
});

test("aborta sin tocar el entorno si una conexión no es local", () => {
  const aiven = "mysql://avnadmin:x@mysql-313d9fe5.aivencloud.com:26884/defaultdb";
  for (const env of [{ ...LOCAL, DATABASE_URL: aiven }, { ...LOCAL, AGENTE_DATABASE_URL: aiven }, { ...LOCAL, DATABASE_URL: undefined }]) {
    const copia = { ...env };
    assert.throws(() => prepararEntorno(env));
    assert.deepEqual(env, copia, "el entorno no cambió");
  }
});

test("aborta con otro puerto", () => {
  assert.throws(() => prepararEntorno({ ...LOCAL, DATABASE_URL: "mysql://root@localhost:3307/agencia" }));
});

// ajustes-por-chats-reales: ninguna API real en las simulaciones, tampoco Anthropic.
test("limitarFetch frena todo lo que sale de la máquina, Anthropic incluida, y deja pasar localhost", async () => {
  const llamadas = [];
  const global = { fetch: async (url) => void llamadas.push(String(url)) };
  const guarda = limitarFetch(global);
  await global.fetch("http://localhost:4000/salud");
  await global.fetch("http://127.0.0.1:3000/");
  await assert.rejects(() => global.fetch("https://api.anthropic.com/v1/messages"));
  await assert.rejects(() => global.fetch("https://graph.facebook.com/v20.0/1/messages"));
  await assert.rejects(() => global.fetch(new URL("https://api.groq.com/x")));
  await assert.rejects(() => global.fetch("https://blob.vercel-storage.com/x"));
  assert.deepEqual(llamadas, ["http://localhost:4000/salud", "http://127.0.0.1:3000/"]);
  assert.deepEqual(guarda.intentosBloqueados(), ["api.anthropic.com", "graph.facebook.com", "api.groq.com", "blob.vercel-storage.com"]);
  guarda.restaurar();
});

const CLAVES_REALES = ["ANTHROPIC_API_KEY", "WA_TOKEN", "WA_PHONE_NUMBER_ID", "GROQ_API_KEY", "BLOB_DOCUMENTOS_TOKEN", "BLOB_READ_WRITE_TOKEN"];

test("prepararEntorno vacía todas las claves de APIs reales: Anthropic, WhatsApp, Groq y Blob", () => {
  const env = { ...LOCAL, ANTHROPIC_API_KEY: "sk-ant-real", BLOB_DOCUMENTOS_TOKEN: "vercel_blob_rw_real", BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_otro" };
  prepararEntorno(env);
  for (const clave of CLAVES_REALES) assert.equal(env[clave], "", clave);
});

test("verificarSinClaves pasa con las claves vacías o ausentes", () => {
  assert.doesNotThrow(() => verificarSinClaves({}));
  assert.doesNotThrow(() => verificarSinClaves(Object.fromEntries(CLAVES_REALES.map((c) => [c, ""]))));
});

test("verificarSinClaves falla nombrando cada clave real que tenga valor", () => {
  for (const clave of CLAVES_REALES) {
    assert.throws(() => verificarSinClaves({ [clave]: "algo" }), (err) => err.message.includes(clave), clave);
  }
});

test("verificarSinClaves toma como vacía una clave con solo espacios", () => {
  assert.doesNotThrow(() => verificarSinClaves({ ANTHROPIC_API_KEY: "   " }));
});

test("codigoDeSalida: 0 solo si no hubo error ni intentos de red; cualquier intento hace fallar la corrida", () => {
  assert.equal(codigoDeSalida({ error: null, intentosDeRed: 0 }), 0);
  assert.equal(codigoDeSalida({ error: null, intentosDeRed: 1 }), 1);
  assert.equal(codigoDeSalida({ error: new Error("x"), intentosDeRed: 0 }), 1);
});

test("codigoDeSalida: sin el contador de intentos de red, la corrida falla (no se da por buena sin datos)", () => {
  assert.equal(codigoDeSalida({}), 1);
  assert.equal(codigoDeSalida({ error: null }), 1);
  assert.equal(codigoDeSalida({ error: null, intentosDeRed: "0" }), 1);
});
