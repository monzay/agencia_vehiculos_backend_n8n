import { test } from "node:test";
import assert from "node:assert/strict";
import { prepararEntorno, limitarFetch } from "./entorno.js";

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

test("limitarFetch deja pasar a Anthropic y frena todo lo demás", async () => {
  const llamadas = [];
  const global = { fetch: async (url) => void llamadas.push(String(url)) };
  const guarda = limitarFetch(global);
  await global.fetch("https://api.anthropic.com/v1/messages");
  await assert.rejects(() => global.fetch("https://graph.facebook.com/v20.0/1/messages"));
  await assert.rejects(() => global.fetch(new URL("https://api.groq.com/x")));
  assert.deepEqual(llamadas, ["https://api.anthropic.com/v1/messages"]);
  assert.deepEqual(guarda.intentosBloqueados(), ["graph.facebook.com", "api.groq.com"]);
  guarda.restaurar();
});
