import { test } from "node:test";
import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import { prisma } from "../lib/prisma.js";
import { listarConsultas, listarConsultasVenta, obtenerConsulta, marcarConsultaAtendida } from "./consultas.service.js";

// El servicio usa el cliente Prisma único: se le cambian las lecturas por una
// base falsa en memoria que anota lo que le piden y devuelve `sesiones`.
function conBase(t, sesiones = [], { autos = [], vendedores = [] } = {}) {
  const pedidos = [];
  const originales = {
    chat_estado: { findMany: prisma.chat_estado.findMany, count: prisma.chat_estado.count },
    autos: { findMany: prisma.autos.findMany },
    vendedores: { findMany: prisma.vendedores.findMany },
  };
  prisma.chat_estado.findMany = async (args) => (pedidos.push(args), sesiones);
  prisma.chat_estado.count = async () => sesiones.length;
  prisma.autos.findMany = async () => autos;
  prisma.vendedores.findMany = async () => vendedores;
  t.after(() => Object.entries(originales).forEach(([modelo, metodos]) => Object.assign(prisma[modelo], metodos)));
  return pedidos;
}

// Una consulta de una persona cuya ficha dice "web" (llegó primero por la financiación)
// pero que le escribe al bot por WhatsApp.
const sesion = (id, extra = {}) => ({
  id,
  cliente_id: 5,
  auto_id: null,
  vendedor_id: null,
  tipo_lead: null,
  clasificacion: null,
  sesion_inicio: new Date("2026-10-18T12:00:00Z"),
  clientes: { id: 5, nombre: "Ana", telefono: "3884708347", canal: "web", canales: [{ canal: "whatsapp" }] },
  ...extra,
});

// El `where` que el servicio le manda a la base al buscar `q`.
async function whereDeBusqueda(t, q, listar = listarConsultas) {
  const pedidos = conBase(t);
  await listar({ q });
  return pedidos[0].where;
}

// Las alternativas de todos los OR del filtro.
const clausulas = (where) => where.AND.flatMap((filtro) => filtro.OR ?? []);
const hay = (where, clausula) => clausulas(where).some((c) => isDeepStrictEqual(c, clausula));
const telefonosBuscados = (where) =>
  clausulas(where)
    .filter((c) => c.clientes?.telefono)
    .map((c) => c.clientes.telefono.contains);

// ── Canal de cada consulta ──

test("cada consulta de la lista trae los canales de mensajería de su cliente", async (t) => {
  const pedidos = conBase(t);
  await listarConsultas();
  assert.equal(pedidos[0].include.clientes.include.canales.select.canal, true);
});

// El mapper toma `canales[0]`: sin orden, la base puede devolverlos en cualquiera y el
// canal que muestra la lista cambiaría entre pedidos para una persona con más de uno.
test("los canales de la lista vienen ordenados por id, así el primero es siempre el mismo", async (t) => {
  const pedidos = conBase(t);
  await listarConsultas();
  assert.deepEqual(pedidos[0].include.clientes.include.canales, { select: { canal: true }, orderBy: { id: "asc" } });
});

test("la lista muestra el canal de mensajería de la persona, no el de la ficha", async (t) => {
  conBase(t, [sesion(1)]);
  const { items } = await listarConsultas();
  assert.equal(items[0].canal, "whatsapp");
});

test("la consulta de una persona sin canales de mensajería muestra el canal de la ficha", async (t) => {
  conBase(t, [sesion(1, { clientes: { id: 5, nombre: "Ana", telefono: "3884708347", canal: "web", canales: [] } })]);
  const { items } = await listarConsultas();
  assert.equal(items[0].canal, "web");
});

test("buscar por canal: encuentra por el canal de la ficha o por un canal de mensajería de la persona", async (t) => {
  const where = await whereDeBusqueda(t, "whatsapp");
  assert.ok(hay(where, { clientes: { canal: { in: ["whatsapp"] } } }), "por clientes.canal");
  assert.ok(hay(where, { clientes: { canales: { some: { canal: { in: ["whatsapp"] } } } } }), "por clientes.canales");
});

test("buscar por 'web' solo mira la ficha: no es un canal de mensajería y Prisma rechazaría el valor", async (t) => {
  const where = await whereDeBusqueda(t, "web");
  assert.ok(hay(where, { clientes: { canal: { in: ["web"] } } }));
  assert.doesNotMatch(JSON.stringify(where), /canales/);
});

test("buscar algo que no es un canal no agrega filtros de canal", async (t) => {
  assert.doesNotMatch(JSON.stringify(await whereDeBusqueda(t, "Ana")), /canal/);
});

// ── Búsqueda por teléfono: el guardado tiene 10 dígitos, el usuario lo pega como quiera ──

const LISTADOS = [
  ["compra", listarConsultas],
  ["venta y consignación", listarConsultasVenta],
];

for (const [nombre, listar] of LISTADOS) {
  test(`buscar en ${nombre}: un número pegado con +54 9 también busca por el teléfono guardado`, async (t) => {
    const where = await whereDeBusqueda(t, "+54 9 388 470-8347", listar);
    assert.deepEqual(telefonosBuscados(where), ["+54 9 388 470-8347", "5493884708347", "3884708347"]);
  });

  test(`buscar en ${nombre}: un número con el formato del panel busca por sus dígitos`, async (t) => {
    const where = await whereDeBusqueda(t, "388 470-8347", listar);
    assert.deepEqual(telefonosBuscados(where), ["388 470-8347", "3884708347"]);
  });

  test(`buscar en ${nombre}: un número parcial se busca tal cual`, async (t) => {
    const where = await whereDeBusqueda(t, "4708", listar);
    assert.deepEqual(telefonosBuscados(where), ["4708"]);
  });

  test(`buscar en ${nombre}: un texto con pocos dígitos no busca por ellos como si fueran un teléfono`, async (t) => {
    const where = await whereDeBusqueda(t, "Fiat 500", listar);
    assert.deepEqual(telefonosBuscados(where), ["Fiat 500"]);
  });
}

// ── Detalle de una consulta ──

const dia = (numero) => new Date(`2026-10-${numero}T12:00:00Z`);

// Las sesiones de UNA persona, de la más vieja a la más nueva (como las devuelve la base ordenadas).
// Reemplaza las lecturas del detalle y anota los pedidos de mensajes.
function conDetalle(t, { sesiones = [], mensajes = [] } = {}) {
  const pedidos = [];
  const originales = {
    chat_estado: { findUnique: prisma.chat_estado.findUnique, findMany: prisma.chat_estado.findMany },
    historial_mensajes: { findMany: prisma.historial_mensajes.findMany },
  };
  prisma.chat_estado.findUnique = async ({ where }) => sesiones.find((s) => s.id === where.id) ?? null;
  prisma.chat_estado.findMany = async () => sesiones.map(({ id, sesion_inicio }) => ({ id, sesion_inicio }));
  prisma.historial_mensajes.findMany = async (args) => (pedidos.push(args), mensajes);
  t.after(() => Object.entries(originales).forEach(([modelo, metodos]) => Object.assign(prisma[modelo], metodos)));
  return pedidos;
}

const sesionesDeUnaPersona = [10, 14, 18].map((numero, i) => sesion(i + 1, { sesion_inicio: dia(numero), nombre_declarado: "Ana", vehiculo_cliente: [] }));

test("el detalle de un id que no es un entero positivo da null y no toca la base", async (t) => {
  const original = prisma.chat_estado.findUnique;
  prisma.chat_estado.findUnique = async () => assert.fail("no tiene que consultar la base");
  t.after(() => Object.assign(prisma.chat_estado, { findUnique: original }));

  for (const id of ["abc", "0", "-3", "1.5", undefined, null]) assert.equal(await obtenerConsulta(id), null, String(id));
});

test("el detalle de una consulta que no existe da null", async (t) => {
  conDetalle(t, { sesiones: sesionesDeUnaPersona });
  assert.equal(await obtenerConsulta("99"), null);
});

test("los mensajes del detalle se acotan a la ventana de la sesión: desde su inicio hasta el inicio de la siguiente", async (t) => {
  const pedidos = conDetalle(t, { sesiones: sesionesDeUnaPersona });

  for (const id of [1, 2, 3]) await obtenerConsulta(String(id));

  const ventanas = pedidos.map((p) => p.where.created_at);
  assert.deepEqual(ventanas[0], { lt: dia(14) }, "la primera toma también lo anterior a ella");
  assert.deepEqual(ventanas[1], { gte: dia(14), lt: dia(18) });
  assert.deepEqual(ventanas[2], { gte: dia(18) }, "la última no tiene tope");
  assert.ok(pedidos.every((p) => p.where.direccion === "entrante" && p.where.cliente_id === 5), "solo lo que escribió el cliente, de ese cliente");
});

test("el detalle trae las respuestas de la sesión y los mensajes del cliente con su pregunta", async (t) => {
  const mensajes = [{ id: 7n, mensaje: "Contado", paso_nodo: "q_pago", created_at: dia(14) }];
  conDetalle(t, { sesiones: sesionesDeUnaPersona, mensajes });

  const detalle = await obtenerConsulta("2");

  assert.equal(detalle.sesionId, 2);
  assert.deepEqual(detalle.respuestas, [{ pregunta: "¿A nombre de quién registramos la consulta?", respuesta: "Ana" }]);
  assert.deepEqual(detalle.mensajes, [{ id: 7, mensaje: "Contado", paso: "q_pago", pregunta: "¿Cómo va a pagar?", fecha: dia(14).toISOString() }]);
});

// ── Marcar una consulta como atendida ──

// La fila de la sesión y el UPDATE que la cambia, en memoria. Anota el SQL y sus parámetros.
function conSesionAtendible(t, sesionInicial) {
  const fila = { ...sesionInicial };
  const consultas = [];
  const originales = { findUnique: prisma.chat_estado.findUnique, executeRawUnsafe: prisma.$executeRawUnsafe };
  prisma.chat_estado.findUnique = async ({ where }) => (where.id === fila.id ? { ...fila } : null);
  prisma.$executeRawUnsafe = async (sql, ...parametros) => {
    consultas.push({ sql, parametros });
    const marcada = sql.includes("NOW()");
    Object.assign(fila, { atendido_at: marcada ? dia(19) : null, atendido_por: marcada ? parametros[0] : null });
  };
  t.after(() => {
    Object.assign(prisma.chat_estado, { findUnique: originales.findUnique });
    prisma.$executeRawUnsafe = originales.executeRawUnsafe;
  });
  return consultas;
}

test("marcar una consulta como atendida guarda quién la atendió, con parámetros y no con texto pegado al SQL", async (t) => {
  const consultas = conSesionAtendible(t, sesion(5));

  const resultado = await marcarConsultaAtendida("5", true, { nombre: "Agustina" });

  assert.deepEqual(resultado, { sesionId: 5, atendido: { at: dia(19).toISOString(), por: "Agustina" } });
  assert.equal(consultas.length, 1);
  assert.deepEqual(consultas[0].parametros, ["Agustina", 5]);
  assert.doesNotMatch(consultas[0].sql, /Agustina/);
});

test("marcar sin saber quién es el usuario deja el nombre en null", async (t) => {
  conSesionAtendible(t, sesion(5));
  assert.deepEqual((await marcarConsultaAtendida(5, true, undefined)).atendido.por, null);
});

test("desmarcar una consulta limpia la marca", async (t) => {
  const consultas = conSesionAtendible(t, sesion(5, { atendido_at: dia(18), atendido_por: "Agustina" }));

  const resultado = await marcarConsultaAtendida(5, false, { nombre: "Agustina" });

  assert.deepEqual(resultado, { sesionId: 5, atendido: null });
  assert.deepEqual(consultas[0].parametros, [5]);
});

test("marcar una consulta que no existe da null y no escribe", async (t) => {
  const consultas = conSesionAtendible(t, sesion(5));

  assert.equal(await marcarConsultaAtendida("99", true, { nombre: "Agustina" }), null);
  assert.deepEqual(consultas, []);
});

// ── Lista de compra: filtros, páginas y datos asociados ──

test("la lista suma el filtro de clasificación solo si es una de las tres conocidas", async (t) => {
  const pedidos = conBase(t);

  await listarConsultas({ clasif: "CALIENTE" });
  await listarConsultas({ clasif: "HELADO" });

  assert.ok(pedidos[0].where.AND.some((filtro) => isDeepStrictEqual(filtro, { clasificacion: "CALIENTE" })));
  assert.ok(!pedidos[1].where.AND.some((filtro) => "clasificacion" in filtro));
});

test("la lista pide una consulta de más para saber si quedan páginas y devuelve solo el bloque pedido", async (t) => {
  const pedidos = conBase(t, [sesion(3), sesion(2), sesion(1)]);

  const { items, hayMas, total } = await listarConsultas({ limite: 2, offset: 4 });

  assert.deepEqual(items.map((item) => item.sesionId), [3, 2]);
  assert.deepEqual([hayMas, total], [true, 3]);
  assert.deepEqual([pedidos[0].skip, pedidos[0].take], [4, 3]);
});

test("cada consulta de la lista trae el vehículo y el asesor que le tocan", async (t) => {
  conBase(t, [sesion(1, { auto_id: 3, vendedor_id: 4 })], {
    autos: [{ id: 3, ref: "A-12", marca: "Ford", modelo: "Ka", anio: 2018 }],
    vendedores: [{ id: 4, nombre: "Agustina" }],
  });

  const { items } = await listarConsultas();

  assert.deepEqual(items[0].vehiculo, { ref: "A-12", marca: "Ford", modelo: "Ka", anio: 2018 });
  assert.equal(items[0].asesor, "Agustina");
});

test("buscar suma las consultas del vehículo y del asesor que coinciden con lo escrito", async (t) => {
  const pedidos = conBase(t, [], { autos: [{ id: 3 }], vendedores: [{ id: 4 }] });

  await listarConsultas({ q: "Ka" });

  assert.ok(hay(pedidos[0].where, { auto_id: { in: [3] } }));
  assert.ok(hay(pedidos[0].where, { vendedor_id: { in: [4] } }));
});

// ── Lista de venta y consignación ──

test("la lista de venta filtra por modalidad: las consultas sin modalidad cuentan como venta directa", async (t) => {
  const pedidos = conBase(t);

  await listarConsultasVenta({ modalidad: "consignacion" });
  await listarConsultasVenta({ modalidad: "venta" });
  await listarConsultasVenta();

  const [consignacion, venta, todas] = pedidos.map((pedido) => pedido.where.AND);
  assert.ok(consignacion.some((filtro) => isDeepStrictEqual(filtro, { modalidad_venta: "consignacion" })));
  assert.ok(venta.some((filtro) => isDeepStrictEqual(filtro, { OR: [{ modalidad_venta: "venta" }, { modalidad_venta: null }] })));
  assert.deepEqual(todas, [{ tipo_lead: "venta", paso_actual: "handoff" }], "sin modalidad no filtra");
});

test("la lista de venta devuelve cada consulta con el vehículo que ofrece", async (t) => {
  const ofrece = { contexto: "venta", marca: "Ford", modelo: "Ka", anio: 2018 };
  conBase(t, [sesion(1, { tipo_lead: "venta", modalidad_venta: "venta", vehiculo_cliente: [ofrece] })]);

  const { items, total } = await listarConsultasVenta();

  assert.equal(total, 1);
  assert.deepEqual([items[0].sesionId, items[0].venta.marca, items[0].venta.modelo], [1, "Ford", "Ka"]);
});

test("si la persona tiene una sola consulta, los mensajes del detalle no se acotan en el tiempo", async (t) => {
  const pedidos = conDetalle(t, { sesiones: [sesion(1, { sesion_inicio: dia(10) })] });

  const detalle = await obtenerConsulta("1");

  assert.ok(!("created_at" in pedidos[0].where));
  assert.deepEqual(detalle.respuestas, []);
});
