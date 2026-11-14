import { test } from "node:test";
import assert from "node:assert/strict";
import { verificarBases, urlDeSimulacion, basesProhibidas } from "./guardas.js";

const OK = "mysql://root:clave@localhost:3306/agencia_simulacion";
const OK_AGENTE = "mysql://agente_ia:otra@127.0.0.1:3306/agencia_simulacion";
const PROHIBIDAS = ["agencia"];

test("acepta las dos conexiones locales a agencia_simulacion", () => {
  assert.equal(verificarBases({ backend: OK, agente: OK_AGENTE }, { prohibidas: PROHIBIDAS }), undefined);
});

test("acepta una URL local sin puerto explícito (3306 por defecto)", () => {
  assert.equal(
    verificarBases({ backend: "mysql://root@localhost/agencia_simulacion", agente: OK_AGENTE }, { prohibidas: PROHIBIDAS }),
    undefined,
  );
});

test("rechaza la URL de la base de desarrollo", () => {
  assert.throws(
    () => verificarBases({ backend: "mysql://root@localhost:3306/agencia", agente: OK_AGENTE }, { prohibidas: PROHIBIDAS }),
    /agencia_simulacion|prohibid|desarrollo/i,
  );
});

test("rechaza una URL remota (Aiven) aunque la base se llame agencia_simulacion", () => {
  const aiven = "mysql://avnadmin:x@mysql-313d9fe5-agenciaautomatizacion1.j.aivencloud.com:26884/agencia_simulacion";
  assert.throws(() => verificarBases({ backend: aiven, agente: OK_AGENTE }, { prohibidas: PROHIBIDAS }), /local/i);
  assert.throws(() => verificarBases({ backend: OK, agente: aiven }, { prohibidas: PROHIBIDAS }), /local/i);
});

test("rechaza un host que solo dice localhost en la clave o en los parámetros", () => {
  assert.throws(
    () =>
      verificarBases(
        { backend: "mysql://root:localhost@db.remoto.com:3306/agencia_simulacion?host=localhost", agente: OK_AGENTE },
        { prohibidas: PROHIBIDAS },
      ),
    /local/i,
  );
});

test("rechaza una URL local con otro puerto", () => {
  assert.throws(
    () => verificarBases({ backend: "mysql://root@localhost:3307/agencia_simulacion", agente: OK_AGENTE }, { prohibidas: PROHIBIDAS }),
    /puerto/i,
  );
});

test("rechaza una URL local con otra base que no sea agencia_simulacion", () => {
  assert.throws(
    () => verificarBases({ backend: "mysql://root@localhost:3306/otra_base", agente: OK_AGENTE }, { prohibidas: PROHIBIDAS }),
    /agencia_simulacion/,
  );
});

test("rechaza una URL cuya base coincide con una prohibida, aunque sea agencia_simulacion", () => {
  assert.throws(
    () => verificarBases({ backend: OK, agente: OK_AGENTE }, { prohibidas: ["agencia_simulacion"] }),
    /prohibid|coincide|DATABASE_URL/i,
  );
});

test("rechaza la conexión del agente mala aunque la del backend esté bien", () => {
  assert.throws(
    () => verificarBases({ backend: OK, agente: "mysql://agente_ia:x@localhost:3306/agencia" }, { prohibidas: PROHIBIDAS }),
    /agencia_simulacion|prohibid/i,
  );
});

test("rechaza la conexión del backend mala aunque la del agente esté bien", () => {
  assert.throws(
    () => verificarBases({ backend: "mysql://root@localhost:3306/agencia", agente: OK_AGENTE }, { prohibidas: PROHIBIDAS }),
    /agencia_simulacion|prohibid/i,
  );
});

test("rechaza una URL inválida o ausente", () => {
  assert.throws(() => verificarBases({ backend: undefined, agente: OK_AGENTE }, { prohibidas: PROHIBIDAS }));
  assert.throws(() => verificarBases({ backend: OK, agente: "no es una url" }, { prohibidas: PROHIBIDAS }));
});

test("el mensaje de error no muestra la clave", () => {
  try {
    verificarBases({ backend: "mysql://root:SECRETO123@localhost:3306/agencia", agente: OK_AGENTE }, { prohibidas: PROHIBIDAS });
    assert.fail("tenía que tirar");
  } catch (e) {
    assert.doesNotMatch(String(e.message), /SECRETO123/);
  }
});

test("urlDeSimulacion cambia solo la base", () => {
  assert.equal(urlDeSimulacion("mysql://root:clave@localhost:3306/agencia"), "mysql://root:clave@localhost:3306/agencia_simulacion");
});

test("urlDeSimulacion conserva los parámetros", () => {
  assert.equal(
    urlDeSimulacion("mysql://agente_ia:clave@localhost:3306/agencia?connection_limit=5&sslmode=disable"),
    "mysql://agente_ia:clave@localhost:3306/agencia_simulacion?connection_limit=5&sslmode=disable",
  );
});

test("urlDeSimulacion conserva una clave con caracteres codificados", () => {
  assert.equal(
    urlDeSimulacion("mysql://root:p%40ss%2Fw%3Ard%23@localhost:3306/agencia"),
    "mysql://root:p%40ss%2Fw%3Ard%23@localhost:3306/agencia_simulacion",
  );
});

test("urlDeSimulacion conserva el host y el puerto que traiga la URL", () => {
  assert.equal(urlDeSimulacion("mysql://root@127.0.0.1:3310/agencia"), "mysql://root@127.0.0.1:3310/agencia_simulacion");
});

test("la URL que arma urlDeSimulacion pasa la verificación", () => {
  const backend = urlDeSimulacion("mysql://root:p%40ss@localhost:3306/agencia");
  const agente = urlDeSimulacion("mysql://agente_ia:x%2By@localhost:3306/agencia");
  assert.equal(verificarBases({ backend, agente }, { prohibidas: PROHIBIDAS }), undefined);
});

test("basesProhibidas devuelve las bases de DATABASE_URL y AGENTE_DATABASE_URL", () => {
  const env = {
    DATABASE_URL: "mysql://root:x@localhost:3306/agencia",
    AGENTE_DATABASE_URL: "mysql://agente_ia:y@localhost:3306/otra_base",
  };
  assert.deepEqual([...basesProhibidas(env)].sort(), ["agencia", "otra_base"]);
});

test("basesProhibidas no repite la base si las dos URLs usan la misma", () => {
  const env = {
    DATABASE_URL: "mysql://root:x@localhost:3306/agencia",
    AGENTE_DATABASE_URL: "mysql://agente_ia:y@localhost:3306/agencia",
  };
  assert.deepEqual(basesProhibidas(env), ["agencia"]);
});
