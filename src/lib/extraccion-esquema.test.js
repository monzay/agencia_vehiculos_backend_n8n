import { test } from "node:test";
import assert from "node:assert/strict";

import { TIPOS, CATALOGO } from "./documentos-catalogo.js";
import { esquemaDe, instruccionDe, normalizarExtraido } from "./extraccion-esquema.js";

// El esquema sale del catálogo, así que estas pruebas no se atan a una lista de
// papeles: recorren la que haya. Si mañana se agrega uno, ya queda cubierto.

const todoEnNull = (esquema) => ({
  datos: Object.fromEntries(Object.keys(esquema.shape.datos.shape).map((k) => [k, null])),
  vencimiento: null,
  dudosos: [],
});

test("hay un esquema para cada papel, con sus campos declarados", () => {
  for (const tipo of TIPOS) {
    const esquema = esquemaDe(tipo);
    const claves = CATALOGO[tipo].campos.map((c) => c.clave);

    assert.deepEqual(Object.keys(esquema.shape.datos.shape), claves, tipo);
    assert.ok(instruccionDe(tipo).includes(CATALOGO[tipo].label), tipo);
  }
});

test("todo campo admite null: sin eso el modelo inventa para llenar el hueco", () => {
  for (const tipo of TIPOS) {
    const esquema = esquemaDe(tipo);
    assert.ok(esquema.safeParse(todoEnNull(esquema)).success, tipo);
  }
});

test("el esquema rechaza un valor del tipo equivocado", () => {
  const esquema = esquemaDe("titulo");
  const conTextoEnElAnio = { ...todoEnNull(esquema), datos: { ...todoEnNull(esquema).datos, anio: "2021" } };
  assert.ok(!esquema.safeParse(conTextoEnElAnio).success);
});

test("descarta lo que el modelo inventa o devuelve con el tipo equivocado", () => {
  const r = normalizarExtraido("titulo", {
    datos: {
      dominio: "  AF734TQ ",
      marca: "Toyota",
      anio: "2021", // número pedido, texto devuelto
      prenda: "no", // booleano pedido, texto devuelto
      origen: "marciano", // fuera de las opciones
      inventado: "no existe en el catálogo",
    },
    vencimiento: "2030-01-01", // el título no vence
    dudosos: ["marca", "inventado"],
  });

  assert.equal(r.datos.dominio, "AF734TQ");
  assert.equal(r.datos.marca, "Toyota");
  assert.ok(!("anio" in r.datos));
  assert.ok(!("prenda" in r.datos));
  assert.ok(!("origen" in r.datos));
  assert.ok(!("inventado" in r.datos));
  assert.equal(r.fechaVencimiento, null);
  assert.deepEqual(r.dudosos, ["marca"]);
});

test("conserva los valores bien tipados y el vencimiento de los papeles que vencen", () => {
  const r = normalizarExtraido("titulo", {
    datos: { dominio: "AF734TQ", anio: 2021, prenda: false, origen: "nacional" },
    vencimiento: null,
    dudosos: [],
  });
  assert.equal(r.datos.anio, 2021);
  assert.equal(r.datos.prenda, false);
  assert.equal(r.datos.origen, "nacional");

  const vtv = normalizarExtraido("vtv", { datos: {}, vencimiento: "2027-08-14", dudosos: [] });
  assert.equal(vtv.fechaVencimiento, "2027-08-14");

  const fea = normalizarExtraido("vtv", { datos: {}, vencimiento: "14/08/2027", dudosos: [] });
  assert.equal(fea.fechaVencimiento, null, "una fecha mal formateada no pasa");
});

test("aguanta una respuesta vacía o rota sin explotar", () => {
  for (const bruto of [null, {}, { datos: null }, { datos: {}, dudosos: "nada" }]) {
    const r = normalizarExtraido("cedula_verde", bruto);
    assert.deepEqual(r.datos, {});
    assert.deepEqual(r.dudosos, []);
  }
});
