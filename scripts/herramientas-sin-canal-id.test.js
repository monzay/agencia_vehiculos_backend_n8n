import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Después de la 074 `clientes.canal_id` no existe: ningún seed ni simulador puede escribirlo ni filtrar por
// él (fallarían). La persona se reconoce por `cliente_canales` y lo sintético se marca con su email.
// Se mira el código sin los comentarios, que sí pueden contar la historia.

const RAIZ = new URL("../", import.meta.url);
const HERRAMIENTAS = [
  "scripts/simular-cuotas.js",
  "scripts/simular-ventas.js",
  "prisma/seed/seed-consultas-vistas.mjs",
  "prisma/seed/seed-demo.mjs",
  "prisma/seed/seed_test_data.mjs",
  "prisma/seed/seed-autos.mjs",
  // Fuera del repositorio (carpeta de herramientas locales del proyecto): se mira si está.
  "../../.local-dev/prueba-cuotas.mjs",
];

const sinComentarios = (codigo) => codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

for (const ruta of HERRAMIENTAS) {
  const archivo = new URL(ruta, RAIZ);
  test(`${ruta} no escribe ni filtra por canal_id`, { skip: !existsSync(archivo) && "el archivo no está en esta máquina" }, () => {
    const codigo = sinComentarios(readFileSync(fileURLToPath(archivo), "utf8"));

    // Palabra entera: `canal_identificador` (el índice de cliente_canales) está bien.
    assert.doesNotMatch(codigo, /\b(canal_canal_id|canal_id)\b/);
  });
}
