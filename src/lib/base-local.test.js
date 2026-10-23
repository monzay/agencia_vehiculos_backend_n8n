import { test } from "node:test";
import assert from "node:assert/strict";
import { esBaseLocal, destinoDeLaBase, baseAutorizada } from "./base-local.js";

const CLAVE = "clave-secreta-123";

test("esBaseLocal acepta localhost y 127.0.0.1, con o sin puerto, usuario, clave codificada o parámetros", () => {
  const locales = [
    `mysql://root:${CLAVE}@localhost:3306/agencia`,
    `mysql://root:${CLAVE}@127.0.0.1:3306/agencia`,
    "mysql://root@localhost/agencia",
    `mysql://root:${CLAVE}@LOCALHOST:3306/agencia`,
    "mysql://root:cl%40ve@localhost:3306/agencia?connection_limit=5",
    `mysql://root:${CLAVE}@[::1]:3306/agencia`,
  ];

  for (const url of locales) assert.equal(esBaseLocal(url), true, url);
});

test("esBaseLocal rechaza cualquier otro host, aunque 'localhost' aparezca en otra parte de la URL", () => {
  const remotas = [
    `mysql://avnadmin:${CLAVE}@mysql-313d9fe5-agenciaautomatizacion1.j.aivencloud.com:26884/agencia?sslaccept=strict`,
    `mysql://root:${CLAVE}@localhost.remoto.invalid:3306/agencia`,
    `mysql://root:${CLAVE}@127.0.0.1.remoto.invalid:3306/agencia`,
    `mysql://root:${CLAVE}@remoto.invalid:3306/localhost`,
    `mysql://root:${CLAVE}@remoto.invalid/agencia?x=@localhost:3306/`,
    `mysql://localhost:${CLAVE}@remoto.invalid:3306/agencia`,
    `mysql://root:${CLAVE}@10.0.0.5:3306/agencia`,
    `mysql://root:${CLAVE}@0.0.0.0:3306/agencia`,
  ];

  for (const url of remotas) assert.equal(esBaseLocal(url), false, url);
});

test("esBaseLocal rechaza lo que no es una URL: ausente, vacía o basura", () => {
  for (const url of [undefined, null, "", "   ", "localhost", "localhost:3306/agencia", "basura", 3306, {}]) {
    assert.equal(esBaseLocal(url), false, String(url));
  }
});

test("destinoDeLaBase muestra host, puerto y base, sin usuario, clave ni parámetros", () => {
  const casos = [
    [`mysql://root:${CLAVE}@localhost:3306/agencia?connection_limit=5`, "localhost:3306/agencia"],
    [`mysql://root:${CLAVE}@127.0.0.1/agencia`, "127.0.0.1/agencia"],
    [
      `mysql://avnadmin:${CLAVE}@mysql-313d9fe5-agenciaautomatizacion1.j.aivencloud.com:26884/agencia?sslaccept=strict&sslcert=d:/x/aiven-ca.pem`,
      "mysql-313d9fe5-agenciaautomatizacion1.j.aivencloud.com:26884/agencia",
    ],
  ];

  for (const [url, esperado] of casos) {
    const destino = destinoDeLaBase(url);
    assert.equal(destino, esperado);
    assert.ok(!destino.includes(CLAVE) && !destino.includes("root") && !destino.includes("avnadmin"), "no filtra credenciales");
  }
});

test("destinoDeLaBase avisa cuando no hay una URL usable, sin romper", () => {
  for (const url of [undefined, "", "basura"]) {
    assert.equal(destinoDeLaBase(url), "(DATABASE_URL ausente o inválida)");
  }
});

test("baseAutorizada deja correr contra la base local y, contra cualquier otra, solo con --produccion explícito", () => {
  const local = `mysql://root:${CLAVE}@localhost:3306/agencia`;
  const remota = `mysql://avnadmin:${CLAVE}@mysql-prueba.remoto.invalid:26884/agencia`;

  assert.equal(baseAutorizada(local), true);
  assert.equal(baseAutorizada(local, { produccion: false }), true);
  assert.equal(baseAutorizada(remota), false);
  assert.equal(baseAutorizada(remota, { produccion: false }), false);
  assert.equal(baseAutorizada(remota, { produccion: true }), true);
});

test("baseAutorizada no se deja convencer: sin URL, o con un --produccion que no es el booleano true, se niega", () => {
  const remota = `mysql://avnadmin:${CLAVE}@mysql-prueba.remoto.invalid:26884/agencia`;

  assert.equal(baseAutorizada(undefined), false);
  assert.equal(baseAutorizada(""), false);
  for (const produccion of ["true", "si", 1, {}, undefined, null]) {
    assert.equal(baseAutorizada(remota, { produccion }), false, String(produccion));
  }
});
