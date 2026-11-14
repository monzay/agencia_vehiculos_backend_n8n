import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Las anclas `<!-- test: archivo › "nombre" -->` de OpenSpec tienen que apuntar a un test
// que existe. Si se renombra o se borra un test, esto falla en vez de dejar el spec viejo.
//
// No se verifican:
//  - openspec/changes/archive/**: historial de cambios cerrados (fotos del pasado).
//  - los requisitos de openspec/specs/<cap>/spec.md que un cambio activo REMUEVE o MODIFICA:
//    están siendo reemplazados (las anclas del cambio activo sí se verifican).

const BACKEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RAIZ = path.join(BACKEND, "openspec");
const ANCLA = /<!-- test: (\S+) › "(.*?)" -->/g;
const ENCABEZADO_REQUISITO = /^### Requirement:\s*(.+?)\s*$/;

// Nombres de los requisitos que un spec de cambio declara en REMOVED o MODIFIED.
export function requisitosReemplazados(textoCambio) {
  const nombres = new Set();
  let seccion = null;
  for (const linea of textoCambio.split(/\r?\n/)) {
    if (linea.startsWith("## ")) seccion = linea.slice(3).trim();
    const requisito = linea.match(ENCABEZADO_REQUISITO);
    if (requisito && (seccion === "REMOVED Requirements" || seccion === "MODIFIED Requirements")) nombres.add(requisito[1]);
  }
  return nombres;
}

// Las anclas de un spec, salvo las de los bloques de requisito de `omitidos`.
// Un bloque va de su `### Requirement:` hasta el próximo `### Requirement:` o `## `.
export function anclasDe(texto, omitidos = new Set()) {
  const anclas = [];
  let omitiendo = false;
  for (const linea of texto.split(/\r?\n/)) {
    const requisito = linea.match(ENCABEZADO_REQUISITO);
    if (requisito) omitiendo = omitidos.has(requisito[1]);
    else if (linea.startsWith("## ")) omitiendo = false;
    if (omitiendo) continue;
    for (const [, archivo, nombre] of linea.matchAll(ANCLA)) anclas.push({ archivo, nombre });
  }
  return anclas;
}

function specsDe(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const ruta = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "archive" && path.basename(dir) === "changes" ? [] : specsDe(ruta);
    return e.name === "spec.md" ? [ruta] : [];
  });
}

// Por capacidad (carpeta de openspec/specs), lo que los cambios activos reemplazan.
function reemplazadosPorCapacidad() {
  const porCapacidad = new Map();
  for (const spec of specsDe(path.join(RAIZ, "changes"))) {
    const capacidad = path.basename(path.dirname(spec));
    const actuales = porCapacidad.get(capacidad) ?? new Set();
    for (const nombre of requisitosReemplazados(fs.readFileSync(spec, "utf8"))) actuales.add(nombre);
    porCapacidad.set(capacidad, actuales);
  }
  return porCapacidad;
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

  const reemplazados = reemplazadosPorCapacidad();
  const principal = path.join(RAIZ, "specs") + path.sep;
  const rotas = specsDe(RAIZ).flatMap((spec) => {
    const omitidos = spec.startsWith(principal) ? reemplazados.get(path.basename(path.dirname(spec))) : undefined;
    return anclasDe(fs.readFileSync(spec, "utf8"), omitidos)
      .filter(({ archivo, nombre }) => !leer(archivo).includes(nombre))
      .map(({ archivo, nombre }) => `${path.relative(BACKEND, spec)} → ${archivo} › "${nombre}"`);
  });
  assert.deepEqual(rotas, []);
});

// ── Las reglas del verificador, con specs de ejemplo ──

const ancla = (n) => `<!-- test: src/x.test.js › "${n}" -->`;
const CAMBIO = `## ADDED Requirements

### Requirement: Nuevo
Texto.
${ancla("del cambio")}

## MODIFIED Requirements

### Requirement: Modificado
Texto.

## REMOVED Requirements

### Requirement: Removido
**Reason**: ya no.
`;
const PRINCIPAL = `# Spec

${ancla("antes de todo")}

### Requirement: Intacto
${ancla("intacto uno")}
#### Scenario: a
${ancla("intacto dos")}

### Requirement: Modificado
${ancla("modificado viejo")}

### Requirement: Removido
${ancla("removido viejo")}
#### Scenario: b
${ancla("removido viejo dos")}

## Otra sección
${ancla("después")}
`;

test("un requisito que un cambio activo REMUEVE o MODIFICA se detecta por su nombre", () => {
  assert.deepEqual([...requisitosReemplazados(CAMBIO)].sort(), ["Modificado", "Removido"]);
});

test("los requisitos ADDED de un cambio no cuentan como reemplazados", () => {
  assert.equal(requisitosReemplazados(CAMBIO).has("Nuevo"), false);
});

test("las anclas de un requisito reemplazado no se verifican; las demás, sí", () => {
  const nombres = anclasDe(PRINCIPAL, requisitosReemplazados(CAMBIO)).map((a) => a.nombre);
  assert.deepEqual(nombres, ["antes de todo", "intacto uno", "intacto dos", "después"]);
});

test("sin reemplazos se verifican todas las anclas, y las del cambio activo también", () => {
  assert.equal(anclasDe(PRINCIPAL).length, 7);
  assert.deepEqual(anclasDe(CAMBIO).map((a) => a.nombre), ["del cambio"]);
});

test("un bloque de requisito empieza en su encabezado y termina en el próximo requisito o en un título de nivel 2", () => {
  const spec = `${ancla("rota antes del primer requisito")}
### Requirement: Previo
${ancla("rota en el requisito previo")}

### Requirement: Omitido
${ancla("rota omitida")}

### Requirement: Siguiente
${ancla("rota del siguiente")}

### Requirement: Omitido dos
${ancla("rota omitida dos")}

## Otra sección
${ancla("rota después del título")}
`;
  const nombres = anclasDe(spec, new Set(["Omitido", "Omitido dos"])).map((a) => a.nombre);
  assert.deepEqual(nombres, ["rota antes del primer requisito", "rota en el requisito previo", "rota del siguiente", "rota después del título"]);
});

test("la carpeta archive de los cambios no se recorre", () => {
  const specs = specsDe(RAIZ).map((s) => path.relative(RAIZ, s).split(path.sep).join("/"));
  assert.equal(specs.some((s) => s.startsWith("changes/archive/")), false);
});
