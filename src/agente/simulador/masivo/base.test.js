// prepararBase no confía en quien la llama: verifica las URLs ella misma antes de ejecutar nada.
// Estos tests no usan base: `ejecutar` es un espía que registra cada sentencia SQL.
import { test } from "node:test";
import assert from "node:assert/strict";
import { prepararBase } from "./base.js";

const OK_ROOT = "mysql://root:clave@localhost:3306/agencia_simulacion";
const OK_AGENTE = "mysql://agente_ia:otra@127.0.0.1:3306/agencia_simulacion";
const AIVEN = "mysql://avnadmin:x@mysql-313d9fe5-agenciaautomatizacion1.j.aivencloud.com:26884/agencia_simulacion";
const PROHIBIDAS = ["agencia"];

function espia() {
  const sentencias = [];
  const ejecutar = async (sql) => {
    sentencias.push(sql);
    return [];
  };
  return { sentencias, ejecutar };
}

async function noEjecutaNada(urls, prohibidas = PROHIBIDAS) {
  const { sentencias, ejecutar } = espia();
  await assert.rejects(() => prepararBase(urls, { prohibidas, ejecutar }));
  assert.deepEqual(sentencias, [], "no se ejecutó ninguna sentencia SQL");
}

test("prepararBase con la URL del backend remota no ejecuta ninguna sentencia", async () => {
  await noEjecutaNada({ urlRoot: AIVEN, urlAgente: OK_AGENTE });
});

test("prepararBase con la URL del agente remota no ejecuta ninguna sentencia", async () => {
  await noEjecutaNada({ urlRoot: OK_ROOT, urlAgente: AIVEN });
});

test("prepararBase con otro puerto no ejecuta ninguna sentencia", async () => {
  await noEjecutaNada({ urlRoot: "mysql://root@localhost:3307/agencia_simulacion", urlAgente: OK_AGENTE });
  await noEjecutaNada({ urlRoot: OK_ROOT, urlAgente: "mysql://agente_ia@localhost:3307/agencia_simulacion" });
});

test("prepararBase con la base agencia no ejecuta ninguna sentencia", async () => {
  await noEjecutaNada({ urlRoot: "mysql://root@localhost:3306/agencia", urlAgente: OK_AGENTE });
  await noEjecutaNada({ urlRoot: OK_ROOT, urlAgente: "mysql://agente_ia@localhost:3306/agencia" });
});

test("prepararBase con una base igual a la de DATABASE_URL original no ejecuta ninguna sentencia", async () => {
  await noEjecutaNada({ urlRoot: OK_ROOT, urlAgente: OK_AGENTE }, ["agencia_simulacion"]);
});

test("prepararBase con una base igual a la de AGENTE_DATABASE_URL original no ejecuta ninguna sentencia", async () => {
  // La base prohibida aparece solo en la URL del agente: igual se aborta.
  await noEjecutaNada(
    { urlRoot: "mysql://root@localhost:3306/agencia_simulacion", urlAgente: "mysql://agente_ia@localhost:3306/otra_prohibida" },
    ["otra_prohibida"],
  );
});

test("prepararBase con el backend malo y el agente bien no ejecuta ninguna sentencia", async () => {
  await noEjecutaNada({ urlRoot: "mysql://root@localhost:3306/agencia", urlAgente: OK_AGENTE });
});

test("prepararBase con el agente malo y el backend bien no ejecuta ninguna sentencia", async () => {
  await noEjecutaNada({ urlRoot: OK_ROOT, urlAgente: AIVEN });
});

test("prepararBase sin urls o con urls inválidas no ejecuta ninguna sentencia", async () => {
  await noEjecutaNada({ urlRoot: undefined, urlAgente: OK_AGENTE });
  await noEjecutaNada({ urlRoot: OK_ROOT, urlAgente: "no es una url" });
});

test("prepararBase sin la lista de prohibidas no ejecuta nada (no hay forma de verificar)", async () => {
  const { sentencias, ejecutar } = espia();
  await assert.rejects(() => prepararBase({ urlRoot: OK_ROOT, urlAgente: OK_AGENTE }, { ejecutar }));
  assert.deepEqual(sentencias, []);
});

test("el error de prepararBase por una base no válida no muestra la clave", async () => {
  const { ejecutar } = espia();
  await assert.rejects(
    () => prepararBase({ urlRoot: "mysql://root:SECRETO123@localhost:3306/agencia", urlAgente: OK_AGENTE }, { prohibidas: PROHIBIDAS, ejecutar }),
    (e) => !/SECRETO123/.test(String(e.message)),
  );
});

test("prepararBase carga los datos que le pasan y, sin datos, los de siempre", async () => {
  const { sentencias, ejecutar } = espia();
  const esquema = () => sentencias.push("ESQUEMA");
  await prepararBase({ urlRoot: OK_ROOT, urlAgente: OK_AGENTE }, { prohibidas: PROHIBIDAS, ejecutar, esquema, datos: "INSERT INTO propio VALUES (1);" });
  assert.equal(sentencias.at(-1), "INSERT INTO propio VALUES (1);");
  assert.ok(sentencias.indexOf("ESQUEMA") > 1, "el esquema va después de crear la base");
  const otra = espia();
  await prepararBase({ urlRoot: OK_ROOT, urlAgente: OK_AGENTE }, { prohibidas: PROHIBIDAS, ejecutar: otra.ejecutar, esquema: () => {} });
  assert.match(otra.sentencias.at(-1), /SIM-01/);
});
