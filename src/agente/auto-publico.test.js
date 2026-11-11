import { test } from "node:test";
import assert from "node:assert/strict";
import { autoPublico, fichaConDescripcion, disponibilidad, fotosPublicas } from "./auto-publico.js";

const auto = {
  id: 7,
  ref: "12",
  marca: "Volkswagen",
  modelo: "Gol Trend",
  anio: 2017,
  kms: 96000,
  tipo: "usado",
  tipo_vehiculo: "auto",
  combustible: "nafta",
  precio: 9800000,
  version: "1.6 Pack I",
  stock: 2,
  precio_contado: 9500000,
  anticipo: 3000000,
  descripcion: null,
  costo: 7000000,
  precio_venta: null,
  vendido_at: null,
  deleted_at: null,
  disponible: true,
  fotos_json: ["/vehiculos/gol-1.jpg", "https://blob.example.com/gol-2.jpg"],
  descuentos: null,
  auto_promociones: [],
  senas: [],
  tramites_interes: [],
  permutas: [],
  consignaciones: [],
};

test("la ficha pública nunca incluye el costo ni datos internos", () => {
  const ficha = autoPublico(auto);
  assert.equal("costo" in ficha, false);
  assert.equal("precio_venta" in ficha, false);
  assert.equal("id" in ficha, false);
  assert.equal("senas" in ficha, false);
});

test("la ficha pública trae lo que necesita el cliente", () => {
  const ficha = autoPublico(auto);
  assert.equal(ficha.ref, "12");
  assert.equal(ficha.marca, "Volkswagen");
  assert.equal(ficha.anio, 2017);
  assert.equal(ficha.precio_lista, 9800000);
  assert.equal("precio" in ficha, false);
  assert.equal(ficha.precio_final, 9800000);
  assert.equal(ficha.tipo, "auto");
  assert.equal(ficha.condicion, "usado");
  assert.equal(ficha.tiene_fotos, true);
});

test("la ficha del bot trae versión, stock, precio de lista, precio de contado y anticipo", () => {
  const ficha = autoPublico({ ...auto, precio_contado: "9500000.00", anticipo: "3000000.00" });
  assert.equal(ficha.version, "1.6 Pack I");
  assert.equal(ficha.stock, 2);
  assert.equal(ficha.precio_lista, 9800000);
  assert.equal(ficha.precio_contado, 9500000);
  assert.equal(ficha.anticipo, 3000000);
  assert.equal("descripcion" in ficha, false);
});

test("lo que no está cargado en el auto va en null", () => {
  const sinDatos = { ...auto, version: "  ", precio_contado: null, anticipo: null, stock: null, descripcion: "   " };
  const ficha = autoPublico(sinDatos);
  assert.equal(ficha.version, null);
  assert.equal(ficha.precio_contado, null);
  assert.equal(ficha.anticipo, null);
  assert.equal(ficha.stock, null);
  assert.equal(fichaConDescripcion(sinDatos).descripcion, null);
  assert.equal(fichaConDescripcion({ ...sinDatos, descripcion: null }).descripcion, null);
});

test("la descripción va en una línea y recortada", () => {
  const una = fichaConDescripcion({ ...auto, descripcion: "  Único dueño.\n\nService al día\t y   VTV  " });
  assert.equal(una.descripcion, "Único dueño. Service al día y VTV");
  assert.equal(una.precio_lista, 9800000);
  const larga = fichaConDescripcion({ ...auto, descripcion: "a".repeat(2000) });
  assert.equal(larga.descripcion.length, 600);
});

test("disponible: a la venta, sin seña ni trámite", () => {
  assert.equal(disponibilidad(auto), "disponible");
});

test("vendido", () => {
  assert.equal(disponibilidad({ ...auto, vendido_at: new Date() }), "vendido");
});

test("reservado por una seña, sin decir de quién", () => {
  const conSena = { ...auto, senas: [{ id: 3, clientes: { nombre: "Otro cliente" } }] };
  assert.equal(disponibilidad(conSena), "reservado");
  assert.equal(JSON.stringify(autoPublico(conSena)).includes("Otro cliente"), false);
});

test("reservado si está en un trámite abierto", () => {
  assert.equal(disponibilidad({ ...auto, tramites_interes: [{ id: 1 }] }), "reservado");
  assert.equal(disponibilidad({ ...auto, permutas: [{ id: 1 }] }), "reservado");
});

test("no disponible si está borrado, pausado o con la consignación cerrada", () => {
  assert.equal(disponibilidad({ ...auto, deleted_at: new Date() }), "no_disponible");
  assert.equal(disponibilidad({ ...auto, disponible: false }), "no_disponible");
  assert.equal(disponibilidad({ ...auto, consignaciones: [{ estado: "retirado" }] }), "no_disponible");
});

test("las fotos se devuelven como direcciones públicas completas", () => {
  assert.deepEqual(fotosPublicas(auto, "https://agencia.com/"), [
    "https://agencia.com/vehiculos/gol-1.jpg",
    "https://blob.example.com/gol-2.jpg",
  ]);
});

test("sin fotos devuelve una lista vacía", () => {
  assert.deepEqual(fotosPublicas({ ...auto, fotos_json: null }, "https://agencia.com"), []);
});
