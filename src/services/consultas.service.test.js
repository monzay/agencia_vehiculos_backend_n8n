import { test } from "node:test";
import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import { prisma } from "../lib/prisma.js";
import { TODAS } from "../lib/alcance-consultas.js";
import {
  listarConsultas,
  listarConsultasVenta,
  obtenerConsulta,
  marcarConsultaAtendida,
  responderComoHumano,
  reanudarBot,
} from "./consultas.service.js";

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
  await listar({ q, alcance: TODAS });
  return pedidos[0].where;
}

// Las alternativas de todos los OR del filtro.
const clausulas = (where) => where.AND.flatMap((filtro) => filtro.OR ?? []);
const hay = (where, clausula) => clausulas(where).some((c) => isDeepStrictEqual(c, clausula));
const telefonosBuscados = (where) =>
  clausulas(where)
    .filter((c) => c.clientes?.telefono)
    .map((c) => c.clientes.telefono.contains);

// ── Lo que nació de la consulta ──

test("la lista dice si cada consulta ya avanzó a un trámite o una seña", async (t) => {
  const tramites = [{ id: 3, modalidad: "contado", estado: "recepcion" }];
  const pedidos = conBase(t, [sesion(1, { tramites, senas: [] }), sesion(2, { tramites: [], senas: [] })]);

  const { items } = await listarConsultas({ alcance: TODAS });

  assert.deepEqual(items[0].avance, { tipo: "tramite", id: 3, modalidad: "contado", estado: "recepcion" });
  assert.equal(items[1].avance, null);
  assert.deepEqual(pedidos[0].include.tramites.where, { deleted_at: null }, "un trámite cancelado no cuenta");
});

// ── Canal de cada consulta ──

test("cada consulta de la lista trae los canales de mensajería de su cliente", async (t) => {
  const pedidos = conBase(t);
  await listarConsultas({ alcance: TODAS });
  assert.equal(pedidos[0].include.clientes.include.canales.select.canal, true);
});

// El mapper toma `canales[0]`: sin orden, la base puede devolverlos en cualquiera y el
// canal que muestra la lista cambiaría entre pedidos para una persona con más de uno.
test("los canales de la lista vienen ordenados por id, así el primero es siempre el mismo", async (t) => {
  const pedidos = conBase(t);
  await listarConsultas({ alcance: TODAS });
  assert.deepEqual(pedidos[0].include.clientes.include.canales, { select: { canal: true }, orderBy: { id: "asc" } });
});

test("la lista muestra el canal de mensajería de la persona, no el de la ficha", async (t) => {
  conBase(t, [sesion(1)]);
  const { items } = await listarConsultas({ alcance: TODAS });
  assert.equal(items[0].canal, "whatsapp");
});

test("la consulta de una persona sin canales de mensajería muestra el canal de la ficha", async (t) => {
  conBase(t, [sesion(1, { clientes: { id: 5, nombre: "Ana", telefono: "3884708347", canal: "web", canales: [] } })]);
  const { items } = await listarConsultas({ alcance: TODAS });
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
    chat_estado: { findFirst: prisma.chat_estado.findFirst, findMany: prisma.chat_estado.findMany },
    historial_mensajes: { findMany: prisma.historial_mensajes.findMany },
  };
  prisma.chat_estado.findFirst = async ({ where }) => sesiones.find((s) => s.id === where.id) ?? null;
  prisma.chat_estado.findMany = async () => sesiones.map(({ id, sesion_inicio }) => ({ id, sesion_inicio }));
  prisma.historial_mensajes.findMany = async (args) => (pedidos.push(args), mensajes);
  t.after(() => Object.entries(originales).forEach(([modelo, metodos]) => Object.assign(prisma[modelo], metodos)));
  return pedidos;
}

const sesionesDeUnaPersona = [10, 14, 18].map((numero, i) => sesion(i + 1, { sesion_inicio: dia(numero), nombre_declarado: "Ana", vehiculo_cliente: [] }));

test("el detalle de un id que no es un entero positivo da null y no toca la base", async (t) => {
  const original = prisma.chat_estado.findFirst;
  prisma.chat_estado.findFirst = async () => assert.fail("no tiene que consultar la base");
  t.after(() => Object.assign(prisma.chat_estado, { findFirst: original }));

  for (const id of ["abc", "0", "-3", "1.5", undefined, null]) assert.equal(await obtenerConsulta(id, TODAS), null, String(id));
});

test("el detalle de una consulta que no existe da null", async (t) => {
  conDetalle(t, { sesiones: sesionesDeUnaPersona });
  assert.equal(await obtenerConsulta("99", TODAS), null);
});

test("los mensajes del detalle se acotan a la ventana de la sesión: desde su inicio hasta el inicio de la siguiente", async (t) => {
  const pedidos = conDetalle(t, { sesiones: sesionesDeUnaPersona });

  for (const id of [1, 2, 3]) await obtenerConsulta(String(id), TODAS);

  const ventanas = pedidos.map((p) => p.where.created_at);
  assert.deepEqual(ventanas[0], { lt: dia(14) }, "la primera toma también lo anterior a ella");
  assert.deepEqual(ventanas[1], { gte: dia(14), lt: dia(18) });
  assert.deepEqual(ventanas[2], { gte: dia(18) }, "la última no tiene tope");
  assert.ok(pedidos.every((p) => p.where.cliente_id === 5), "solo de ese cliente");
  assert.ok(pedidos.every((p) => !("direccion" in p.where)), "trae ambas direcciones para el chat completo");
});

test("el detalle trae las respuestas de la sesión y los mensajes del cliente con su pregunta", async (t) => {
  const mensajes = [{ id: 7n, direccion: "entrante", mensaje: "Contado", paso_nodo: "q_pago", created_at: dia(14) }];
  conDetalle(t, { sesiones: sesionesDeUnaPersona, mensajes });

  const detalle = await obtenerConsulta("2", TODAS);

  assert.equal(detalle.sesionId, 2);
  assert.deepEqual(detalle.respuestas, [{ pregunta: "¿A nombre de quién registramos la consulta?", respuesta: "Ana" }]);
  assert.deepEqual(detalle.mensajes, [{ id: 7, autor: "cliente", mensaje: "Contado", paso: "q_pago", pregunta: "¿Cómo va a pagar?", fecha: dia(14).toISOString() }]);
});

test("el chat trae los mensajes del cliente, del bot y de una persona, en orden y con su autor", async (t) => {
  const mensajes = [
    { id: 1n, direccion: "entrante", mensaje: "hola", paso_nodo: "agente_ia", created_at: dia(14) },
    { id: 2n, direccion: "saliente", mensaje: "¡Hola! ¿En qué te ayudo?", paso_nodo: "agente_ia", created_at: dia(14) },
    { id: 3n, direccion: "saliente", mensaje: "Te atiende Juan, un asesor.", paso_nodo: "humano", created_at: dia(14) },
  ];
  conDetalle(t, { sesiones: sesionesDeUnaPersona, mensajes });

  const detalle = await obtenerConsulta("2", TODAS);

  assert.deepEqual(detalle.chat.map((m) => [m.autor, m.mensaje]), [
    ["cliente", "hola"],
    ["bot", "¡Hola! ¿En qué te ayudo?"],
    ["humano", "Te atiende Juan, un asesor."],
  ]);
  // El campo `mensajes` sigue siendo solo lo que escribió el cliente.
  assert.deepEqual(detalle.mensajes.map((m) => m.mensaje), ["hola"]);
});

// ── Marcar una consulta como atendida ──

// La fila de la sesión y el UPDATE que la cambia, en memoria. Anota el SQL y sus parámetros.
function conSesionAtendible(t, sesionInicial) {
  const fila = { ...sesionInicial };
  const consultas = [];
  const originales = { findUnique: prisma.chat_estado.findUnique, findFirst: prisma.chat_estado.findFirst, executeRawUnsafe: prisma.$executeRawUnsafe };
  prisma.chat_estado.findFirst = async ({ where }) => (where.id === fila.id ? { ...fila } : null);
  prisma.chat_estado.findUnique = async ({ where }) => (where.id === fila.id ? { ...fila } : null);
  prisma.$executeRawUnsafe = async (sql, ...parametros) => {
    consultas.push({ sql, parametros });
    const marcada = sql.includes("NOW()");
    Object.assign(fila, { atendido_at: marcada ? dia(19) : null, atendido_por: marcada ? parametros[0] : null });
  };
  t.after(() => {
    Object.assign(prisma.chat_estado, { findUnique: originales.findUnique, findFirst: originales.findFirst });
    prisma.$executeRawUnsafe = originales.executeRawUnsafe;
  });
  return consultas;
}

test("marcar una consulta como atendida guarda quién la atendió, con parámetros y no con texto pegado al SQL", async (t) => {
  const consultas = conSesionAtendible(t, sesion(5));

  const resultado = await marcarConsultaAtendida("5", true, { nombre: "Agustina" }, TODAS);

  assert.deepEqual(resultado, { sesionId: 5, atendido: { at: dia(19).toISOString(), por: "Agustina" } });
  assert.equal(consultas.length, 1);
  assert.deepEqual(consultas[0].parametros, ["Agustina", 5]);
  assert.doesNotMatch(consultas[0].sql, /Agustina/);
});

test("marcar sin saber quién es el usuario deja el nombre en null", async (t) => {
  conSesionAtendible(t, sesion(5));
  assert.deepEqual((await marcarConsultaAtendida(5, true, undefined, TODAS)).atendido.por, null);
});

test("desmarcar una consulta limpia la marca", async (t) => {
  const consultas = conSesionAtendible(t, sesion(5, { atendido_at: dia(18), atendido_por: "Agustina" }));

  const resultado = await marcarConsultaAtendida(5, false, { nombre: "Agustina" }, TODAS);

  assert.deepEqual(resultado, { sesionId: 5, atendido: null });
  assert.deepEqual(consultas[0].parametros, [5]);
});

test("marcar una consulta que no existe da null y no escribe", async (t) => {
  const consultas = conSesionAtendible(t, sesion(5));

  assert.equal(await marcarConsultaAtendida("99", true, { nombre: "Agustina" }, TODAS), null);
  assert.deepEqual(consultas, []);
});

// ── Lista de compra: filtros, páginas y datos asociados ──

test("la lista suma el filtro de clasificación solo si es una de las tres conocidas", async (t) => {
  const pedidos = conBase(t);

  await listarConsultas({ alcance: TODAS, clasif: "CALIENTE" });
  await listarConsultas({ alcance: TODAS, clasif: "HELADO" });

  assert.ok(pedidos[0].where.AND.some((filtro) => isDeepStrictEqual(filtro, { clasificacion: "CALIENTE" })));
  assert.ok(!pedidos[1].where.AND.some((filtro) => "clasificacion" in filtro));
});

test("la lista pide una consulta de más para saber si quedan páginas y devuelve solo el bloque pedido", async (t) => {
  const pedidos = conBase(t, [sesion(3), sesion(2), sesion(1)]);

  const { items, hayMas, total } = await listarConsultas({ alcance: TODAS, limite: 2, offset: 4 });

  assert.deepEqual(items.map((item) => item.sesionId), [3, 2]);
  assert.deepEqual([hayMas, total], [true, 3]);
  assert.deepEqual([pedidos[0].skip, pedidos[0].take], [4, 3]);
});

test("cada consulta de la lista trae el vehículo y el asesor que le tocan", async (t) => {
  conBase(t, [sesion(1, { auto_id: 3, vendedor_id: 4 })], {
    autos: [{ id: 3, ref: "A-12", marca: "Ford", modelo: "Ka", anio: 2018 }],
    vendedores: [{ id: 4, nombre: "Agustina" }],
  });

  const { items } = await listarConsultas({ alcance: TODAS });

  assert.deepEqual(items[0].vehiculo, { ref: "A-12", marca: "Ford", modelo: "Ka", anio: 2018 });
  assert.equal(items[0].asesor, "Agustina");
});

test("buscar suma las consultas del vehículo y del asesor que coinciden con lo escrito", async (t) => {
  const pedidos = conBase(t, [], { autos: [{ id: 3 }], vendedores: [{ id: 4 }] });

  await listarConsultas({ alcance: TODAS, q: "Ka" });

  assert.ok(hay(pedidos[0].where, { auto_id: { in: [3] } }));
  assert.ok(hay(pedidos[0].where, { vendedor_id: { in: [4] } }));
});

// ── Lista de venta y consignación ──

test("la lista de venta filtra por modalidad: las consultas sin modalidad cuentan como venta directa", async (t) => {
  const pedidos = conBase(t);

  await listarConsultasVenta({ alcance: TODAS, modalidad: "consignacion" });
  await listarConsultasVenta({ alcance: TODAS, modalidad: "venta" });
  await listarConsultasVenta({ alcance: TODAS });

  const [consignacion, venta, todas] = pedidos.map((pedido) => pedido.where.AND);
  assert.ok(consignacion.some((filtro) => isDeepStrictEqual(filtro, { modalidad_venta: "consignacion" })));
  assert.ok(venta.some((filtro) => isDeepStrictEqual(filtro, { OR: [{ modalidad_venta: "venta" }, { modalidad_venta: null }] })));
  assert.deepEqual(todas, [TODAS, { tipo_lead: "venta", paso_actual: "handoff" }], "sin modalidad no filtra");
});

test("la lista de venta devuelve cada consulta con el vehículo que ofrece", async (t) => {
  const ofrece = { contexto: "venta", marca: "Ford", modelo: "Ka", anio: 2018 };
  conBase(t, [sesion(1, { tipo_lead: "venta", modalidad_venta: "venta", vehiculo_cliente: [ofrece] })]);

  const { items, total } = await listarConsultasVenta({ alcance: TODAS });

  assert.equal(total, 1);
  assert.deepEqual([items[0].sesionId, items[0].venta.marca, items[0].venta.modelo], [1, "Ford", "Ka"]);
});

test("si la persona tiene una sola consulta, los mensajes del detalle no se acotan en el tiempo", async (t) => {
  const pedidos = conDetalle(t, { sesiones: [sesion(1, { sesion_inicio: dia(10) })] });

  const detalle = await obtenerConsulta("1", TODAS);

  assert.ok(!("created_at" in pedidos[0].where));
  assert.deepEqual(detalle.respuestas, []);
});

// ── Intervención humana: responder desde el panel y devolver al bot ──

const ahora = dia(20);

// Base falsa para responderComoHumano: la sesión con su cliente, el último mensaje
// entrante (para la ventana de 24 h) y el registro de lo que se escribe.
function conIntervencion(t, { sesion: fila, ultimoEntrante = ahora } = {}) {
  const e = { creados: [], updates: [] };
  const originales = {
    chat_estado: { findFirst: prisma.chat_estado.findFirst, update: prisma.chat_estado.update },
    historial_mensajes: { findFirst: prisma.historial_mensajes.findFirst, create: prisma.historial_mensajes.create },
    $transaction: prisma.$transaction,
  };
  prisma.chat_estado.findFirst = async ({ where }) => (fila && where.id === fila.id ? fila : null);
  prisma.chat_estado.update = async (args) => (e.updates.push(args), args);
  prisma.historial_mensajes.findFirst = async () => (ultimoEntrante ? { created_at: ultimoEntrante } : null);
  prisma.historial_mensajes.create = async ({ data }) => (e.creados.push(data), { id: 99n, ...data });
  prisma.$transaction = async (ops) => Promise.all(ops);
  t.after(() => {
    Object.assign(prisma.chat_estado, originales.chat_estado);
    Object.assign(prisma.historial_mensajes, originales.historial_mensajes);
    prisma.$transaction = originales.$transaction;
  });
  return e;
}

// Enviador falso: anota los envíos y devuelve un wamid, o lanza si se le pide.
function enviadorFalso({ falla = false } = {}) {
  const envios = [];
  const enviar = {
    enviarTexto: async (datos) => {
      envios.push(datos);
      if (falla) throw Object.assign(new Error("WhatsApp respondió 400"), { status: 400 });
      return { wamid: "wamid.OUT1" };
    },
  };
  return { enviar, envios };
}

const sesionTomable = { id: 5, cliente_id: 5, bot_pausado: false, clientes: { id: 5, telefono: "3884708347" } };

test("responder como persona: envía por WhatsApp, pausa el bot, marca atendida y guarda el saliente humano", async (t) => {
  const e = conIntervencion(t, { sesion: { ...sesionTomable } });
  const { enviar, envios } = enviadorFalso();

  const r = await responderComoHumano("5", "Hola, te atiende Juan", { nombre: "Juan" }, { enviar, ahora, alcance: TODAS });

  assert.equal(r.ok, true);
  assert.deepEqual(envios, [{ telefono: "543884708347", texto: "Hola, te atiende Juan" }]);
  assert.deepEqual(e.creados[0], { cliente_id: 5, direccion: "saliente", mensaje: "Hola, te atiende Juan", paso_nodo: "humano", created_at: ahora, wamid: "wamid.OUT1" });
  assert.equal(e.updates[0].data.bot_pausado, true);
  assert.deepEqual([e.updates[0].data.atendido_por, e.updates[0].data.atendido_at], ["Juan", ahora]);
  assert.equal(r.mensaje.autor, "humano");
});

test("el teléfono se manda a Meta en formato de WhatsApp, sea cual sea cómo está guardado", async (t) => {
  conIntervencion(t, { sesion: { ...sesionTomable, clientes: { id: 5, telefono: "5493884708347" } } });
  const { enviar, envios } = enviadorFalso();

  await responderComoHumano("5", "hola", { nombre: "Juan" }, { enviar, ahora, alcance: TODAS });

  assert.equal(envios[0].telefono, "543884708347");
});

test("teléfono que no se puede convertir a WhatsApp: no envía a ciegas y avisa", async (t) => {
  const e = conIntervencion(t, { sesion: { ...sesionTomable, clientes: { id: 5, telefono: "12345" } } });
  const { enviar, envios } = enviadorFalso();

  const r = await responderComoHumano("5", "hola", { nombre: "Juan" }, { enviar, ahora, alcance: TODAS });

  assert.equal(r.codigo, "sin_telefono");
  assert.deepEqual([envios, e.creados, e.updates], [[], [], []], "no llama a Meta ni toca nada");
});

test("si Meta rechaza el envío, no se guarda ningún saliente ni se pausa el bot", async (t) => {
  const e = conIntervencion(t, { sesion: { ...sesionTomable } });
  const { enviar } = enviadorFalso({ falla: true });

  const r = await responderComoHumano("5", "hola", { nombre: "Juan" }, { enviar, ahora, alcance: TODAS });

  assert.equal(r.ok, false);
  assert.equal(r.codigo, "envio_fallido");
  assert.deepEqual([e.creados, e.updates], [[], []], "no toca el historial ni la sesión");
});

test("texto vacío o demasiado largo: no envía y avisa", async (t) => {
  const e = conIntervencion(t, { sesion: { ...sesionTomable } });
  const { enviar, envios } = enviadorFalso();

  for (const texto of ["   ", "a".repeat(4097)]) {
    const r = await responderComoHumano("5", texto, { nombre: "Juan" }, { enviar, ahora, alcance: TODAS });
    assert.equal(r.codigo, "texto_invalido");
  }
  assert.deepEqual([envios, e.creados], [[], []]);
});

test("fuera de la ventana de 24 h: no envía y avisa que venció", async (t) => {
  conIntervencion(t, { sesion: { ...sesionTomable }, ultimoEntrante: dia(18) }); // hace 48 h
  const { enviar, envios } = enviadorFalso();

  const r = await responderComoHumano("5", "hola", { nombre: "Juan" }, { enviar, ahora, alcance: TODAS });

  assert.equal(r.codigo, "ventana_cerrada");
  assert.deepEqual(envios, [], "no llega a enviar");
});

test("responder en una consulta que no existe da no_encontrada", async (t) => {
  conIntervencion(t, { sesion: null });
  const { enviar } = enviadorFalso();
  const r = await responderComoHumano("99", "hola", { nombre: "Juan" }, { enviar, ahora, alcance: TODAS });
  assert.equal(r.codigo, "no_encontrada");
});

test("devolver la conversación al bot pone bot_pausado en false", async (t) => {
  const e = conIntervencion(t, { sesion: { ...sesionTomable, bot_pausado: true } });
  const r = await reanudarBot("5", TODAS);
  assert.deepEqual(r, { sesionId: 5, botPausado: false });
  assert.equal(e.updates[0].data.bot_pausado, false);
});

test("devolver al bot en una consulta que no existe da null", async (t) => {
  conIntervencion(t, { sesion: null });
  assert.equal(await reanudarBot("99", TODAS), null);
});

test("el detalle informa si la ventana está abierta y si la tomó una persona", async (t) => {
  const reciente = new Date(Date.now() - 60_000); // el cliente escribió hace un minuto
  const mensajes = [{ id: 1n, direccion: "entrante", mensaje: "hola", paso_nodo: "agente_ia", created_at: reciente }];
  conDetalle(t, { sesiones: [sesion(1, { bot_pausado: true })], mensajes });

  const detalle = await obtenerConsulta("1", TODAS);

  assert.equal(detalle.ventanaAbierta, true);
  assert.equal(detalle.botPausado, true);
});

test("el detalle muestra el CUIL de la ficha entre los datos de la consulta", async (t) => {
  conDetalle(t, { sesiones: [sesion(1, { sesion_inicio: dia(10), vehiculo_cliente: [], clientes: { cuil: "20123456786" } })] });
  const buscar = prisma.chat_estado.findFirst;
  let pedido;
  prisma.chat_estado.findFirst = async (args) => ((pedido = args), buscar(args));

  const detalle = await obtenerConsulta("1", TODAS);

  assert.deepEqual(pedido.include.clientes, { select: { cuil: true } }, "de la ficha pide solo el CUIL");
  assert.deepEqual(detalle.respuestas.filter((r) => r.pregunta.includes("CUIL")), [{ pregunta: "CUIL en la ficha", respuesta: "20-12345678-6" }]);
});

// ── Orden de la lista de Consultas ──

const ORDEN_DE_LA_LISTA = [{ orden_at: "desc" }, { id: "desc" }];

// Ordena por los campos escalares de estos tests (fechas como Date y números), según el
// `orderBy` recibido. Las fechas se comparan como número. `orden_at` es NOT NULL en la base
// (migración 084, DEFAULT CURRENT_TIMESTAMP): una fila de prueba sin él es un error del test.
function ordenarComoLaBase(filas, orderBy) {
  const criterios = (Array.isArray(orderBy) ? orderBy : [orderBy]).filter(Boolean).flatMap((o) => Object.entries(o));
  const valor = (fila, campo) => {
    const v = fila[campo];
    if (campo === "orden_at" && (v === null || v === undefined)) {
      throw new Error(`la fila ${fila.id} no trae orden_at: la columna es NOT NULL en la base (migración 084)`);
    }
    return v instanceof Date ? v.getTime() : v;
  };
  return [...filas].sort((a, b) => {
    for (const [campo, sentido] of criterios) {
      const x = valor(a, campo);
      const y = valor(b, campo);
      if (x === y) continue;
      return (x < y ? -1 : 1) * (sentido === "desc" ? -1 : 1);
    }
    return 0;
  });
}

function conBaseQueOrdena(t, sesiones) {
  const original = prisma.chat_estado.findMany;
  const originalCount = prisma.chat_estado.count;
  prisma.chat_estado.findMany = async ({ orderBy }) => ordenarComoLaBase(sesiones, orderBy);
  prisma.chat_estado.count = async () => sesiones.length;
  const autosOriginal = prisma.autos.findMany;
  const vendedoresOriginal = prisma.vendedores.findMany;
  prisma.autos.findMany = async () => [];
  prisma.vendedores.findMany = async () => [];
  t.after(() => {
    prisma.chat_estado.findMany = original;
    prisma.chat_estado.count = originalCount;
    prisma.autos.findMany = autosOriginal;
    prisma.vendedores.findMany = vendedoresOriginal;
  });
}

const hoy = new Date("2026-11-14T12:00:00Z");
const hace = (dias) => new Date(hoy.getTime() - dias * 86_400_000);

test("la lista de Consultas se ordena por orden_at desc y, si empatan, por id desc", async (t) => {
  const pedidos = conBase(t);
  await listarConsultas({ alcance: TODAS });
  assert.deepEqual(pedidos[0].orderBy, ORDEN_DE_LA_LISTA);
});

test("la lista de ventas y consignaciones se ordena por orden_at desc y, si empatan, por id desc", async (t) => {
  const pedidos = conBase(t);
  await listarConsultasVenta({ alcance: TODAS });
  assert.deepEqual(pedidos[0].orderBy, ORDEN_DE_LA_LISTA);
});

test("las consultas hermanas del detalle siguen ordenadas por sesion_inicio asc (calculan la ventana de mensajes)", async (t) => {
  const pedidos = [];
  const sesiones = sesionesDeUnaPersona;
  conDetalle(t, { sesiones });
  const original = prisma.chat_estado.findMany;
  prisma.chat_estado.findMany = async (args) => (pedidos.push(args), sesiones.map(({ id, sesion_inicio }) => ({ id, sesion_inicio })));
  t.after(() => { prisma.chat_estado.findMany = original; });

  await obtenerConsulta("2", TODAS);

  assert.deepEqual(pedidos[0].orderBy, { sesion_inicio: "asc" });
});

test("Sube por otro auto: una consulta de hace 20 días que cambió de auto hoy sale primera, antes de las abiertas en los últimos días", async (t) => {
  conBaseQueOrdena(t, [
    sesion(1, { sesion_inicio: hace(2), orden_at: hace(2) }),
    sesion(2, { sesion_inicio: hace(20), orden_at: hoy, auto_id: 7 }), // cambió de auto hoy
    sesion(3, { sesion_inicio: hace(1), orden_at: hace(1) }),
    sesion(4, { sesion_inicio: hace(5), orden_at: hace(5) }),
  ]);

  const { items } = await listarConsultas({ alcance: TODAS });

  assert.deepEqual(items.map((i) => i.sesionId), [2, 3, 1, 4]);
});

test("Sube porque el cliente volvió a escribir: una consulta atendida de hace 20 días con un mensaje hoy sale primera", async (t) => {
  conBaseQueOrdena(t, [
    sesion(1, { sesion_inicio: hace(2), orden_at: hace(2) }),
    sesion(2, { sesion_inicio: hace(20), orden_at: hoy, atendido_at: hace(15), atendido_por: 2 }), // volvió a pendiente
    sesion(3, { sesion_inicio: hace(1), orden_at: hace(1) }),
  ]);

  const { items } = await listarConsultas({ alcance: TODAS });

  assert.deepEqual(items.map((i) => i.sesionId), [2, 3, 1]);
});

test("con el mismo orden_at, sale primero la consulta de id mayor (desempate id desc)", async (t) => {
  conBaseQueOrdena(t, [
    sesion(5, { orden_at: hace(3) }),
    sesion(9, { orden_at: hace(3) }),
    sesion(7, { orden_at: hace(1) }),
    sesion(2, { orden_at: hace(3) }),
  ]);

  const { items } = await listarConsultas({ alcance: TODAS });

  assert.deepEqual(items.map((i) => i.sesionId), [7, 9, 5, 2]);
});

test("la lista de ventas y consignaciones sale por orden_at desc y, con el mismo orden_at, por id desc", async (t) => {
  conBaseQueOrdena(t, [
    sesion(1, { tipo_lead: "venta", orden_at: hace(10) }),
    sesion(4, { tipo_lead: "venta", orden_at: hace(4) }),
    sesion(3, { tipo_lead: "venta", orden_at: hoy, sesion_inicio: hace(30) }),
    sesion(6, { tipo_lead: "venta", orden_at: hace(4) }),
  ]);

  const { items } = await listarConsultasVenta({ alcance: TODAS });

  assert.deepEqual(items.map((i) => i.sesionId), [3, 6, 4, 1]);
});
