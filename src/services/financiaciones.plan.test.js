import { test } from "node:test";
import assert from "node:assert/strict";
import { actualizarFinanciacion } from "./financiaciones.service.js";

// Editar un plan toca el cliente, los pagos y la financiación: va en UNA
// transacción y, al bajar las cuotas, los pagos que sobran se ANULAN (deleted_at),
// nunca se borran.

const unaFinanciacion = (extra = {}) => ({
  id: 5,
  cliente_id: 9,
  ingreso_id: null,
  cantidad_cuotas: 12,
  precio_cuota: 1000,
  dia_pago: 10,
  telefono_alt: null,
  activo: true,
  avisos_baja_at: null,
  created_at: new Date("2026-01-05T12:00:00Z"),
  updated_at: new Date("2026-01-05T12:00:00Z"),
  deleted_at: null,
  clientes: { id: 9, nombre: "Juan Pérez", telefono: "3885550101", dni: "30111222", email: "juan@example.com" },
  pagos: [],
  ...extra,
});

// Los modelos de nivel superior de `db` revientan si se usan: toda lectura y
// escritura tiene que ir por `tx`.
const fueraDeLaTransaccion = (modelo) =>
  new Proxy({}, {
    get: (_, metodo) => () => {
      throw new Error(`${modelo}.${String(metodo)} se usó fuera de la transacción`);
    },
  });

function baseFalsa({ existente = unaFinanciacion(), errorAlActualizarPlan = null, errorAlActualizarCliente = null } = {}) {
  const llamadas = [];
  const transacciones = { abiertas: 0, confirmadas: 0, revertidas: 0 };
  const registrar = (nombre, resultado) => async (args) => {
    llamadas.push({ nombre, args });
    return resultado(args);
  };
  const tx = {
    financiaciones: {
      findFirst: registrar("financiaciones.findFirst", () => existente),
      update: registrar("financiaciones.update", ({ data }) => {
        if (errorAlActualizarPlan) throw errorAlActualizarPlan;
        return { ...existente, ...data };
      }),
    },
    clientes: {
      update: registrar("clientes.update", ({ data }) => {
        if (errorAlActualizarCliente) throw errorAlActualizarCliente;
        return { ...existente.clientes, ...data };
      }),
    },
    // Sin delete ni deleteMany a propósito: un borrado físico de pagos revienta el test.
    financiacion_pagos: { updateMany: registrar("financiacion_pagos.updateMany", () => ({ count: 6 })) },
  };
  return {
    llamadas,
    transacciones,
    financiaciones: fueraDeLaTransaccion("financiaciones"),
    clientes: fueraDeLaTransaccion("clientes"),
    financiacion_pagos: fueraDeLaTransaccion("financiacion_pagos"),
    // Como la real: si el callback termina bien confirma; si lanza, revierte y propaga el error.
    $transaction: async (callback) => {
      transacciones.abiertas += 1;
      try {
        const resultado = await callback(tx);
        transacciones.confirmadas += 1;
        return resultado;
      } catch (e) {
        transacciones.revertidas += 1;
        throw e;
      }
    },
  };
}

// Los argumentos de cada llamada a `modelo.metodo`, en orden.
const pedidos = (db, nombre) => db.llamadas.filter((l) => l.nombre === nombre).map((l) => l.args);
// Todo lo que no es leer la financiación.
const escrituras = (db) => db.llamadas.filter((l) => l.nombre !== "financiaciones.findFirst");

test("bajar de 12 a 6 cuotas anula los pagos de las cuotas 7 en adelante y no borra nada", async () => {
  const db = baseFalsa();
  const antes = new Date();
  const resultado = await actualizarFinanciacion("5", { cantidadCuotas: 6 }, db);
  const despues = new Date();

  const anulaciones = pedidos(db, "financiacion_pagos.updateMany");
  assert.equal(anulaciones.length, 1);
  const { where, data } = anulaciones[0];
  assert.deepEqual(where, { financiacion_id: 5, numero: { gt: 6 }, deleted_at: null });
  assert.deepEqual(Object.keys(data), ["deleted_at"]);
  assert.ok(data.deleted_at instanceof Date);
  assert.ok(data.deleted_at >= antes && data.deleted_at <= despues, "se anula en el momento de la edición");
  assert.equal(resultado.cantidadCuotas, 6);
});

test("la cantidad de cuotas que llega como texto se anula como número", async () => {
  const db = baseFalsa();
  await actualizarFinanciacion(5, { cantidadCuotas: "6" }, db);
  assert.deepEqual(pedidos(db, "financiacion_pagos.updateMany")[0].where.numero, { gt: 6 });
});

test("anula los pagos antes de actualizar el plan, así la respuesta ya no los cuenta", async () => {
  const db = baseFalsa();
  await actualizarFinanciacion(5, { cantidadCuotas: 6 }, db);
  assert.deepEqual(
    db.llamadas.map((l) => l.nombre),
    ["financiaciones.findFirst", "financiacion_pagos.updateMany", "financiaciones.update"]
  );
});

for (const [caso, body] of [
  ["subir de 12 a 18 cuotas", { cantidadCuotas: 18 }],
  ["mantener las 12 cuotas", { cantidadCuotas: 12 }],
  ["cambiar otro dato del plan", { precioCuota: 1500 }],
]) {
  test(`${caso} no toca los pagos`, async () => {
    const db = baseFalsa();
    await actualizarFinanciacion(5, body, db);
    assert.deepEqual(pedidos(db, "financiacion_pagos.updateMany"), []);
    assert.equal(pedidos(db, "financiaciones.update").length, 1, "el plan sí se actualiza");
  });
}

test("los cambios del cliente y del plan van por tx, en una sola transacción", async () => {
  const db = baseFalsa();
  const resultado = await actualizarFinanciacion(
    "5", // el id llega como texto desde la URL
    {
      nombre: "  Ana Gómez ",
      telefono: "+54 388 555-0101",
      dni: " 30111222 ",
      email: "ana@example.com",
      precioCuota: 1500,
      diaPago: 15,
      telefonoAlt: "388-555-0102",
      activo: false,
    },
    db
  );

  assert.deepEqual(db.transacciones, { abiertas: 1, confirmadas: 1, revertidas: 0 });
  assert.deepEqual(pedidos(db, "clientes.update"), [
    { where: { id: 9 }, data: { nombre: "Ana Gómez", telefono: "3885550101", dni: "30111222", email: "ana@example.com" } },
  ]);
  const [{ where, data, include }] = pedidos(db, "financiaciones.update");
  const { updated_at, ...cambios } = data;
  assert.deepEqual(where, { id: 5 });
  assert.deepEqual(cambios, { precio_cuota: 1500, dia_pago: 15, telefono_alt: "3885550102", activo: false });
  assert.ok(updated_at instanceof Date);
  assert.ok(include.clientes && include.pagos, "pide el cliente y los pagos para armar la respuesta");
  assert.equal(resultado.precioCuota, 1500);
});

test("sin datos del cliente no toca su ficha y un body vacío solo sella updated_at del plan", async () => {
  const db = baseFalsa();
  await actualizarFinanciacion(5, undefined, db);
  assert.deepEqual(db.llamadas.map((l) => l.nombre), ["financiaciones.findFirst", "financiaciones.update"]);
  assert.deepEqual(Object.keys(pedidos(db, "financiaciones.update")[0].data), ["updated_at"]);
});

test("un teléfono alternativo vacío lo deja en null", async () => {
  const db = baseFalsa({ existente: unaFinanciacion({ telefono_alt: "3885550102" }) });
  await actualizarFinanciacion(5, { telefonoAlt: "" }, db);
  assert.equal(pedidos(db, "financiaciones.update")[0].data.telefono_alt, null);
});

test("si la financiación no existe (o está borrada) devuelve null y no escribe nada", async () => {
  const db = baseFalsa({ existente: null });
  assert.equal(await actualizarFinanciacion("99", { cantidadCuotas: 6, nombre: "Ana" }, db), null);
  assert.deepEqual(pedidos(db, "financiaciones.findFirst").map((p) => p.where), [{ id: 99, deleted_at: null }]);
  assert.deepEqual(escrituras(db), []);
});

for (const [caso, body] of [
  ["una cantidad de cuotas en 0", { cantidadCuotas: 0 }],
  ["una cantidad de cuotas fraccionaria", { cantidadCuotas: 2.5 }],
  ["una cantidad de cuotas nula", { cantidadCuotas: null }],
  ["una cantidad de cuotas sobre el máximo", { cantidadCuotas: 601 }],
  ["un precio de cuota negativo", { precioCuota: -1 }],
  ["un día de pago fuera de rango", { diaPago: 32 }],
  ["un nombre vacío", { nombre: "   " }],
  ["un nombre nulo", { nombre: null }],
  ["un nombre que es un objeto", { nombre: { apellido: "Gómez" } }],
  ["un nombre que es un número", { nombre: 123 }],
  ["un nombre que es una lista", { nombre: ["Ana"] }],
  ["un teléfono sin dígitos", { telefono: "abc" }],
  ["un DNI vacío", { dni: "" }],
  ["un DNI sin dígitos", { dni: "sin dni" }],
  ["un DNI en 0", { dni: "0" }],
  ["un DNI de un solo dígito", { dni: "1" }],
  ["un DNI de 6 dígitos", { dni: "123456" }],
  ["un DNI de 10 dígitos", { dni: "1234567890" }],
  ["un DNI con letras", { dni: "AB123456" }],
  ["un DNI con todos los dígitos iguales", { dni: "00000000" }],
  ["un DNI que es un objeto", { dni: { not: "x" } }],
  ["un DNI nulo", { dni: null }],
  ["un email inválido", { email: "no-es-un-mail" }],
  ["un email que es una lista", { email: ["ana@example.com"] }],
  ["un email que es un objeto", { email: { valor: "ana@example.com" } }],
  ["avisosWhatsapp que no es booleano", { avisosWhatsapp: "no" }],
  ["datos del cliente válidos y un plan inválido", { nombre: "Ana Gómez", cantidadCuotas: 0 }],
]) {
  test(`con ${caso} responde 400 y no escribe nada`, async () => {
    const db = baseFalsa();
    await assert.rejects(actualizarFinanciacion(5, body, db), (e) => e.status === 400);
    assert.deepEqual(escrituras(db), []);
  });
}

test("si falla la actualización del plan el error sale de la transacción (así la base la revierte)", async () => {
  const falla = new Error("Deadlock found when trying to get lock");
  const db = baseFalsa({ errorAlActualizarPlan: falla });
  await assert.rejects(actualizarFinanciacion(5, { nombre: "Ana Gómez", cantidadCuotas: 6 }, db), (e) => e === falla);
  assert.deepEqual(db.transacciones, { abiertas: 1, confirmadas: 0, revertidas: 1 });
});

test("apagar los avisos conserva la fecha de la baja original y encenderlos la limpia", async () => {
  const baja = new Date("2026-03-01T10:00:00Z");
  const avisosBajaAt = async (body, existente) => {
    const db = baseFalsa({ existente });
    await actualizarFinanciacion(5, body, db);
    return pedidos(db, "financiaciones.update")[0].data.avisos_baja_at;
  };

  assert.equal(await avisosBajaAt({ avisosWhatsapp: false }, unaFinanciacion({ avisos_baja_at: baja })), baja);
  assert.equal(await avisosBajaAt({ avisosWhatsapp: true }, unaFinanciacion({ avisos_baja_at: baja })), null);
  assert.ok((await avisosBajaAt({ avisosWhatsapp: false }, unaFinanciacion())) instanceof Date);
});

// ── Teléfono y DNI del cliente ──

const datosGuardadosDelCliente = async (body) => {
  const db = baseFalsa();
  await actualizarFinanciacion(5, body, db);
  return pedidos(db, "clientes.update")[0].data;
};

test("el teléfono del cliente se guarda con los 10 dígitos nacionales, venga como venga escrito", async () => {
  for (const telefono of ["+54 9 388 555-0101", "0388 15 555-0101", "388 555 0101", "5493885550101", 3885550101]) {
    assert.equal((await datosGuardadosDelCliente({ telefono })).telefono, "3885550101", `falló con ${telefono}`);
  }
});

test("un teléfono que no se puede normalizar se guarda con sus dígitos", async () => {
  assert.equal((await datosGuardadosDelCliente({ telefono: "+1 415 555 0123" })).telefono, "14155550123");
  assert.equal((await datosGuardadosDelCliente({ telefono: "12345" })).telefono, "12345");
});

test("el DNI del cliente se guarda solo con dígitos", async () => {
  for (const dni of ["30.111.222", " 30111222 ", "30 111 222", 30111222]) {
    assert.equal((await datosGuardadosDelCliente({ dni })).dni, "30111222", `falló con ${dni}`);
  }
});

test("el DNI y el nombre que se editan se validan con mensajes claros", async () => {
  const mensajeDe = async (body) => {
    const e = await actualizarFinanciacion(5, body, baseFalsa()).catch((falla) => falla);
    return [e.status, e.message];
  };

  assert.deepEqual(await mensajeDe({ dni: "" }), [400, "El DNI es obligatorio."]);
  assert.deepEqual(await mensajeDe({ dni: "AB123456" }), [400, "El DNI lleva solo números."]);
  assert.deepEqual(await mensajeDe({ dni: "1" }), [400, "El DNI debe tener entre 7 y 9 dígitos."]);
  assert.deepEqual(await mensajeDe({ dni: "11111111" }), [400, "El DNI no es válido."]);
  assert.deepEqual(await mensajeDe({ nombre: { apellido: "Gómez" } }), [400, "El nombre debe ser un texto"]);
  assert.deepEqual(await mensajeDe({ nombre: "  " }), [400, "El nombre no puede quedar vacío"]);
});

test("sin dni en el body no se valida ni se toca el DNI de la ficha", async () => {
  const db = baseFalsa();
  await actualizarFinanciacion(5, { nombre: "Ana Gómez" }, db);
  assert.deepEqual(pedidos(db, "clientes.update")[0].data, { nombre: "Ana Gómez" });
});

// El índice único de DNI entre fichas vigentes (074) avisa con P2002.
const choqueDeDni = () =>
  Object.assign(new Error("Unique constraint failed on the constraint: `uq_clientes_dni_vigente`"), {
    code: "P2002",
    meta: { target: "uq_clientes_dni_vigente" },
  });

test("si el DNI nuevo ya es de otro cliente responde 409 sin filtrar la base y no toca el plan", async () => {
  const db = baseFalsa({ errorAlActualizarCliente: choqueDeDni() });

  await assert.rejects(
    actualizarFinanciacion(5, { dni: "20111222", cantidadCuotas: 6 }, db),
    (e) => e.status === 409 && e.message === "Ese DNI ya es de otro cliente"
  );

  assert.deepEqual(db.transacciones, { abiertas: 1, confirmadas: 0, revertidas: 1 });
  assert.deepEqual(pedidos(db, "financiaciones.update"), [], "el plan no se escribe");
  assert.deepEqual(pedidos(db, "financiacion_pagos.updateMany"), [], "los pagos tampoco");
});

test("solo el choque de DNI se traduce: cualquier otro error sale tal cual, venga del cliente o del plan", async () => {
  const sinConexion = new Error("conexión perdida");
  const claveForanea = Object.assign(new Error("Foreign key constraint failed"), { code: "P2003" });
  for (const falla of [sinConexion, claveForanea]) {
    await assert.rejects(actualizarFinanciacion(5, { dni: "20111222" }, baseFalsa({ errorAlActualizarCliente: falla })), (e) => e === falla);
  }

  const duplicadoDelPlan = choqueDeDni();
  const db = baseFalsa({ errorAlActualizarPlan: duplicadoDelPlan });
  await assert.rejects(actualizarFinanciacion(5, { cantidadCuotas: 6 }, db), (e) => e === duplicadoDelPlan);
});
