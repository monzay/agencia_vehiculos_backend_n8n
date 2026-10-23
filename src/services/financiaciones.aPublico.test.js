import { test } from "node:test";
import assert from "node:assert/strict";
import { aPublico, consultarPorDni } from "./financiaciones.service.js";

// Regresión de F1: la consulta pública por DNI NO debe filtrar identidad ni
// contacto de la persona, solo el plan de cuotas. Si alguien vuelve a dejar
// pasar `nombre`, `dni` o `telefonoAlt` en la vista pública, este test falla.
test("F1 — la vista pública no expone PII, solo el plan", () => {
  const completo = {
    id: 1,
    clienteId: 9,
    nombre: "Juan Pérez",
    dni: "30111222",
    telefono: "3510000000",
    telefonoAlt: "3511111111",
    email: "juan@example.com",
    cantidadCuotas: 12,
    precioCuota: 1000,
    montoTotal: 12000,
    saldo: 8000,
    cronograma: [{ numero: 1, vencimiento: "2026-01-10", pagado: true }],
  };

  const pub = aPublico(completo);

  for (const prohibido of ["nombre", "dni", "telefono", "telefonoAlt", "email", "clienteId"]) {
    assert.ok(!(prohibido in pub), `la vista pública NO debe exponer "${prohibido}"`);
  }

  // Y sigue devolviendo lo que el cliente necesita ver de su plan.
  assert.equal(pub.cantidadCuotas, 12);
  assert.equal(pub.saldo, 8000);
  assert.ok(Array.isArray(pub.cronograma));
});

// Regresión de F2: Express arma objetos con `?dni[not]=x`. Si llegan al `where`
// de Prisma son operadores: devolverían los planes de todos o dejarían adivinar
// DNIs de a un dígito con `startsWith`. La consulta pública solo acepta texto.
test("F2 — la consulta pública rechaza un DNI que no es texto y no toca la base", async () => {
  const sinBase = { findMany: async () => assert.fail("no tiene que consultar la base") };
  const db = { clientes: sinBase, financiaciones: sinBase };
  for (const dni of [{ not: "x" }, { startsWith: "3" }, ["30111222", "30111223"], 30111222]) {
    await assert.rejects(consultarPorDni(dni, db), (e) => e.status === 400, `debería rechazar ${JSON.stringify(dni)}`);
  }
});

test("la consulta pública busca el DNI exacto que se escribió, solo entre las fichas vigentes", async () => {
  const pedidos = [];
  const db = { clientes: { findMany: async (args) => (pedidos.push(args), []) }, financiaciones: { findMany: async () => [] } };
  assert.deepEqual(await consultarPorDni(" 30111222 ", db), []);
  assert.deepEqual(pedidos[0].where, { dni: "30111222", deleted_at: null });
});

// La base guarda el DNI solo con dígitos: quien lo escribe con puntos, espacios o guiones también lo encuentra.
test("la consulta pública normaliza el DNI a dígitos antes de buscarlo", async () => {
  for (const escrito of ["30.111.222", " 30 111 222 ", "30-111-222", "30111222"]) {
    const pedidos = [];
    const db = { clientes: { findMany: async (args) => (pedidos.push(args), []) }, financiaciones: { findMany: async () => [] } };

    await consultarPorDni(escrito, db);

    assert.deepEqual(pedidos[0].where, { dni: "30111222", deleted_at: null }, `con ${JSON.stringify(escrito)}`);
  }
});

test("quien escribe su DNI con puntos encuentra su plan", async () => {
  const fichas = [{ id: 1, dni: "30111222", deleted_at: null }];
  const plan = {
    id: 10,
    cliente_id: 1,
    cantidad_cuotas: 12,
    precio_cuota: 1000,
    dia_pago: 10,
    activo: true,
    created_at: new Date("2026-01-05T12:00:00Z"),
    clientes: fichas[0],
    pagos: [],
  };
  const db = {
    clientes: { findMany: async ({ where }) => fichas.filter((f) => f.dni === where.dni) },
    financiaciones: { findMany: async ({ where }) => [plan].filter((p) => where.cliente_id.in.includes(p.cliente_id)) },
  };

  const publicas = await consultarPorDni("30.111.222", db);

  assert.deepEqual(publicas.map((p) => p.id), [10]);
});

test("la consulta pública rechaza con 400 un texto sin dígitos y no toca la base", async () => {
  const sinBase = { findMany: async () => assert.fail("no tiene que consultar la base") };
  const db = { clientes: sinBase, financiaciones: sinBase };
  for (const vacio of ["", "   ", "abc", " . - . ", undefined, null]) {
    await assert.rejects(consultarPorDni(vacio, db), (e) => e.status === 400, `debería rechazar ${JSON.stringify(vacio)}`);
  }
});

test("la consulta pública no muestra las financiaciones de una ficha archivada", async () => {
  const archivada = new Date("2026-10-10T12:00:00Z");
  const fichas = [
    { id: 1, dni: "30111222", deleted_at: null },
    { id: 2, dni: "30111222", deleted_at: archivada },
  ];
  const plan = (id, clienteId) => ({
    id,
    cliente_id: clienteId,
    cantidad_cuotas: 12,
    precio_cuota: 1000,
    dia_pago: 10,
    activo: true,
    created_at: new Date("2026-01-05T12:00:00Z"),
    clientes: fichas.find((f) => f.id === clienteId),
    pagos: [],
  });
  const planes = [plan(10, 1), plan(20, 2)];
  const db = {
    // Como Prisma: sin `deleted_at` en el where no filtra por él.
    clientes: {
      findMany: async ({ where }) =>
        fichas.filter((f) => f.dni === where.dni && (where.deleted_at === undefined || f.deleted_at === where.deleted_at)),
    },
    financiaciones: { findMany: async ({ where }) => planes.filter((p) => where.cliente_id.in.includes(p.cliente_id)) },
  };

  const publicas = await consultarPorDni("30111222", db);

  assert.deepEqual(publicas.map((p) => p.id), [10]);
});

test("la vista pública tampoco muestra las respuestas del cliente ni la baja de avisos (son del admin)", () => {
  const pub = aPublico({ id: 1, cantidadCuotas: 12, respuestas: [{ tipo: "transferencia" }], avisosBaja: "2026-10-01", proximoAviso: { numero: 1 } });
  for (const prohibido of ["respuestas", "avisosBaja", "proximoAviso"]) {
    assert.ok(!(prohibido in pub), `la vista pública NO debe exponer "${prohibido}"`);
  }
});
