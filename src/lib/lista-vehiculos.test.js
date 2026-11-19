import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ESQUEMA_LISTA,
  MAX_ARCHIVOS,
  validarArchivosDeLista,
  normalizarFilas,
  claveDeAuto,
  clasificarFilas,
} from "./lista-vehiculos.js";

const H1 = "a".repeat(64);
const H2 = "0123456789abcdef".repeat(4);

const conStatus = (status) => (e) => e.status === status;

const fila = (datos) => ({
  marca: null,
  modelo: null,
  version: null,
  anio: null,
  kms: null,
  condicion: null,
  tipoVehiculo: null,
  combustible: null,
  precio: null,
  precio_contado: null,
  anticipo: null,
  dudosos: [],
  ...datos,
});

const STOCK = [
  { ref: "12", marca: "Fiat", modelo: "Uno 1.3 Fire", version: null, anio: 2010, kms: 150000 },
  { ref: "20", marca: "Volkswagen", modelo: "Gol Trend", version: "1.6 Pack I", anio: 2014, kms: 85000 },
];

test("un archivo que no subió el panel se rechaza", () => {
  const ajenos = [
    undefined,
    [],
    "listas/x.jpg",
    ["https://otro.sitio/lista.jpg"],
    [`documentos/${H1}.jpg`],
    ["listas/lista.jpg"],
    [`listas/${H1}.png`],
    [`listas/../${H1}.jpg`],
    [`listas/${H1.toUpperCase()}.jpg`],
    [42],
    Array.from({ length: MAX_ARCHIVOS + 1 }, (_, i) => `listas/${String(i).repeat(64).slice(0, 64)}.jpg`),
  ];
  for (const archivos of ajenos) {
    assert.throws(() => validarArchivosDeLista(archivos), conStatus(400), JSON.stringify(archivos));
  }
});

test("el mismo archivo dos veces en un pedido se rechaza", () => {
  assert.throws(() => validarArchivosDeLista([`listas/${H1}.jpg`, `listas/${H1}.jpg`]), conStatus(400));
});

test("la huella sale del nombre del archivo", () => {
  assert.deepEqual(validarArchivosDeLista([`listas/${H1}.pdf`, ` listas/${H2}.jpg `]), [
    { pathname: `listas/${H1}.pdf`, huella: H1, tipo: "pdf" },
    { pathname: `listas/${H2}.jpg`, huella: H2, tipo: "imagen" },
  ]);
});

test("de la lista solo quedan los campos del formulario", () => {
  const leido = {
    marca: " Volkswagen ",
    modelo: "Gol Trend",
    version: "1.6 Pack I",
    anio: 2014,
    kms: 85000,
    condicion: "usado",
    tipoVehiculo: "auto",
    combustible: "nafta",
    precio: 12500000,
    precio_contado: 11000000,
    anticipo: null,
    dudosos: [],
    color: "Rojo",
    dominio: "AB123CD",
    observaciones: "Único dueño",
    disponible: true,
    ref: "1",
  };
  assert.deepEqual(normalizarFilas({ vehiculos: [leido], total: 1 }), [
    fila({
      marca: "Volkswagen",
      modelo: "Gol Trend",
      version: "1.6 Pack I",
      anio: 2014,
      kms: 85000,
      condicion: "usado",
      tipoVehiculo: "auto",
      combustible: "nafta",
      precio: 12500000,
      precio_contado: 11000000,
    }),
  ]);
});

test("una fila con tipo camion se importa como camion", () => {
  const [camion] = normalizarFilas({ vehiculos: [fila({ modelo: "Atego", tipoVehiculo: "camion" })] });
  assert.equal(camion.tipoVehiculo, "camion");
  assert.deepEqual(camion.dudosos, []);
});

test("el esquema de la lista explica qué es camioneta", () => {
  const descripcion = ESQUEMA_LISTA.shape.vehiculos.element.shape.tipoVehiculo.description;
  for (const palabra of ["camioneta", "SUV", "pick-up", "furgón", "camion", "moto"]) {
    assert.ok(descripcion?.includes(palabra), `falta "${palabra}" en: ${descripcion}`);
  }
});

test("un dato fuera de rango queda vacío y marcado como dudoso", () => {
  const [leida] = normalizarFilas({
    vehiculos: [
      fila({
        modelo: "Gol",
        anio: 1850,
        kms: "85.000",
        precio: 0,
        combustible: "kerosene",
        version: "x".repeat(200),
        dudosos: ["marca", "color", "marca"],
      }),
    ],
  });
  assert.equal(leida.anio, null);
  assert.equal(leida.kms, null);
  assert.equal(leida.precio, null);
  assert.equal(leida.combustible, null);
  assert.equal(leida.version.length, 80);
  assert.deepEqual([...leida.dudosos].sort(), ["anio", "combustible", "kms", "marca", "precio"]);
});

test("una fila sin modelo se descarta", () => {
  const filas = normalizarFilas({ vehiculos: [fila({ modelo: null }), fila({ modelo: "   " }), fila({ modelo: "Gol" }), "basura", null] });
  assert.deepEqual(filas.map((f) => f.modelo), ["Gol"]);
  assert.deepEqual(normalizarFilas(null), []);
  assert.deepEqual(normalizarFilas({ vehiculos: "no" }), []);
});

test("el orden de las palabras y las tildes no cambian la clave", () => {
  const delStock = claveDeAuto({ modelo: "Uno 1.3 Fire", version: null, anio: 2010, kms: 150000 });
  assert.equal(claveDeAuto({ modelo: "UNO", version: "FIRE 1,3", anio: 2010, kms: 150000 }), delStock);
  assert.equal(
    claveDeAuto({ modelo: "Clío Mío", version: null, anio: 2012, kms: 0 }),
    claveDeAuto({ modelo: "clio  mio", version: "", anio: 2012, kms: null })
  );
  assert.notEqual(claveDeAuto({ modelo: "Uno 1.3 Fire", anio: 2010, kms: 150001 }), delStock);
  assert.equal(claveDeAuto({ modelo: "Uno", anio: null, kms: 0 }), null);
});

test("un auto igual al stock queda como ya cargado", () => {
  const [clasificada] = clasificarFilas([fila({ modelo: "UNO", version: "Fire 1.3", anio: 2010, kms: 150000 })], STOCK);
  assert.equal(clasificada.estado, "ya_cargado");
  assert.deepEqual(clasificada.coincide, STOCK[0]);
});

test("un auto del mismo modelo y año con otros kms queda como parecido", () => {
  const [clasificada] = clasificarFilas([fila({ modelo: "Gol Trend", version: "1.6 Pack I", anio: 2014, kms: 90000 })], STOCK);
  assert.equal(clasificada.estado, "parecido");
  assert.equal(clasificada.coincide.ref, "20");
});

test("una fila igual a otra de la misma lista queda como repetida", () => {
  const corsa = fila({ modelo: "Corsa Classic", anio: 2008, kms: 200000 });
  const estados = clasificarFilas([corsa, { ...corsa }], STOCK).map((f) => f.estado);
  assert.deepEqual(estados, ["nuevo", "repetido"]);
});

test("un auto que no está en el stock queda como nuevo", () => {
  const original = fila({ modelo: "Sandero", anio: 2011, kms: 120000 });
  const [clasificada] = clasificarFilas([original], STOCK);
  assert.equal(clasificada.estado, "nuevo");
  assert.equal(clasificada.coincide, null);
  assert.equal(original.estado, undefined, "no modifica la fila que recibe");
});
