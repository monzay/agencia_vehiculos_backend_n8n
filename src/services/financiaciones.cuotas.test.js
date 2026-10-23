import { test } from "node:test";
import assert from "node:assert/strict";
import { marcarCuota, obtenerFinanciacion } from "./financiaciones.service.js";

// Marcar/desmarcar cuotas con borrado lógico: desmarcar ANULA el pago (deleted_at)
// en vez de borrarlo, así la fila con su fecha de pago queda como historial;
// marcar crea una fila nueva y nunca pisa la fecha de un pago vigente.

const CUOTAS = 12;
const juan = { id: 7, nombre: "Juan Pérez", telefono: "3885550101", dni: "30111222", email: "juan@example.com" };
const plan = {
  id: 5,
  cliente_id: 7,
  cantidad_cuotas: CUOTAS,
  precio_cuota: 1000,
  dia_pago: 10,
  activo: true,
  created_at: new Date("2026-01-05T12:00:00Z"),
  deleted_at: null,
};

const pago = (extra = {}) => ({
  id: 1,
  financiacion_id: 5,
  numero: 3,
  pagado_en: new Date("2026-09-10T15:00:00Z"),
  deleted_at: null,
  ...extra,
});

const coincide = (fila, where) => Object.entries(where).every(([campo, valor]) => fila[campo] === valor);

// Base falsa con `financiacion_pagos` en memoria. Esa tabla NO tiene delete ni
// deleteMany a propósito: si el servicio intenta un borrado físico, el test revienta.
function baseFalsa({ pagos = [], financiacion = plan } = {}) {
  const db = {
    estado: { pagos },
    escrituras: [],
    consultas: [],
    financiaciones: {
      findFirst: async (args) => {
        db.consultas.push(args);
        if (!coincide(financiacion, args.where)) return null;
        if (!args.include) return financiacion;
        const filtro = args.include.pagos?.where ?? {};
        const pagosIncluidos = db.estado.pagos.filter((p) => p.financiacion_id === financiacion.id && coincide(p, filtro));
        return { ...financiacion, clientes: juan, pagos: pagosIncluidos, alertas: [] };
      },
    },
    financiacion_pagos: {
      findFirst: async ({ where }) => db.estado.pagos.find((p) => coincide(p, where)) ?? null,
      create: async ({ data }) => {
        db.escrituras.push({ metodo: "create", data });
        const nueva = { id: db.estado.pagos.length + 1, pagado_en: new Date(), deleted_at: null, ...data };
        db.estado = { pagos: [...db.estado.pagos, nueva] };
        return nueva;
      },
      updateMany: async ({ where, data }) => {
        db.escrituras.push({ metodo: "updateMany", where, data });
        const afectadas = db.estado.pagos.filter((p) => coincide(p, where));
        db.estado = { pagos: db.estado.pagos.map((p) => (afectadas.includes(p) ? { ...p, ...data } : p)) };
        return { count: afectadas.length };
      },
    },
  };
  return db;
}

test("desmarcar anula el pago vigente con deleted_at y nunca borra la fila", async () => {
  const db = baseFalsa({ pagos: [pago()] });
  const antes = new Date();

  const f = await marcarCuota("5", "3", false, db);

  const despues = new Date();
  assert.equal(db.escrituras.length, 1);
  const [{ metodo, where, data }] = db.escrituras;
  assert.equal(metodo, "updateMany");
  assert.deepEqual(where, { financiacion_id: 5, numero: 3, deleted_at: null });
  assert.deepEqual(Object.keys(data), ["deleted_at"]);
  assert.ok(data.deleted_at instanceof Date && data.deleted_at >= antes && data.deleted_at <= despues, "deleted_at es el momento de la anulación");
  assert.equal(db.estado.pagos.length, 1, "la fila queda como historial");
  assert.equal(db.estado.pagos[0].pagado_en.toISOString(), "2026-09-10T15:00:00.000Z", "conserva su fecha de pago");
  assert.equal(f.cronograma[2].pagado, false);
  assert.equal(f.cuotasPagadas, 0);
});

test("desmarcar una cuota sin pago vigente no toca la fila ya anulada", async () => {
  const anulada = pago({ deleted_at: new Date("2026-09-12T09:00:00Z") });
  const db = baseFalsa({ pagos: [anulada] });

  const f = await marcarCuota("5", "3", false, db);

  assert.deepEqual(db.estado.pagos, [anulada]);
  assert.equal(f.cuotasPagadas, 0);
});

test("marcar una cuota impaga crea la fila del pago", async () => {
  const db = baseFalsa();

  const f = await marcarCuota("5", "3", true, db);

  assert.deepEqual(db.escrituras, [{ metodo: "create", data: { financiacion_id: 5, numero: 3 } }]);
  assert.equal(f.cronograma[2].pagado, true);
  assert.equal(f.cuotasPagadas, 1);
});

test("desmarcar y volver a marcar deja la fila original anulada con su fecha y crea una vigente", async () => {
  const db = baseFalsa({ pagos: [pago({ id: 1 })] });

  await marcarCuota("5", "3", false, db);
  const f = await marcarCuota("5", "3", true, db);

  assert.equal(db.estado.pagos.length, 2);
  const [anulada, vigente] = db.estado.pagos;
  assert.equal(anulada.id, 1);
  assert.equal(anulada.pagado_en.toISOString(), "2026-09-10T15:00:00.000Z", "la fecha de pago original no se pisa");
  assert.ok(anulada.deleted_at instanceof Date);
  assert.equal(vigente.deleted_at, null);
  assert.equal(f.cuotasPagadas, 1);
});

test("marcar una cuota que ya está paga no crea ni actualiza nada y conserva la fecha original", async () => {
  const original = pago();
  const db = baseFalsa({ pagos: [original] });

  const f = await marcarCuota("5", "3", true, db);

  assert.deepEqual(db.escrituras, []);
  assert.deepEqual(db.estado.pagos, [original]);
  assert.equal(f.cronograma[2].pagado, true);
});

test("si otra marca simultánea ganó por el índice único (P2002), la cuota queda paga y no es error", async () => {
  const db = baseFalsa();
  db.financiacion_pagos.create = async () => {
    // La otra petición alcanzó a guardar su fila entre nuestra lectura y nuestro create.
    db.estado = { pagos: [pago({ id: 9 })] };
    throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
  };

  const f = await marcarCuota("5", "3", true, db);

  assert.equal(f.cronograma[2].pagado, true);
  assert.equal(f.cuotasPagadas, 1);
});

test("cualquier otro error al crear el pago se propaga", async () => {
  const fallas = [
    new Error("conexión perdida"),
    Object.assign(new Error("Foreign key constraint failed"), { code: "P2003" }),
    Object.assign(new Error("Can't reach database server"), { code: "P1001" }),
  ];
  for (const falla of fallas) {
    const db = baseFalsa();
    db.financiacion_pagos.create = async () => {
      throw falla;
    };
    await assert.rejects(marcarCuota("5", "3", true, db), (e) => e === falla, falla.message);
  }
});

test("un número de cuota fuera de rango da 400 y no escribe nada", async () => {
  for (const pagado of [true, false]) {
    for (const numero of ["0", "-1", "13", "1.5", "abc", "", null, undefined]) {
      const db = baseFalsa({ pagos: [pago()] });
      await assert.rejects(marcarCuota("5", numero, pagado, db), (e) => e.status === 400, `numero ${numero}, pagado ${pagado}`);
      assert.deepEqual(db.escrituras, []);
    }
  }
});

test("acepta la primera y la última cuota del plan", async () => {
  const db = baseFalsa();

  await marcarCuota("5", "1", true, db);
  await marcarCuota("5", String(CUOTAS), true, db);

  assert.deepEqual(db.escrituras.map((e) => e.data.numero), [1, CUOTAS]);
});

test("una financiación inexistente da null y no escribe nada", async () => {
  for (const pagado of [true, false]) {
    const db = baseFalsa({ pagos: [pago()] });
    assert.equal(await marcarCuota("999", "3", pagado, db), null);
    assert.deepEqual(db.escrituras, []);
  }
});

test("una financiación eliminada tampoco admite marcas: da null y no escribe nada", async () => {
  const db = baseFalsa({ pagos: [pago()], financiacion: { ...plan, deleted_at: new Date("2026-10-01T00:00:00Z") } });

  assert.equal(await marcarCuota("5", "3", false, db), null);
  assert.deepEqual(db.escrituras, []);
});

test("obtenerFinanciacion pide solo los pagos vigentes y no cuenta los anulados", async () => {
  const anulada = pago({ id: 2, numero: 2, deleted_at: new Date("2026-09-12T09:00:00Z") });
  const db = baseFalsa({ pagos: [pago({ id: 1, numero: 1 }), anulada] });

  const f = await obtenerFinanciacion("5", db);

  assert.deepEqual(db.consultas[0].include.pagos.where, { deleted_at: null });
  assert.equal(f.cuotasPagadas, 1);
  assert.deepEqual(f.cronograma.filter((c) => c.pagado).map((c) => c.numero), [1]);
});

test("obtenerFinanciacion da null si la financiación no existe o está eliminada", async () => {
  const eliminada = { ...plan, deleted_at: new Date("2026-10-01T00:00:00Z") };

  assert.equal(await obtenerFinanciacion("999", baseFalsa()), null);
  assert.equal(await obtenerFinanciacion("5", baseFalsa({ financiacion: eliminada })), null);
});
