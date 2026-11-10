import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Las anclas `<!-- test: archivo › "nombre" -->` de OpenSpec tienen que apuntar a un test
// que existe. Si se renombra o se borra un test, esto falla en vez de dejar el spec viejo.

const BACKEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function specsDe(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const ruta = path.join(dir, e.name);
    if (e.isDirectory()) return specsDe(ruta);
    return e.name === "spec.md" ? [ruta] : [];
  });
}

test("cada ancla de los specs apunta a un test que existe", () => {
  const leidos = new Map();
  const leer = (archivo) => {
    if (!leidos.has(archivo)) {
      const ruta = path.join(BACKEND, archivo);
      leidos.set(archivo, fs.existsSync(ruta) ? fs.readFileSync(ruta, "utf8") : "");
    }
    return leidos.get(archivo);
  };

  const rotas = specsDe(path.join(BACKEND, "openspec")).flatMap((spec) =>
    [...fs.readFileSync(spec, "utf8").matchAll(/<!-- test: (\S+) › "(.*?)" -->/g)]
      .filter(([, archivo, nombre]) => !leer(archivo).includes(nombre))
      .map(([, archivo, nombre]) => `${path.relative(BACKEND, spec)} → ${archivo} › "${nombre}"`)
  );
  assert.deepEqual(rotas, []);
});
