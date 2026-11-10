import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma.js";
import { errorHandler } from "../middlewares/error.js";
import { leerListaVehiculos, importarVehiculos } from "./importacion-vehiculos.service.js";

const H1 = "a".repeat(64);
const H2 = "b".repeat(64);
const ARCHIVOS = [`listas/${H1}.pdf`, `listas/${H2}.jpg`];

const STOCK = [{ ref: "12", marca: "Fiat", modelo: "Uno 1.3 Fire", version: null, anio: 2010, kms: 150000 }];

const UNO = {
  marca: "Fiat", modelo: "Uno", version: "Fire 1.3", anio: 2010, kms: 150000, condicion: "usado",
  tipoVehiculo: "auto", combustible: "nafta", precio: 9000000, precio_contado: null, anticipo: null, dudosos: [],
};
const SANDERO = {
  marca: "Renault", modelo: "Sandero", version: "1.6", anio: 2011, kms: 120000, condicion: null,
  tipoVehiculo: null, combustible: null, precio: null, precio_contado: null, anticipo: null, dudosos: ["precio"],
};

const IMPORTACION_PREVIA = { importacion: { created_at: new Date("2026-11-10T15:00:00Z"), creados: 23 } };

function conBase(t, { huellaUsada = null, stock = STOCK, fallaRegistro = null } = {}) {
  const escrito = { importaciones: [], autos: [], huellasPedidas: [], stockPedido: [] };
  const archivos = prisma.importaciones_vehiculos_archivos;
  const importaciones = prisma.importaciones_vehiculos;
  const originales = {
    huella: archivos.findFirst,
    importacion: importaciones.create,
    findMany: prisma.autos.findMany,
    createMany: prisma.autos.createMany,
    raw: prisma.$queryRawUnsafe,
    transaccion: prisma.$transaction,
  };

  archivos.findFirst = async (args) => (escrito.huellasPedidas.push(args.where), huellaUsada);
  importaciones.create = async (args) => {
    if (fallaRegistro) throw fallaRegistro;
    escrito.importaciones.push(args.data);
    return { id: 7 };
  };
  prisma.autos.findMany = async (args) => (escrito.stockPedido.push(args.where), stock);
  prisma.autos.createMany = async (args) => (escrito.autos.push(...args.data), { count: args.data.length });
  prisma.$queryRawUnsafe = async () => [{ next: 30 }];
  prisma.$transaction = async (fn, opciones) => ((escrito.opcionesTransaccion = opciones), fn(prisma));

  t.after(() => {
    archivos.findFirst = originales.huella;
    importaciones.create = originales.importacion;
    prisma.autos.findMany = originales.findMany;
    prisma.autos.createMany = originales.createMany;
    prisma.$queryRawUnsafe = originales.raw;
    prisma.$transaction = originales.transaccion;
  });
  return escrito;
}

const SIN_IA = {
  firmar: async () => assert.fail("no debería firmar los archivos"),
  leer: async () => assert.fail("no debería llamar a la IA"),
};

function conIa(leido = { vehiculos: [UNO, { ...SANDERO, color: "Gris" }] }) {
  const pedidos = [];
  const deps = {
    firmar: async (pathnames) => pathnames.map((p) => `https://firmada/${p}`),
    leer: async (pedido) => (pedidos.push(pedido), leido),
  };
  return { pedidos, deps };
}

function respuestaDe(error) {
  const res = {
    statusCode: 200,
    payload: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.payload = b; return this; },
  };
  const silenciar = console.error;
  console.error = () => {};
  try {
    errorHandler(error, {}, res, () => {});
  } finally {
    console.error = silenciar;
  }
  return res;
}

test("una lista ya importada se frena antes de leerla", async (t) => {
  const escrito = conBase(t, { huellaUsada: IMPORTACION_PREVIA });
  await assert.rejects(
    leerListaVehiculos({ archivos: ARCHIVOS }, SIN_IA),
    (e) => e.status === 409 && /10\/11\/2026/.test(e.message) && /23 vehículos/.test(e.message)
  );
  assert.deepEqual(escrito.huellasPedidas[0], { huella: { in: [H1, H2] } });
});

test("leer la lista devuelve cada fila con su estado", async (t) => {
  const escrito = conBase(t);
  const { pedidos, deps } = conIa();
  const { filas } = await leerListaVehiculos({ archivos: ARCHIVOS }, deps);

  assert.deepEqual(filas.map((f) => [f.modelo, f.estado]), [["Uno", "ya_cargado"], ["Sandero", "nuevo"]]);
  assert.equal("color" in filas[1], false);
  assert.deepEqual(pedidos[0].pdfs, [`https://firmada/listas/${H1}.pdf`]);
  assert.deepEqual(pedidos[0].imagenes, [`https://firmada/listas/${H2}.jpg`]);
  assert.deepEqual(escrito.stockPedido[0], { deleted_at: null, vendido_at: null });
});

test("leer la lista avisa cuántas filas no se pudieron leer", async (t) => {
  conBase(t);
  const { deps } = conIa({ vehiculos: [UNO, { ...SANDERO, modelo: null }] });
  const resultado = await leerListaVehiculos({ archivos: ARCHIVOS }, deps);
  assert.equal(resultado.filas.length, 1);
  assert.equal(resultado.descartadas, 1);
});

test("la importación compara contra lo confirmado al momento, no contra una foto vieja", async (t) => {
  const escrito = conBase(t, { stock: [] });
  await importarVehiculos({ archivos: ARCHIVOS, vehiculos: [SANDERO] }, 3);
  assert.equal(escrito.opcionesTransaccion?.isolationLevel, "ReadCommitted");
  assert.ok(escrito.opcionesTransaccion?.timeout >= 10_000);
});

test("si la IA no encuentra vehículos, lo dice", async (t) => {
  conBase(t);
  const { deps } = conIa({ vehiculos: [] });
  await assert.rejects(leerListaVehiculos({ archivos: ARCHIVOS }, deps), (e) => e.status === 422);
});

test("importar crea solo los autos que no están en el stock", async (t) => {
  const escrito = conBase(t);
  const resultado = await importarVehiculos({ archivos: ARCHIVOS, vehiculos: [UNO, SANDERO] }, 3);

  assert.deepEqual(resultado, { creados: 1, omitidos: 1 });
  assert.deepEqual(escrito.autos.map((a) => a.modelo), ["Sandero"]);
  assert.deepEqual(escrito.importaciones[0], {
    usuario_id: 3,
    creados: 1,
    omitidos: 1,
    archivos: { create: [{ huella: H1, pathname: ARCHIVOS[0] }, { huella: H2, pathname: ARCHIVOS[1] }] },
  });
});

test("los autos importados entran sin publicar y atados a su importación", async (t) => {
  const escrito = conBase(t, { stock: [] });
  const conCamposDeMas = { ...UNO, disponible: true, ref: "999", importacion_id: 1, costo: 1, stock: 9, descripcion: "x", dominio: "AA000AA", imgs: ["x"] };
  await importarVehiculos({ archivos: ARCHIVOS, vehiculos: [conCamposDeMas, SANDERO] }, 3);

  assert.deepEqual(
    escrito.autos.map((a) => [a.ref, a.disponible, a.importacion_id, a.version]),
    [["30", false, 7, "Fire 1.3"], ["31", false, 7, "1.6"]]
  );
  for (const auto of escrito.autos) {
    for (const campo of ["costo", "stock", "descripcion", "dominio", "fotos_json"]) {
      assert.equal(campo in auto, false, `${campo} no viene de la lista`);
    }
  }
  assert.equal(escrito.autos[1].precio, 0);
  assert.equal(escrito.autos[1].tipo, "usado");
});

test("una fila inválida no crea nada", async (t) => {
  const escrito = conBase(t, { stock: [] });
  await assert.rejects(
    importarVehiculos({ archivos: ARCHIVOS, vehiculos: [SANDERO, { ...UNO, anio: 1800 }] }, 3),
    (e) => e.status === 400 && /Fiat Uno 1800/.test(e.message)
  );
  assert.equal(escrito.importaciones.length, 0);
  assert.equal(escrito.autos.length, 0);
});

test("importar la misma lista dos veces se rechaza", async (t) => {
  const escrito = conBase(t, { huellaUsada: IMPORTACION_PREVIA, stock: [] });
  await assert.rejects(importarVehiculos({ archivos: ARCHIVOS, vehiculos: [SANDERO] }, 3), (e) => e.status === 409);
  assert.equal(escrito.importaciones.length, 0);
  assert.equal(escrito.autos.length, 0);
});

test("si otra importación registró la huella primero, se rechaza sin crear nada", async (t) => {
  const carrera = Object.assign(new Error("Unique constraint failed"), { code: "P2002", meta: { target: "uq_importacion_huella" } });
  const escrito = conBase(t, { stock: [], fallaRegistro: carrera });
  const error = await importarVehiculos({ archivos: ARCHIVOS, vehiculos: [SANDERO] }, 3).catch((e) => e);

  assert.equal(escrito.autos.length, 0);
  const res = respuestaDe(error);
  assert.equal(res.statusCode, 409);
  assert.match(res.payload.error, /ya se importó/);
});

test("importar sin vehículos o con demasiados se rechaza", async (t) => {
  conBase(t, { stock: [] });
  await assert.rejects(importarVehiculos({ archivos: ARCHIVOS, vehiculos: [] }, 3), (e) => e.status === 400);
  await assert.rejects(importarVehiculos({ archivos: ARCHIVOS, vehiculos: Array(201).fill(SANDERO) }, 3), (e) => e.status === 400);
});
