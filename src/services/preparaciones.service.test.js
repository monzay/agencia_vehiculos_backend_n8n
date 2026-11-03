import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma.js";
import {
  listarPreparaciones,
  obtenerPreparacion,
  actualizarPreparacion,
  publicarPreparacion,
  despublicarPreparacion,
  entrarEnPreparacion,
  salirDePreparacion,
} from "./preparaciones.service.js";
import { cerrarVenta, abrirVenta } from "./vehiculos.service.js";

const FECHA = new Date("2026-11-01T12:00:00Z");
const papel = (tipo, extra = {}) => ({ tipo, tenencia: "original", fecha_vencimiento: null, datos_json: {}, ...extra });
const ingreso = (extra = {}) => ({
  id: 4,
  modalidad: "compra",
  estado: "recepcion",
  dominio: "AB123CD",
  marca: "Fiat",
  modelo: "Uno",
  anio: 2015,
  motor: "M1",
  chasis: "C1",
  km_recepcion: 80000,
  fotos_json: ["https://x/a.webp"],
  titular: { id: 5, nombre: "Ana" },
  compraventa_contratos: { precio: 5000000, firmado_at: FECHA, deleted_at: null },
  consignacion_documentos: [papel("titulo"), papel("formulario_08"), papel("informe_dominio", { datos_json: { prenda: false, embargo: false, inhibicion: false } })],
  ...extra,
});
const preparacion = (extra = {}) => ({ id: 1, ingreso_id: 4, estado: "listo", precio_venta: 9000000, descripcion: "Impecable", auto_id: null, auto: null, created_at: FECHA, deleted_at: null, ingreso: ingreso(), ...extra });
const PUBLICADO = { id: 70, ref: "70", disponible: true, vendido_at: null, deleted_at: null, fotos_json: ["https://x/ficha.webp"] };

// Reemplaza las tablas de Prisma por una base en memoria: ninguna escritura llega a
// la base real, y `escrituras` anota lo que el servicio intentó guardar.
function conBase(t, fila, { filas = [fila], senaReserva = null, tramite = null } = {}) {
  const escrituras = [];
  const pedidos = [];
  const anotar = (tabla, metodo, respuesta = () => ({})) => async (args) => {
    escrituras.push({ tabla, metodo, ...args });
    return respuesta(args);
  };
  const reemplazos = {
    preparaciones: {
      findFirst: async () => fila,
      findMany: async (args) => (pedidos.push(args), filas),
      count: async () => filas.length,
      update: anotar("preparaciones", "update", ({ data }) => ({ ...fila, ...data })),
    },
    autos: {
      create: anotar("autos", "create", ({ data }) => ({ id: 80, ...data })),
      update: anotar("autos", "update", ({ data }) => ({ ...fila?.auto, ...data })),
      findFirst: async () => fila?.auto ?? null,
    },
    senas: { findFirst: async () => senaReserva },
    compraventa_contratos: { findFirst: async () => null },
    consignacion_ingresos: { findFirst: async () => tramite },
  };
  const originales = Object.entries(reemplazos).map(([tabla, metodos]) => [tabla, Object.fromEntries(Object.keys(metodos).map((m) => [m, prisma[tabla][m]]))]);
  const transaccion = prisma.$transaction;
  const crudo = prisma.$queryRawUnsafe;

  Object.entries(reemplazos).forEach(([tabla, metodos]) => Object.assign(prisma[tabla], metodos));
  prisma.$transaction = async (arg) => (typeof arg === "function" ? arg(prisma) : Promise.all(arg));
  prisma.$queryRawUnsafe = async () => [{ next: 80 }];
  t.after(() => {
    originales.forEach(([tabla, metodos]) => Object.assign(prisma[tabla], metodos));
    prisma.$transaction = transaccion;
    prisma.$queryRawUnsafe = crudo;
  });
  return { escrituras, pedidos };
}

// ── Entrada y salida con la firma del boleto ──

function txDePrueba() {
  const escrituras = [];
  const anotar = (metodo) => async (args) => (escrituras.push({ metodo, ...args }), {});
  return { escrituras, tx: { preparaciones: { upsert: anotar("upsert"), update: anotar("update") } } };
}

test("firmar una compra o una parte de pago con usado lo manda a preparación", async () => {
  for (const fila of [{ id: 4, modalidad: "compra" }, { id: 4, modalidad: "permuta", parte_pago_valor: 100 }]) {
    const { tx, escrituras } = txDePrueba();
    await entrarEnPreparacion(fila, tx);
    assert.deepEqual(escrituras[0].where, { ingreso_id: 4 }, fila.modalidad);
    assert.equal(escrituras[0].update.deleted_at, null, "volver a firmar la reactiva");
  }
});

test("sin usado no hay nada que preparar", async () => {
  for (const fila of [{ id: 4, modalidad: "contado" }, { id: 4, modalidad: "permuta", parte_pago_valor: 0 }]) {
    const { tx, escrituras } = txDePrueba();
    await entrarEnPreparacion(fila, tx);
    assert.deepEqual(escrituras, [], fila.modalidad);
  }
});

test("desfirmar la saca de preparación si nunca tuvo ficha", async () => {
  const { tx, escrituras } = txDePrueba();
  await salirDePreparacion({ preparacion: { id: 1, auto_id: null, deleted_at: null } }, tx);
  assert.deepEqual(escrituras[0].where, { id: 1 });
  assert.ok(escrituras[0].data.deleted_at instanceof Date);
});

test("con ficha en la web no se puede desfirmar", async () => {
  const { tx, escrituras } = txDePrueba();
  await assert.rejects(salirDePreparacion({ preparacion: { id: 1, auto_id: 70, deleted_at: null } }, tx), (e) => e.status === 409 && /ficha/.test(e.message));
  assert.deepEqual(escrituras, []);
});

test("desfirmar sin preparación no hace nada", async () => {
  for (const fila of [{}, { preparacion: { id: 1, auto_id: null, deleted_at: FECHA } }]) {
    const { tx, escrituras } = txDePrueba();
    await salirDePreparacion(fila, tx);
    assert.deepEqual(escrituras, []);
  }
});

// ── Lecturas ──

test("el admin ve el valor de toma y el titular; el asesor no", async (t) => {
  conBase(t, preparacion());
  const admin = await obtenerPreparacion(1, { admin: true });
  assert.equal(admin.valorToma, 5000000);
  assert.equal(admin.titular.nombre, "Ana");

  const asesor = await obtenerPreparacion(1, { admin: false });
  assert.equal(asesor.valorToma, undefined);
  assert.equal(asesor.titular, undefined);
  assert.equal(asesor.vehiculo.marca, "Fiat");
  assert.equal(asesor.requisitos.habilitado, true);
});

test("una preparación inexistente da 404", async (t) => {
  conBase(t, null);
  await assert.rejects(obtenerPreparacion(1, { admin: true }), (e) => e.status === 404);
  await assert.rejects(obtenerPreparacion("abc", { admin: true }), (e) => e.status === 404);
});

test("la lista filtra por etapa y no trae trámites borrados", async (t) => {
  const { pedidos } = conBase(t, preparacion());
  const { items, total } = await listarPreparaciones({ etapa: "publicado" }, { admin: true });
  assert.equal(total, 1);
  assert.equal(items[0].etapa, "listo");
  const filtros = JSON.stringify(pedidos[0].where);
  assert.match(filtros, /"disponible":true/);
  assert.match(filtros, /"ingreso":\{"is":\{"deleted_at":null\}\}/);
});

test("los días cuentan hasta que se publica", async (t) => {
  conBase(t, preparacion());
  assert.ok((await obtenerPreparacion(1, { admin: true })).dias >= 1);
});

// ── Edición ──

test("se editan el avance, el precio y la descripción", async (t) => {
  const { escrituras } = conBase(t, preparacion());
  await actualizarPreparacion(1, { estado: "en_preparacion", precioVenta: 8500000, descripcion: "  Único dueño  " });
  const { data } = escrituras[0];
  assert.equal(data.estado, "en_preparacion");
  assert.equal(data.precio_venta, 8500000);
  assert.equal(data.descripcion, "Único dueño");
});

test("un avance o precio inválido se rechaza", async (t) => {
  const { escrituras } = conBase(t, preparacion());
  await assert.rejects(actualizarPreparacion(1, { estado: "publicado" }), (e) => e.status === 400);
  await assert.rejects(actualizarPreparacion(1, { precioVenta: -5 }), (e) => e.status === 400);
  assert.deepEqual(escrituras, []);
});

test("publicado o vendido, se edita en Vehículos", async (t) => {
  const { escrituras } = conBase(t, preparacion({ auto_id: 70, auto: PUBLICADO }));
  await assert.rejects(actualizarPreparacion(1, { precioVenta: 1 }), (e) => e.status === 409 && /Vehículos/.test(e.message));
  assert.deepEqual(escrituras, []);
});

// ── Publicar ──

test("publicar crea la ficha con los datos del título y el costo del boleto", async (t) => {
  const { escrituras } = conBase(t, preparacion());
  await publicarPreparacion(1);

  const ficha = escrituras.find((e) => e.tabla === "autos" && e.metodo === "create").data;
  assert.equal(ficha.ref, "80");
  assert.deepEqual([ficha.marca, ficha.modelo, ficha.anio, ficha.dominio, ficha.motor, ficha.chasis], ["Fiat", "Uno", 2015, "AB123CD", "M1", "C1"]);
  assert.equal(ficha.tipo, "usado");
  assert.equal(ficha.precio, 9000000);
  assert.equal(ficha.costo, 5000000);
  assert.equal(ficha.kms, 80000);
  assert.equal(ficha.descripcion, "Impecable");
  assert.deepEqual(ficha.fotos_json, ["https://x/a.webp"]);
  assert.equal(ficha.disponible, true);
  assert.equal(escrituras.find((e) => e.tabla === "preparaciones").data.auto_id, 80);
});

test("sin cumplir los requisitos no se publica, y dice qué falta", async (t) => {
  const { escrituras } = conBase(t, preparacion({ precio_venta: null, ingreso: ingreso({ fotos_json: [] }) }));
  await assert.rejects(publicarPreparacion(1), (e) => e.status === 409 && /precio/i.test(e.message) && /foto/i.test(e.message));
  assert.deepEqual(escrituras, []);
});

test("con prenda en el informe no se publica", async (t) => {
  const conPrenda = [papel("titulo"), papel("formulario_08"), papel("informe_dominio", { datos_json: { prenda: true } })];
  const { escrituras } = conBase(t, preparacion({ ingreso: ingreso({ consignacion_documentos: conPrenda }) }));
  await assert.rejects(publicarPreparacion(1), (e) => e.status === 409 && /informe/i.test(e.message));
  assert.deepEqual(escrituras, []);
});

test("volver a publicar reusa la ficha, sin pisar sus fotos ni su costo", async (t) => {
  const { escrituras } = conBase(t, preparacion({ auto_id: 70, auto: { ...PUBLICADO, disponible: false } }));
  await publicarPreparacion(1);

  assert.equal(escrituras.some((e) => e.metodo === "create"), false);
  const { where, data } = escrituras.find((e) => e.tabla === "autos");
  assert.deepEqual(where, { id: 70 });
  assert.equal(data.disponible, true);
  assert.equal(data.precio, 9000000);
  assert.deepEqual(data.fotos_json, ["https://x/ficha.webp"]);
  assert.equal(data.costo, undefined);
});

test("ya publicado o vendido no se vuelve a publicar", async (t) => {
  for (const auto of [PUBLICADO, { ...PUBLICADO, disponible: false, vendido_at: FECHA }]) {
    const { escrituras } = conBase(t, preparacion({ auto_id: 70, auto }));
    await assert.rejects(publicarPreparacion(1), (e) => e.status === 409);
    assert.deepEqual(escrituras, []);
  }
});

test("si la ficha se borró en Vehículos, publicar crea otra", async (t) => {
  const { escrituras } = conBase(t, preparacion({ auto_id: 70, auto: { ...PUBLICADO, disponible: false, deleted_at: FECHA } }));
  await publicarPreparacion(1);
  assert.ok(escrituras.some((e) => e.tabla === "autos" && e.metodo === "create"));
  assert.equal(escrituras.find((e) => e.tabla === "preparaciones").data.auto_id, 80);
});

// ── Despublicar ──

test("despublicar saca el auto de la web y conserva la ficha", async (t) => {
  const { escrituras } = conBase(t, preparacion({ auto_id: 70, auto: PUBLICADO }));
  await despublicarPreparacion(1);
  const { where, data } = escrituras.find((e) => e.tabla === "autos");
  assert.deepEqual(where, { id: 70 });
  assert.equal(data.disponible, false);
});

test("no se despublica lo que no está publicado, ni un auto vendido, señado o en trámite", async (t) => {
  const casos = [
    [preparacion(), {}],
    [preparacion({ auto_id: 70, auto: { ...PUBLICADO, disponible: false, vendido_at: FECHA } }), {}],
    [preparacion({ auto_id: 70, auto: PUBLICADO }), { senaReserva: { id: 1 } }],
    [preparacion({ auto_id: 70, auto: PUBLICADO }), { tramite: { id: 9 } }],
  ];
  for (const [fila, opciones] of casos) {
    const { escrituras } = conBase(t, fila, opciones);
    await assert.rejects(despublicarPreparacion(1), (e) => e.status === 409);
    assert.deepEqual(escrituras, []);
  }
});

// ── La compra termina cuando se vende el usado ──

function txDeVenta() {
  const compras = [];
  return {
    compras,
    tx: {
      autos: { update: async () => ({}) },
      consignaciones: { update: async () => ({}) },
      senas: { updateMany: async () => ({}) },
      consignacion_ingresos: { updateMany: async (args) => (compras.push(args), {}) },
    },
  };
}

test("vender el usado cierra la compra, y deshacerlo la reabre", async () => {
  const auto = { id: 70, consignaciones: [] };
  const venta = txDeVenta();
  await cerrarVenta(venta.tx, auto, { precio: 1, fecha: FECHA });
  const cierre = venta.compras.find((c) => c.where.modalidad === "compra");
  assert.deepEqual(cierre.where.preparacion, { is: { auto_id: 70 } });
  assert.equal(cierre.where.estado, "recepcion");
  assert.equal(cierre.data.estado, "vendido");

  const reapertura = txDeVenta();
  await abrirVenta(reapertura.tx, auto);
  const abierta = reapertura.compras.find((c) => c.where.modalidad === "compra");
  assert.equal(abierta.where.estado, "vendido");
  assert.equal(abierta.data.estado, "recepcion");
});
