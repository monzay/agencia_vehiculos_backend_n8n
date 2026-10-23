import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Los simuladores y los seeds crean datos de prueba (y gastan en Claude, o borran con --wipe / --limpiar): corren
// solo contra la base local, sin override. Quién es "local" lo decide `baseAutorizada` (src/lib/base-local.js), que
// mira el host de la URL: un regex sobre el texto se evade con `?ssl-ca=/x@localhost/ca.pem`. El chequeo va ANTES
// de crear el PrismaClient o de conectar. Se mira el código sin los comentarios, que sí pueden contar la historia.

const RAIZ = new URL("../", import.meta.url);
const HERRAMIENTAS = [
  { ruta: "scripts/simular-cuotas.js", bases: ["DATABASE_URL", "AGENTE_DATABASE_URL"] },
  { ruta: "scripts/simular-ventas.js", bases: ["DATABASE_URL", "AGENTE_DATABASE_URL"] },
  { ruta: "prisma/seed/seed-consultas-vistas.mjs", bases: ["DATABASE_URL"] },
  { ruta: "prisma/seed/seed-demo.mjs", bases: ["DATABASE_URL"] },
  { ruta: "prisma/seed/seed_test_data.mjs", bases: ["DATABASE_URL"] },
  { ruta: "prisma/seed/seed-autos.mjs", bases: ["DATABASE_URL"] },
];

// Lo primero que crea un cliente de Prisma o abre una conexión.
const CONEXION = /new\s+PrismaClient\s*\(|import\(\s*["'][^"']*\/lib\/prisma\.js["']\s*\)|\bdbAgente\s*\(/;

const sinComentarios = (codigo) => codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

for (const { ruta, bases } of HERRAMIENTAS) {
  const archivo = new URL(ruta, RAIZ);
  const codigo = () => sinComentarios(readFileSync(fileURLToPath(archivo), "utf8"));

  const antesDeConectar = () => {
    const fuente = codigo();
    const conexion = fuente.search(CONEXION);
    assert.ok(conexion > 0, "la herramienta crea el cliente o conecta en algún punto");
    return fuente.slice(0, conexion);
  };

  test(`${ruta} importa baseAutorizada y destinoDeLaBase de src/lib/base-local.js`, () => {
    const importacion = codigo().match(/import\s*\{([^}]*)\}\s*from\s*["']([^"']*\/lib\/base-local\.js)["']/);

    assert.ok(importacion, "no importa de src/lib/base-local.js");
    const nombres = importacion[1].split(",").map((nombre) => nombre.trim());
    assert.ok(nombres.includes("baseAutorizada"), "no importa baseAutorizada");
    assert.ok(nombres.includes("destinoDeLaBase"), "no importa destinoDeLaBase");
    assert.ok(existsSync(fileURLToPath(new URL(importacion[2], archivo))), `la ruta ${importacion[2]} no existe desde ${ruta}`);
  });

  test(`${ruta} no decide con un regex qué es una base local`, () => {
    // Ni `@(localhost|127\.0\.0\.1)[:/]` ni uno parecido: del host se ocupa base-local.js.
    assert.doesNotMatch(codigo(), /localhost|127\.0\.0\.1/, "decide a mano qué es una base local");
  });

  test(`${ruta} chequea cada base con baseAutorizada y corta antes de crear el cliente o conectar`, () => {
    const antes = antesDeConectar();

    assert.match(antes, /baseAutorizada\(/, "no llama a baseAutorizada antes de conectar");
    // Sin override: `baseAutorizada(url)`, nunca `baseAutorizada(url, { produccion })`.
    assert.doesNotMatch(antes, /baseAutorizada\([^)]*,/, "acepta un override");
    for (const variable of bases) {
      assert.match(antes, new RegExp(`(?<![A-Z_])${variable}\\b`), `no chequea ${variable} antes de conectar`);
    }
    assert.match(antes, /process\.exit\(1\)/, "no corta el proceso");
  });

  test(`${ruta} avisa a qué base apuntaba, sin imprimir credenciales`, () => {
    const antes = antesDeConectar();

    assert.match(antes, /destinoDeLaBase\(/, "el aviso no usa destinoDeLaBase");
    const sinDestinos = antes.replace(/destinoDeLaBase\([^)]*\)/g, "");
    assert.doesNotMatch(sinDestinos, /console\.\w+\([^)]*(?:\burl\w*|process\.env)/, "imprime la URL entera");
    assert.doesNotMatch(sinDestinos, /\$\{[^}]*(?:\burl\w*|process\.env)[^}]*\}/, "interpola la URL entera");
  });
}
