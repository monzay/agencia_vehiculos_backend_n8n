import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// El arranque del script, de afuera: se corre como proceso aparte con una base REMOTA que no existe
// (host `.invalid`, reservado: nunca resuelve), así que si el guard fallara tampoco habría base a la
// que conectarse. Siempre se pasa DATABASE_URL: el .env del proyecto no la pisa (manda el entorno).

const SCRIPT = fileURLToPath(new URL("./unificar-clientes.js", import.meta.url));
const CLAVE = "clave-secreta-123";

function correr(argumentos, databaseUrl) {
  return spawnSync(process.execPath, [SCRIPT, ...argumentos], {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    encoding: "utf8",
    timeout: 30_000,
  });
}

test("se niega a correr contra una base que no es local, con o sin --aplicar, sin imprimir la clave", () => {
  const remotas = [
    `mysql://avnadmin:${CLAVE}@mysql-prueba.remoto.invalid:26884/agencia?sslaccept=strict`,
    `mysql://root:${CLAVE}@localhost.remoto.invalid:3306/agencia`,
    `mysql://root:${CLAVE}@remoto.invalid/agencia?x=@localhost:3306/`,
  ];

  for (const url of remotas) {
    for (const argumentos of [[], ["--aplicar"]]) {
      const r = correr(argumentos, url);

      assert.equal(r.status, 1, `${argumentos} ${url}`);
      assert.match(r.stderr, /no es una base local/);
      assert.match(r.stderr, /--produccion/);
      assert.ok(!r.stderr.includes(CLAVE) && !r.stdout.includes(CLAVE), "no muestra la clave");
      assert.equal(r.stdout, "", "no llegó a imprimir ningún informe");
    }
  }
});

test("el mensaje de rechazo dice a qué base apuntaba la URL", () => {
  const r = correr([], `mysql://avnadmin:${CLAVE}@mysql-prueba.remoto.invalid:26884/agencia`);

  assert.match(r.stderr, /mysql-prueba\.remoto\.invalid:26884\/agencia/);
});

test("rechaza una opción que no conoce, antes de mirar la base", () => {
  const r = correr(["--aplicr"], `mysql://root:${CLAVE}@remoto.invalid:3306/agencia`);

  assert.equal(r.status, 1);
  assert.match(r.stderr, /Opción desconocida: --aplicr/);
  assert.doesNotMatch(r.stderr, /no es una base local/);
});

// El encabezado es lo único que le dice a quien lo corre cómo hacerlo sin romper nada ni filtrar datos.
test("el encabezado avisa que --aplicar va con el bot en pausa y tras un backup, y que el informe y cliente_fusiones guardan datos personales", () => {
  const encabezado = readFileSync(SCRIPT, "utf8")
    .split("\n")
    .filter((linea) => linea.startsWith("//"))
    .join("\n");

  assert.match(encabezado, /bot en pausa/i);
  assert.match(encabezado, /sin tráfico de WhatsApp/i);
  assert.match(encabezado, /backup/i);
  assert.match(encabezado, /datos personales/i);
  assert.match(encabezado, /cliente_fusiones/);
});
