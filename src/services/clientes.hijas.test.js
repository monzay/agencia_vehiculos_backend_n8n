import { test } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { CANALES_MENSAJERIA, FILAS_HIJAS } from "./clientes.service.js";

// Una tabla nueva con una columna que apunta a `clientes` tiene que entrar en FILAS_HIJAS: si no, la fusión
// archiva el origen y esas filas quedan colgando de una ficha muerta. La lista se compara con el modelo de
// Prisma (`Prisma.dmmf`), sin conectarse a ninguna base.

// Las únicas tablas con una columna hacia `clientes` que la fusión no mueve con FILAS_HIJAS.
const EXCEPCIONES = {
  cliente_perfiles: "la une unirPerfiles: es 1 a 1 y el perfil del origen puede quedar con el origen archivado",
  cliente_fusiones: "es el registro de las fusiones: sus filas no se mueven",
};

const MODELOS = Prisma.dmmf.datamodel.models;

// `modelo.columna` de cada columna que apunta a `clientes`: las relaciones con la FK de ese lado y, por si
// alguien olvida declarar la relación, todo campo que se llame `cliente_id` o termine en `_cliente_id`.
function columnasHaciaClientes(modelos) {
  const porRelacion = modelos.flatMap((modelo) =>
    modelo.fields
      .filter((campo) => campo.kind === "object" && campo.type === "clientes")
      .flatMap((campo) => campo.relationFromFields ?? [])
      .map((columna) => `${modelo.name}.${columna}`)
  );
  const porNombre = modelos.flatMap((modelo) =>
    modelo.fields.filter((campo) => campo.kind === "scalar" && /(^|_)cliente_id$/.test(campo.name)).map((campo) => `${modelo.name}.${campo.name}`)
  );
  return [...new Set([...porRelacion, ...porNombre])].sort();
}

function sinCubrir(modelos, filasHijas) {
  const cubiertas = new Set(filasHijas.map(({ modelo, campo }) => `${modelo}.${campo}`));
  return columnasHaciaClientes(modelos).filter((columna) => !cubiertas.has(columna) && !(columna.split(".")[0] in EXCEPCIONES));
}

test("el cliente de Prisma está al día: conoce las tablas de la fase 1 (si falla, corré prisma generate)", () => {
  const nombres = MODELOS.map((modelo) => modelo.name);
  for (const esperado of ["clientes", "cliente_canales", "cliente_fusiones", "cliente_perfiles"]) {
    assert.ok(nombres.includes(esperado), `falta el modelo ${esperado}`);
  }
  const clientes = MODELOS.find((modelo) => modelo.name === "clientes");
  assert.ok(clientes.fields.some((campo) => campo.name === "fusionado_en_id"));
  assert.ok(!clientes.fields.some((campo) => campo.name === "canal_id"), "la 074 sacó canal_id");
});

test("toda tabla con una columna hacia clientes está en FILAS_HIJAS, salvo cliente_perfiles y cliente_fusiones", () => {
  assert.deepEqual(sinCubrir(MODELOS, FILAS_HIJAS), []);
});

test("una tabla nueva con cliente_id hace fallar el chequeo, con o sin la relación declarada", () => {
  const conRelacion = {
    name: "tabla_nueva",
    fields: [
      { name: "cliente_id", kind: "scalar", type: "Int" },
      { name: "cliente", kind: "object", type: "clientes", relationFromFields: ["cliente_id"] },
    ],
  };
  const sinRelacion = { name: "otra_tabla", fields: [{ name: "conyuge_cliente_id", kind: "scalar", type: "Int" }] };

  assert.deepEqual(sinCubrir([...MODELOS, conRelacion], FILAS_HIJAS), ["tabla_nueva.cliente_id"]);
  assert.deepEqual(sinCubrir([...MODELOS, sinRelacion], FILAS_HIJAS), ["otra_tabla.conyuge_cliente_id"]);
});

test("una entrada que falta en FILAS_HIJAS hace fallar el chequeo", () => {
  const sinSenas = FILAS_HIJAS.filter(({ modelo }) => modelo !== "senas");
  const sinConyuge = FILAS_HIJAS.filter(({ campo }) => campo !== "conyuge_cliente_id");

  assert.deepEqual(sinCubrir(MODELOS, sinSenas), ["senas.cliente_id"]);
  assert.deepEqual(sinCubrir(MODELOS, sinConyuge), ["consignacion_ingresos.conyuge_cliente_id"]);
});

test("las dos excepciones siguen siendo reales: apuntan a clientes y no están en FILAS_HIJAS", () => {
  const columnas = columnasHaciaClientes(MODELOS);
  for (const tabla of Object.keys(EXCEPCIONES)) {
    assert.ok(columnas.some((columna) => columna.startsWith(`${tabla}.`)), `${tabla} ya no apunta a clientes: sacala de las excepciones`);
    assert.ok(!FILAS_HIJAS.some(({ modelo }) => modelo === tabla), `${tabla} está en FILAS_HIJAS: sacala de las excepciones`);
  }
});

test("FILAS_HIJAS es una lista congelada, con cada entrada congelada también", () => {
  assert.ok(Object.isFrozen(FILAS_HIJAS));
  assert.ok(FILAS_HIJAS.every((hija) => Object.isFrozen(hija)));
  assert.throws(() => FILAS_HIJAS.push({ clave: "x", modelo: "x", campo: "x" }), TypeError);
});

test("CANALES_MENSAJERIA se exporta congelado y coincide con el enum de cliente_canales.canal", () => {
  const enumDeCanales = Prisma.dmmf.datamodel.enums.find((tipo) => tipo.name === "cliente_canales_canal");

  assert.ok(Object.isFrozen(CANALES_MENSAJERIA));
  assert.deepEqual([...CANALES_MENSAJERIA], ["whatsapp", "facebook", "instagram"]);
  assert.deepEqual(enumDeCanales.values.map((valor) => valor.name), [...CANALES_MENSAJERIA]);
});
