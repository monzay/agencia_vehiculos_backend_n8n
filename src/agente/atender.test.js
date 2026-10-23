import { test } from "node:test";
import assert from "node:assert/strict";
import { atenderMensaje } from "./atender.js";
import { MENSAJES_FIJOS } from "./limites.js";
import { notaDeVoz } from "./ogg-de-prueba.js";

const TEL = "5493885550101"; // el número de WhatsApp de casi todas las pruebas

// Las tablas de clientes son las de la migración 074: sin clientes.canal_id y con un único
// vínculo por canal + identificador en cliente_canales. Un campo que no existe revienta, como en Prisma.
const COLUMNAS_CLIENTE = ["id", "canal", "nombre", "telefono", "dni", "email", "deleted_at", "fusionado_en_id"];
const COLUMNAS_CANAL = ["id", "cliente_id", "canal", "identificador"];
const FICHA_VACIA = { nombre: null, telefono: null, dni: null, email: null, deleted_at: null, fusionado_en_id: null };

function soloColumnas(objeto, columnas) {
  const desconocida = Object.keys(objeto).find((campo) => !columnas.includes(campo));
  if (desconocida) throw new Error(`Unknown argument \`${desconocida}\`.`);
  return objeto;
}
const cumple = (fila, [campo, esperado]) => (esperado?.not === undefined ? (fila[campo] ?? null) === esperado : fila[campo] !== esperado.not);

// Base simulada con estado en memoria para lo que toca el orquestador.
// `cliente` es la ficha del número de las pruebas (TEL), ya vinculada a su canal de WhatsApp;
// `clientes` son fichas sueltas, sin ese vínculo.
function baseFalsa({ cliente = null, clientes = [], sesion = null, mensajesHoy = 0, consumosHoy = 0, gastoMes = 0, gastoClienteHoy = 0, usado = null, ubicacion = null, autos = [], vendedores = [], aviso = null } = {}) {
  const fichas = [...(cliente ? [{ canal: "whatsapp", ...cliente }] : []), ...clientes].map((ficha) => ({ ...FICHA_VACIA, ...ficha }));
  const canales = cliente ? [{ id: 1, cliente_id: cliente.id, canal: "whatsapp", identificador: TEL }] : [];
  const e = { clientes: fichas, canales, transacciones: 0, sesiones: sesion ? [sesion] : [], historial: [], consumos: [], updates: [], consultas: [], bajas: [], alertas: [] };
  let proximaFicha = 77;
  const fichasQue = (where = {}) => e.clientes.filter((ficha) => Object.entries(soloColumnas(where, COLUMNAS_CLIENTE)).every((par) => cumple(ficha, par)));
  const primeraFicha = async ({ where }) => fichasQue(where)[0] ?? null;
  const root = {
    estado: e,
    $transaction: async (fn) => (e.transacciones += 1, fn(root)),
    // El último recordatorio de cuota que recibió el número (null: ninguno).
    financiacion_avisos: {
      findFirst: async () => aviso,
      findMany: async () => (aviso ? [{ financiacion_id: aviso.financiacion_id }] : []),
    },
    financiaciones: {
      findMany: async ({ where }) => where.id.in.map((id) => ({ id })),
      updateMany: async (args) => (e.bajas.push(args), { count: args.where.id.in.length }),
    },
    financiacion_alertas: { createMany: async ({ data }) => (e.alertas.push(...data), { count: data.length }) },
    // Con el filtro de disponibles (vendido_at: null), un auto no disponible no aparece.
    autos: {
      findFirst: async ({ where }) => autos.find((a) => a.ref === where.ref && (where.vendido_at !== null || a.disponible)) ?? null,
    },
    vendedores: { findFirst: async ({ where }) => vendedores.find((v) => v.slug === where.slug) ?? null },
    clientes: {
      findUnique: primeraFicha,
      findFirst: primeraFicha,
      findMany: async ({ where }) => fichasQue(where),
      create: async ({ data }) => (e.clientes.push({ ...FICHA_VACIA, id: proximaFicha++, ...soloColumnas(data, COLUMNAS_CLIENTE) }), e.clientes.at(-1)),
      update: async ({ where, data }) => Object.assign(fichasQue(where)[0], soloColumnas(data, COLUMNAS_CLIENTE)),
    },
    cliente_canales: {
      findUnique: async ({ where: { canal_identificador: { canal, identificador } } }) => e.canales.find((c) => c.canal === canal && c.identificador === identificador) ?? null,
      create: async ({ data }) => {
        const { canal, identificador } = soloColumnas(data, COLUMNAS_CANAL);
        if (e.canales.some((c) => c.canal === canal && c.identificador === identificador)) {
          throw Object.assign(new Error("Unique constraint failed on uq_canal_identificador"), { code: "P2002" });
        }
        return (e.canales.push({ id: e.canales.length + 1, ...data }), e.canales.at(-1));
      },
    },
    chat_estado: {
      findFirst: async () => e.sesiones.at(-1) ?? null,
      create: async ({ data }) => (e.sesiones.push({ id: 900 + e.sesiones.length, ...data }), e.sesiones.at(-1)),
      update: async (args) => (e.updates.push(args), args),
    },
    historial_mensajes: {
      count: async (args) => (e.consultas.push({ count: args }), mensajesHoy),
      // Por wamid (¿ya llegó?) o el último mensaje de una dirección (lo último que dijo Agustina).
      findFirst: async ({ where }) =>
        where.wamid
          ? e.historial.find((h) => h.wamid === where.wamid) ?? null
          : e.historial.filter((h) => h.direccion === where.direccion && (!where.paso_nodo || h.paso_nodo === where.paso_nodo)).at(-1) ?? null,
      findMany: async (args) => {
        e.consultas.push({ findMany: args });
        const ids = args.where?.wamid?.in;
        return ids ? e.historial.filter((h) => ids.includes(h.wamid)).map((h) => ({ wamid: h.wamid })) : [];
      },
      create: async ({ data }) => (e.historial.push(data), data),
    },
    vehiculo_cliente: { findFirst: async () => usado },
    ubicacion: { findUnique: async () => ubicacion },
    ia_consumos: {
      aggregate: async ({ where }) =>
        where.cliente_id
          ? { _sum: { costo_usd: gastoClienteHoy }, _count: consumosHoy }
          : { _sum: { costo_usd: gastoMes } },
      create: async ({ data }) => (e.consumos.push(data), data),
    },
  };
  return root;
}

function claudeFalso(texto = "¡Hola! ¿En qué te ayudo?") {
  const pedidos = [];
  return {
    pedidos,
    messages: {
      create: async (p) => {
        pedidos.push(p);
        return { stop_reason: "end_turn", usage: { input_tokens: 1000, output_tokens: 50 }, content: [{ type: "text", text: texto }] };
      },
    },
  };
}

const ahora = new Date("2026-10-11T15:00:00Z");
// Groq simulado: guarda cada audio que le piden transcribir.
function groqFalso(texto = "Hola, ¿tienen camionetas?", segundos = 5) {
  const llamadas = [];
  const transcribir = async (audio) => {
    llamadas.push(audio);
    if (texto instanceof Error) throw texto;
    return { texto, segundos };
  };
  return { transcribir, llamadas };
}

const deps = (root, anthropic = claudeFalso(), groq = groqFalso()) => ({
  root,
  dbAgente: {},
  anthropic,
  transcribir: groq.transcribir,
  topeUsd: 10,
  esperaRafagaMs: 0,
});
const audio = (segundos) => ({ media_type: "audio/ogg", data: notaDeVoz(segundos).toString("base64") });
const vinculos = (root) => root.estado.canales.map(({ cliente_id, canal, identificador }) => ({ cliente_id, canal, identificador }));

test("un número nuevo crea la ficha con su fila en cliente_canales, el teléfono de 10 dígitos y la sesión", async () => {
  const root = baseFalsa();
  await atenderMensaje({ telefono: "5493885550101", nombre: "Ana", texto: "Hola", ahora }, deps(root));
  const [ficha, ...otras] = root.estado.clientes;
  assert.deepEqual(otras, [], "una sola ficha");
  assert.deepEqual([ficha.canal, ficha.nombre, ficha.telefono], ["whatsapp", "Ana", "3885550101"]);
  assert.deepEqual(vinculos(root), [{ cliente_id: ficha.id, canal: "whatsapp", identificador: "5493885550101" }]);
  assert.equal(root.estado.sesiones.length, 1);
  assert.equal(root.estado.sesiones[0].cliente_id, ficha.id);
});

test("un número inválido se rechaza sin tocar nada", async () => {
  const root = baseFalsa();
  await assert.rejects(atenderMensaje({ telefono: "abc", texto: "Hola", ahora }, deps(root)));
  assert.equal(root.estado.clientes.length, 0);
});

test("respuesta normal: llama al agente, registra el costo y guarda la conversación", async () => {
  const root = baseFalsa({ cliente: { id: 50, nombre: "Ana" } });
  const anthropic = claudeFalso("¡Hola Ana!");
  const r = await atenderMensaje({ telefono: "5493885550101", texto: "Hola", ahora }, deps(root, anthropic));
  assert.equal(r.texto, "¡Hola Ana!");
  assert.equal(r.conIA, true);
  assert.equal(anthropic.pedidos.length, 1);
  assert.equal(root.estado.consumos.length, 1, "registra el costo de la llamada");
  assert.deepEqual(root.estado.historial.map((h) => [h.direccion, h.mensaje]), [["entrante", "Hola"], ["saliente", "¡Hola Ana!"]]);
});

test("tope del mes alcanzado y cliente nuevo del día: mensaje fijo, sin IA y marcado para vendedor", async () => {
  const root = baseFalsa({ cliente: { id: 50 }, gastoMes: 10, consumosHoy: 0 });
  const anthropic = claudeFalso();
  const r = await atenderMensaje({ telefono: "5493885550101", texto: "Hola", ahora }, deps(root, anthropic));
  assert.equal(r.conIA, false);
  assert.equal(r.texto, MENSAJES_FIJOS.sinCupo);
  assert.equal(anthropic.pedidos.length, 0, "no gasta");
  assert.equal(root.estado.updates.at(-1).data.requiere_vendedor, true);
  assert.equal(root.estado.updates.at(-1).data.requiere_vendedor_motivo, "Se alcanzó el tope de gasto de IA del mes.");
});

test("tope alcanzado pero ya venía hablando hoy: sigue la IA", async () => {
  const root = baseFalsa({ cliente: { id: 50 }, gastoMes: 10.01, consumosHoy: 3 });
  const r = await atenderMensaje({ telefono: "5493885550101", texto: "¿Y en cuotas?", ahora }, deps(root));
  assert.equal(r.conIA, true);
});

test("mensaje 41 del día: mensaje fijo y marcado para vendedor", async () => {
  const root = baseFalsa({ cliente: { id: 50 }, mensajesHoy: 40 });
  const anthropic = claudeFalso();
  const r = await atenderMensaje({ telefono: "5493885550101", texto: "Otra más", ahora }, deps(root, anthropic));
  assert.equal(r.conIA, false);
  assert.equal(anthropic.pedidos.length, 0);
  assert.match(root.estado.updates.at(-1).data.requiere_vendedor_motivo, /límite de mensajes/);
});

test("audio de más de 2 minutos: pide que lo resuma, sin transcribir ni llamar a la IA", async () => {
  const root = baseFalsa({ cliente: { id: 50 } });
  const anthropic = claudeFalso();
  const groq = groqFalso();
  const r = await atenderMensaje({ telefono: "5493885550101", audio: audio(180), ahora }, deps(root, anthropic, groq));
  assert.equal(r.texto, MENSAJES_FIJOS.audioLargo);
  assert.equal(groq.llamadas.length, 0, "no paga la transcripción");
  assert.equal(anthropic.pedidos.length, 0);
});

test("nota de voz: la transcribe, suma el costo de Groq al tope y el agente responde al texto", async () => {
  const root = baseFalsa({ cliente: { id: 50 } });
  const anthropic = claudeFalso("¡Sí! Tenemos varias.");
  const groq = groqFalso("Hola, ¿tienen camionetas?", 5);
  const r = await atenderMensaje({ telefono: "5493885550101", audio: audio(5), ahora }, deps(root, anthropic, groq));
  assert.equal(r.texto, "¡Sí! Tenemos varias.");
  assert.equal(groq.llamadas[0].mediaType, "audio/ogg");
  const consumoGroq = root.estado.consumos.find((c) => c.proveedor === "groq");
  assert.ok(consumoGroq, "registra el costo del audio");
  assert.equal(consumoGroq.segundos_audio, 5);
  assert.match(JSON.stringify(anthropic.pedidos[0].messages), /tienen camionetas/);
  assert.equal(root.estado.historial[0].mensaje, "[audio] Hola, ¿tienen camionetas?");
});

test("sin cupo, el audio ni se transcribe", async () => {
  const root = baseFalsa({ cliente: { id: 50 }, gastoMes: 20 });
  const groq = groqFalso();
  const r = await atenderMensaje({ telefono: "5493885550101", audio: audio(5), ahora }, deps(root, claudeFalso(), groq));
  assert.equal(r.texto, MENSAJES_FIJOS.sinCupo);
  assert.equal(groq.llamadas.length, 0);
});

test("audio que no es nota de voz y pesa demasiado: mensaje fijo sin transcribir", async () => {
  const root = baseFalsa({ cliente: { id: 50 } });
  const groq = groqFalso();
  const pesado = { media_type: "audio/mpeg", data: Buffer.alloc(2_100_000, 1).toString("base64") };
  const r = await atenderMensaje({ telefono: "5493885550101", audio: pesado, ahora }, deps(root, claudeFalso(), groq));
  assert.equal(r.texto, MENSAJES_FIJOS.audioLargo);
  assert.equal(groq.llamadas.length, 0);
});

test("si la transcripción falla, le pide que lo escriba sin llamar a Claude", async () => {
  const root = baseFalsa({ cliente: { id: 50 } });
  const anthropic = claudeFalso();
  const r = await atenderMensaje({ telefono: "5493885550101", audio: audio(5), ahora }, deps(root, anthropic, groqFalso(new Error("caída"))));
  assert.equal(r.texto, MENSAJES_FIJOS.audioIlegible);
  assert.equal(anthropic.pedidos.length, 0);
});

test("un audio vacío (solo ruido) se cobra pero pide que lo escriba", async () => {
  const root = baseFalsa({ cliente: { id: 50 } });
  const anthropic = claudeFalso();
  const r = await atenderMensaje({ telefono: "5493885550101", audio: audio(5), ahora }, deps(root, anthropic, groqFalso("", 5)));
  assert.equal(r.texto, MENSAJES_FIJOS.audioIlegible);
  assert.equal(root.estado.consumos.filter((c) => c.proveedor === "groq").length, 1);
  assert.equal(anthropic.pedidos.length, 0);
});

test("audio de un formato que Groq no lee: se rechaza", async () => {
  const root = baseFalsa();
  await assert.rejects(atenderMensaje({ telefono: "5493885550101", audio: { media_type: "audio/amr", data: "aGVsbG8=" }, ahora }, deps(root)));
});

test("si el agente pide derivar, la sesión queda marcada para un vendedor", async () => {
  const root = baseFalsa({ cliente: { id: 50 } });
  const anthropic = { messages: { create: async () => { throw new Error("caída"); } } };
  const r = await atenderMensaje({ telefono: "5493885550101", texto: "Hola", ahora }, deps(root, anthropic));
  assert.equal(r.texto, MENSAJES_FIJOS.respaldo);
  assert.equal(root.estado.updates.some((u) => u.data.requiere_vendedor === true), true);
});

test("el mensaje del cliente se guarda antes de llamar a Claude (reserva el cupo del día)", async () => {
  const root = baseFalsa({ cliente: { id: 50 } });
  let guardadoAntes = false;
  const anthropic = { messages: { create: async () => ((guardadoAntes = root.estado.historial.some((h) => h.direccion === "entrante")), { stop_reason: "end_turn", usage: {}, content: [{ type: "text", text: "ok" }] }) } };
  await atenderMensaje({ telefono: "5493885550101", texto: "Hola", ahora }, deps(root, anthropic));
  assert.equal(guardadoAntes, true);
});

test("si falla guardar la respuesta después de gastar, el cliente igual la recibe", async () => {
  const root = baseFalsa({ cliente: { id: 50 } });
  const original = root.historial_mensajes.create;
  root.historial_mensajes.create = async (args) => {
    if (args.data.direccion === "saliente") throw new Error("db caída");
    return original(args);
  };
  const r = await atenderMensaje({ telefono: "5493885550101", texto: "Hola", ahora }, deps(root, claudeFalso("¡Hola!")));
  assert.equal(r.texto, "¡Hola!");
});

test("los mensajes simultáneos de un mismo número se atienden de a uno", async () => {
  const root = baseFalsa({ cliente: { id: 50 } });
  let enCurso = 0;
  let maximo = 0;
  const anthropic = {
    messages: {
      create: async () => {
        maximo = Math.max(maximo, ++enCurso);
        await new Promise((r) => setTimeout(r, 5));
        enCurso--;
        return { stop_reason: "end_turn", usage: {}, content: [{ type: "text", text: "ok" }] };
      },
    },
  };
  await Promise.all([1, 2, 3].map((n) => atenderMensaje({ telefono: "5493885550101", texto: `m${n}`, ahora }, deps(root, anthropic))));
  assert.equal(maximo, 1);
});

test("un cliente que ya gastó US$ 0,50 hoy pasa a un vendedor sin gastar más", async () => {
  const root = baseFalsa({ cliente: { id: 50 }, gastoClienteHoy: 0.5, consumosHoy: 300 });
  const anthropic = claudeFalso();
  const r = await atenderMensaje({ telefono: "5493885550101", texto: "Hola", ahora }, deps(root, anthropic));
  assert.equal(r.conIA, false);
  assert.equal(anthropic.pedidos.length, 0);
  assert.match(root.estado.updates.at(-1).data.requiere_vendedor_motivo, /gasto/);
});

test("el texto largo se recorta antes de guardarlo y de mandarlo a Claude", async () => {
  const root = baseFalsa({ cliente: { id: 50 } });
  const anthropic = claudeFalso();
  await atenderMensaje({ telefono: "5493885550101", texto: "a".repeat(3000), ahora }, deps(root, anthropic));
  assert.equal(root.estado.historial[0].mensaje.length, 1500);
  assert.equal(JSON.stringify(anthropic.pedidos[0].messages).includes("a".repeat(1501)), false);
});

test("entradas inválidas se rechazan sin tocar nada: imagen que no es foto, más de 3 fotos o texto enorme", async () => {
  const foto = { media_type: "image/jpeg", data: "aGVsbG8=" };
  const malas = [
    { imagenes: [{ media_type: "application/pdf", data: "aGVsbG8=" }] },
    { imagenes: [foto, foto, foto, foto] },
    { imagenes: [{ media_type: "image/png", data: "no es base64!" }] },
    { texto: "a".repeat(5000) },
  ];
  for (const mala of malas) {
    const root = baseFalsa();
    await assert.rejects(atenderMensaje({ telefono: "5493885550101", ahora, ...mala }, deps(root)));
    assert.equal(root.estado.clientes.length, 0);
  }
});

test("la sesión nueva nace con ultimo_mensaje (así vence a las 24 h)", async () => {
  const root = baseFalsa({ cliente: { id: 50 } });
  await atenderMensaje({ telefono: "5493885550101", texto: "Hola", ahora }, deps(root));
  assert.deepEqual(root.estado.sesiones[0].ultimo_mensaje, ahora);
});

test("una sesión de hace 25 h no se reutiliza; una de hace 23 h, sí", async () => {
  const hace = (h) => new Date(ahora.getTime() - h * 3_600_000);
  const vieja = baseFalsa({ cliente: { id: 50 }, sesion: { id: 1, ultimo_mensaje: hace(25) } });
  await atenderMensaje({ telefono: "5493885550101", texto: "Hola", ahora }, deps(vieja));
  assert.equal(vieja.estado.sesiones.length, 2);
  const reciente = baseFalsa({ cliente: { id: 50 }, sesion: { id: 1, ultimo_mensaje: hace(23) } });
  await atenderMensaje({ telefono: "5493885550101", texto: "Hola", ahora }, deps(reciente));
  assert.equal(reciente.estado.sesiones.length, 1);
});

test("con mensaje fijo, una sesión ya marcada para vendedor no se vuelve a marcar", async () => {
  const root = baseFalsa({ cliente: { id: 50 }, mensajesHoy: 40, sesion: { id: 1, ultimo_mensaje: ahora, requiere_vendedor: true } });
  await atenderMensaje({ telefono: "5493885550101", texto: "Otra", ahora }, deps(root));
  assert.equal(root.estado.updates.some((u) => u.data.requiere_vendedor), false);
  assert.equal(root.estado.updates.at(-1).data.ultimo_mensaje, ahora);
});

test("ogg con duración falsificada: se cobra lo que midió Groq y, si pasa los 2 minutos, no llega a Claude", async () => {
  const root = baseFalsa({ cliente: { id: 50 } });
  const anthropic = claudeFalso();
  const groq = groqFalso("texto larguísimo", 2660);
  const r = await atenderMensaje({ telefono: "5493885550101", audio: audio(1), ahora }, deps(root, anthropic, groq));
  assert.equal(root.estado.consumos.find((c) => c.proveedor === "groq").segundos_audio, 2660);
  assert.equal(r.texto, MENSAJES_FIJOS.audioLargo);
  assert.equal(anthropic.pedidos.length, 0);
});

test("audio largo de un cliente sin cupo: responde el mensaje de cupo (el control va primero)", async () => {
  const root = baseFalsa({ cliente: { id: 50 }, mensajesHoy: 40 });
  const r = await atenderMensaje({ telefono: "5493885550101", audio: audio(180), ahora }, deps(root));
  assert.equal(r.texto, MENSAJES_FIJOS.sinCupo);
});

test("audio vacío o casi vacío: no se manda a Groq", async () => {
  const root = baseFalsa({ cliente: { id: 50 } });
  const groq = groqFalso();
  const r = await atenderMensaje({ telefono: "5493885550101", audio: { media_type: "audio/ogg", data: "AAAA" }, ahora }, deps(root, claudeFalso(), groq));
  assert.equal(r.texto, MENSAJES_FIJOS.audioIlegible);
  assert.equal(groq.llamadas.length, 0);
});

test("el id del mensaje de WhatsApp queda guardado en el entrante", async () => {
  const root = baseFalsa({ cliente: { id: 50 } });
  await atenderMensaje({ telefono: "5493885550101", wamid: "wamid.1", texto: "Hola", ahora }, deps(root));
  assert.equal(root.estado.historial.find((h) => h.direccion === "entrante").wamid, "wamid.1");
});

test("un reintento del mismo mensaje no se procesa de nuevo (ni gasta ni responde)", async () => {
  const root = baseFalsa({ cliente: { id: 50 } });
  const anthropic = claudeFalso();
  await atenderMensaje({ telefono: "5493885550101", wamid: "wamid.1", texto: "Hola", ahora }, deps(root, anthropic));
  const r = await atenderMensaje({ telefono: "5493885550101", wamid: "wamid.1", texto: "Hola", ahora }, deps(root, anthropic));
  assert.equal(r.duplicado, true);
  assert.equal(r.texto, null);
  assert.equal(anthropic.pedidos.length, 1);
});

test("si otro proceso ya guardó el mismo mensaje (choque del índice único), se toma como duplicado sin llamar a Claude", async () => {
  const root = baseFalsa({ cliente: { id: 50 } });
  root.historial_mensajes.create = async () => {
    throw Object.assign(new Error("Unique constraint failed"), { code: "P2002", meta: { target: "uq_historial_wamid" } });
  };
  const anthropic = claudeFalso();
  const r = await atenderMensaje({ telefono: "5493885550101", wamid: "wamid.2", texto: "Hola", ahora }, deps(root, anthropic));
  assert.equal(r.duplicado, true);
  assert.equal(anthropic.pedidos.length, 0);
});

// ── Conversación propia del agente ──

test("el agente arma su contexto y cuenta el límite del día solo con su propia conversación", async () => {
  const root = baseFalsa({ cliente: { id: 50 } });
  await atenderMensaje({ telefono: "5493885550101", texto: "Hola", ahora }, deps(root));
  assert.equal(root.estado.consultas.find((c) => c.findMany).findMany.where.paso_nodo, "agente_ia");
  assert.equal(root.estado.consultas.find((c) => c.count).count.where.paso_nodo, "agente_ia");
});

test("en cada mensaje el agente recibe lo que ya respondió, lo que falta y la dirección de la agencia", async () => {
  const root = baseFalsa({
    cliente: { id: 50 },
    sesion: { id: 1, ultimo_mensaje: ahora, auto_id: 5, pago_tipo: "contado", entrega_usado: 1, decisor: null },
    usado: { marca: "Volkswagen", modelo: "Gol", anio: 2015, kms: null, detalles: null, precio_pedido: null },
    ubicacion: { nombre: "SEA Automotores", direccion: "Av. Siempreviva 742", maps_url: "https://maps.app.goo.gl/abc" },
  });
  const anthropic = claudeFalso();
  await atenderMensaje({ telefono: "5493885550101", texto: "Hola", ahora }, deps(root, anthropic));
  const contexto = anthropic.pedidos[0].system.at(-1).text;
  assert.match(contexto, /Tu nombre: Agustina, asesora de ventas\./);
  assert.match(contexto, /Nombre de la agencia \(solo si el cliente lo pregunta\): SEA Automotores\./);
  assert.match(contexto, /Av\. Siempreviva 742/);
  assert.match(contexto, /Ya respondió: paga contado; entrega un usado: "Volkswagen Gol 2015"/);
  assert.match(contexto, /Falta averiguar, en este orden: 1\) cuánto pide por el usado/);
});

// ── Clientes que llegan desde la web con el mensaje predefinido ──

const DE_LA_WEB = "Hola SEA AUTOMOTORES! Estoy interesado en el Peugeot 208 2021. ¿Podrían darme más información? (REF #A12B)";
const peugeot = { id: 5, ref: "A12B", marca: "Peugeot", modelo: "208", anio: 2021, disponible: true };

test("desde la web: la consulta arranca con origen web, el auto cargado y el asesor que trajo al cliente", async () => {
  const root = baseFalsa({ autos: [peugeot], vendedores: [{ id: 3, slug: "juan" }] });
  const anthropic = claudeFalso();
  await atenderMensaje({ telefono: "5493885550101", texto: `${DE_LA_WEB} [AS:juan]`, ahora }, deps(root, anthropic));
  const sesion = root.estado.sesiones[0];
  assert.equal(sesion.origen, "web");
  assert.equal(sesion.auto_id, 5);
  assert.equal(sesion.vendedor_id, 3);
  assert.equal(sesion.atribuido, true);
  const contexto = anthropic.pedidos[0].system.at(-1).text;
  assert.match(contexto, /viene de la web consultando por "Peugeot 208 2021" \(ref A12B\)/);
  assert.doesNotMatch(contexto, /auto de interés/, "no le pregunta qué auto le interesa");
  assert.doesNotMatch(JSON.stringify(anthropic.pedidos[0].messages), /\[AS:/, "el código del asesor no le llega a Claude");
});

test("desde la web con un asesor que no existe: la consulta queda sin asesor", async () => {
  const root = baseFalsa({ autos: [peugeot] });
  await atenderMensaje({ telefono: "5493885550101", texto: `${DE_LA_WEB} [AS:nadie]`, ahora }, deps(root));
  assert.equal(root.estado.sesiones[0].vendedor_id, null);
  assert.equal(root.estado.sesiones[0].atribuido, false);
});

test("sin link de un asesor la consulta queda sin asignar, venga de la web o escriba directo", async () => {
  for (const texto of [DE_LA_WEB, "Hola, ¿tienen camionetas?"]) {
    const root = baseFalsa({ autos: [peugeot], vendedores: [{ id: 3, slug: "juan" }] });
    await atenderMensaje({ telefono: "5493885550101", texto, ahora }, deps(root));
    const [sesion] = root.estado.sesiones;
    assert.ok(sesion.vendedor_id == null, "nadie se queda con la consulta");
    assert.ok(!sesion.atribuido);
  }
});

test("desde la web con la consulta ya abierta: el auto de la web pasa a ser el de interés", async () => {
  const root = baseFalsa({ sesion: { id: 1, ultimo_mensaje: ahora, auto_id: null }, autos: [peugeot] });
  await atenderMensaje({ telefono: "5493885550101", texto: DE_LA_WEB, ahora }, deps(root));
  assert.ok(root.estado.updates.some((u) => u.where.id === 1 && u.data.auto_id === 5));
});

test("desde la web por un auto que ya no está: no se carga y se le avisa al agente", async () => {
  const root = baseFalsa({ autos: [{ ...peugeot, disponible: false }] });
  const anthropic = claudeFalso();
  await atenderMensaje({ telefono: "5493885550101", texto: DE_LA_WEB, ahora }, deps(root, anthropic));
  assert.equal(root.estado.sesiones[0].auto_id ?? null, null);
  assert.match(anthropic.pedidos[0].system.at(-1).text, /ya no está disponible/);
});

test("un mensaje común no busca autos ni asesores y la consulta es de whatsapp", async () => {
  const root = baseFalsa({ autos: [peugeot] });
  await atenderMensaje({ telefono: "5493885550101", texto: "hola", ahora }, deps(root));
  assert.equal(root.estado.sesiones[0].origen, "whatsapp");
  assert.equal(root.estado.sesiones[0].auto_id ?? null, null);
});

// ── Ahorro de WhatsApp: Meta cobra cada mensaje que sale ──

const pausa = (ms) => new Promise((listo) => setTimeout(listo, ms));
const ultimoPedido = (anthropic) => JSON.stringify(anthropic.pedidos.at(-1).messages.at(-1));

test("la respuesta sale en UN solo mensaje de WhatsApp, ya armado para n8n", async () => {
  const root = baseFalsa();
  const r = await atenderMensaje({ telefono: TEL, wamid: "w1", texto: "Hola", ahora }, deps(root, claudeFalso("¡Hola!\n\n¿Qué auto buscás?")));
  assert.deepEqual(r.envios, [{ type: "text", text: { body: "¡Hola!\n\n¿Qué auto buscás?" } }]);
});

test("mensajes seguidos: se responde una sola vez, a todos juntos, y se guarda cada uno", async () => {
  const root = baseFalsa();
  const anthropic = claudeFalso();
  const d = { ...deps(root, anthropic), esperaRafagaMs: 30 };
  const [primero, segundo] = await Promise.all([
    atenderMensaje({ telefono: TEL, wamid: "w1", texto: "hola", ahora }, d),
    pausa(5).then(() => atenderMensaje({ telefono: TEL, wamid: "w2", texto: "cuanto sale la amarok?", ahora }, d)),
  ]);
  assert.equal(primero.juntado, true, "el primero no responde");
  assert.equal(anthropic.pedidos.length, 1, "una sola llamada a la IA");
  assert.match(ultimoPedido(anthropic), /hola\\ncuanto sale la amarok\?/, "los dos mensajes, en orden, en un solo pedido");
  assert.deepEqual(root.estado.historial.filter((h) => h.direccion === "entrante").map((h) => [h.mensaje, h.wamid]), [
    ["hola", "w1"],
    ["cuanto sale la amarok?", "w2"],
  ]);
  assert.equal(segundo.envios.length, 1);
});

test("un mensaje ya respondido que vuelve a llegar dentro de una ráfaga no se responde de nuevo", async () => {
  const root = baseFalsa();
  root.estado.historial.push({ cliente_id: 77, direccion: "entrante", mensaje: "hola", wamid: "w1", paso_nodo: "agente_ia" });
  const anthropic = claudeFalso();
  const d = { ...deps(root, anthropic), esperaRafagaMs: 30 };
  await Promise.all([
    atenderMensaje({ telefono: TEL, wamid: "w1", texto: "hola", ahora }, d),
    pausa(5).then(() => atenderMensaje({ telefono: TEL, wamid: "w2", texto: "tienen camionetas?", ahora }, d)),
  ]);
  assert.doesNotMatch(ultimoPedido(anthropic), /hola/);
  assert.match(ultimoPedido(anthropic), /tienen camionetas/);
  assert.equal(root.estado.historial.filter((h) => h.wamid === "w1").length, 1);
});

const cerrada = { id: 1, ultimo_mensaje: ahora, visita_propuesta: "sábado a la mañana" };

test("despedida con la charla cerrada: reacción 👍 (gratis) sin llamar a la IA", async () => {
  const root = baseFalsa({ sesion: cerrada });
  const anthropic = claudeFalso();
  const r = await atenderMensaje({ telefono: TEL, wamid: "wamid.CHAU", texto: "dale, gracias!", ahora }, deps(root, anthropic));
  assert.deepEqual(r.envios, [{ type: "reaction", reaction: { message_id: "wamid.CHAU", emoji: "👍" } }]);
  assert.equal(anthropic.pedidos.length, 0);
  const salida = root.estado.historial.find((h) => h.direccion === "saliente");
  assert.equal(salida.mensaje, "👍");
  assert.equal(salida.paso_nodo, "agente_reaccion", "no cuenta como mensaje cobrado ni entra a la charla de la IA");
});

test("si Agustina había preguntado algo, un 'dale' lo responde la IA (es un sí, no una despedida)", async () => {
  const root = baseFalsa({ sesion: cerrada });
  root.estado.historial.push({ cliente_id: 77, direccion: "saliente", mensaje: "¿Querés que te pase las fotos?", paso_nodo: "agente_ia" });
  const anthropic = claudeFalso();
  await atenderMensaje({ telefono: TEL, wamid: "w9", texto: "dale", ahora }, deps(root, anthropic));
  assert.equal(anthropic.pedidos.length, 1);
});

test("si Agustina contesta solo 👍, sale como reacción al mensaje del cliente", async () => {
  const root = baseFalsa();
  const r = await atenderMensaje({ telefono: TEL, wamid: "wamid.OK", texto: "el sábado a las 9 llego, gracias", ahora }, deps(root, claudeFalso("👍")));
  assert.deepEqual(r.envios, [{ type: "reaction", reaction: { message_id: "wamid.OK", emoji: "👍" } }]);
  assert.equal(root.estado.historial.find((h) => h.direccion === "saliente").paso_nodo, "agente_reaccion");
});

test("los mensajes fijos (sin IA) también salen en un solo envío", async () => {
  const root = baseFalsa({ mensajesHoy: 40, consumosHoy: 1 });
  const r = await atenderMensaje({ telefono: TEL, wamid: "w1", texto: "Hola", ahora }, deps(root));
  assert.deepEqual(r.envios, [{ type: "text", text: { body: MENSAJES_FIJOS.sinCupo } }]);
});

// ── Recordatorios de cuotas ──

const recordatorio = { id: 4, financiacion_id: 12, numero: 8, vencimiento: new Date("2026-10-18T00:00:00Z"), telefono: "543885550101", estado: "enviado", financiaciones: { cantidad_cuotas: 24, precio_cuota: 250000 } };

test("BAJA a un recordatorio: se apagan los avisos sin llamar a la IA y se le confirma", async () => {
  const root = baseFalsa({ aviso: recordatorio });
  const anthropic = claudeFalso();
  const r = await atenderMensaje({ telefono: "5493885550101", texto: "BAJA", ahora }, deps(root, anthropic));
  assert.equal(anthropic.pedidos.length, 0);
  assert.equal(r.conIA, false);
  assert.match(r.texto, /no vas a recibir más recordatorios de cuotas/);
  assert.deepEqual(root.estado.bajas[0].where.id, { in: [12] });
  assert.equal(root.estado.alertas[0].tipo, "baja");
  assert.equal(root.estado.updates.at(-1).data.requiere_vendedor, undefined, "no es una consulta para un vendedor");
});

test("'baja' de alguien que nunca recibió un recordatorio lo atiende Agustina", async () => {
  const root = baseFalsa();
  const anthropic = claudeFalso();
  await atenderMensaje({ telefono: "5493885550101", texto: "baja", ahora }, deps(root, anthropic));
  assert.equal(anthropic.pedidos.length, 1);
  assert.equal(root.estado.bajas.length, 0);
});

test("si responde a un recordatorio, Agustina sabe de qué cuota se trata", async () => {
  const root = baseFalsa({ aviso: recordatorio });
  const anthropic = claudeFalso();
  await atenderMensaje({ telefono: "5493885550101", texto: "La pago por transferencia", ahora }, deps(root, anthropic));
  const contexto = anthropic.pedidos[0].system.at(-1).text;
  assert.match(contexto, /recordatorio de pago: cuota 8 de 24, vence el 18\/10\/2026, importe \$\s?250\.000/);
});

test("sin recordatorio reciente, la charla es de venta como siempre", async () => {
  const root = baseFalsa();
  const anthropic = claudeFalso();
  await atenderMensaje({ telefono: "5493885550101", texto: "Hola", ahora }, deps(root, anthropic));
  assert.doesNotMatch(anthropic.pedidos[0].system.at(-1).text, /recordatorio de pago/);
});

// ── Una persona, una ficha: quien ya era cliente no se duplica ──

const WA_ANA = "5493887000101"; // el WhatsApp de Ana: su teléfono con el 54 9 adelante
const anaDeLaWeb = { id: 8, canal: "web", nombre: "Ana Gómez", telefono: "3887000101", dni: "30000101" };

test("quien ya era cliente por la web usa esa ficha: se le vincula el canal y no se crea otra", async () => {
  const root = baseFalsa({ clientes: [anaDeLaWeb] });
  await atenderMensaje({ telefono: WA_ANA, nombre: "ana", texto: "Hola", ahora }, deps(root));
  assert.deepEqual(root.estado.clientes.map((c) => c.id), [8], "ninguna ficha nueva");
  assert.deepEqual(vinculos(root), [{ cliente_id: 8, canal: "whatsapp", identificador: WA_ANA }]);
  assert.equal(root.estado.sesiones[0].cliente_id, 8);
  assert.deepEqual(root.estado.historial.map((h) => h.cliente_id), [8, 8], "la charla queda en la ficha de la web");
});

test("el segundo mensaje del mismo número reutiliza la ficha", async () => {
  const root = baseFalsa();
  await atenderMensaje({ telefono: TEL, nombre: "Ana", texto: "Hola", ahora }, deps(root));
  await atenderMensaje({ telefono: TEL, nombre: "Ana", texto: "¿Y en cuotas?", ahora }, deps(root));
  const [{ id }, ...otras] = root.estado.clientes;
  assert.deepEqual(otras, [], "una sola ficha");
  assert.equal(vinculos(root).length, 1);
  assert.deepEqual(root.estado.historial.map((h) => h.cliente_id), [id, id, id, id]);
});

test("el nombre del perfil de WhatsApp no pisa el nombre ya cargado", async () => {
  const root = baseFalsa({ clientes: [anaDeLaWeb] });
  const anthropic = claudeFalso();
  await atenderMensaje({ telefono: WA_ANA, nombre: "ana ✨", texto: "Hola", ahora }, deps(root, anthropic));
  assert.equal(root.estado.clientes[0].nombre, "Ana Gómez");
  assert.match(anthropic.pedidos[0].system.at(-1).text, /llamarse "Ana Gómez"/);
});

test("el nombre del perfil de WhatsApp completa una ficha que no tenía nombre", async () => {
  const root = baseFalsa({ clientes: [{ ...anaDeLaWeb, nombre: null }] });
  await atenderMensaje({ telefono: WA_ANA, nombre: "Ana", texto: "Hola", ahora }, deps(root));
  assert.equal(root.estado.clientes[0].nombre, "Ana");
});

test("la ficha nueva y su canal se crean juntos en una transacción (con la base raíz, no con un tx)", async () => {
  const root = baseFalsa();
  await atenderMensaje({ telefono: TEL, texto: "Hola", ahora }, deps(root));
  assert.equal(root.estado.transacciones, 1);
  assert.equal(vinculos(root).length, 1);
});

test("quien tenía una financiación cargada por la web: mi_financiacion la encuentra desde su WhatsApp", async () => {
  const root = baseFalsa({ clientes: [anaDeLaWeb] });
  const financiaciones = [{ cliente_id: 8, cantidad_cuotas: 12, precio_cuota: 150000, dia_pago: 10, pagos: [{ numero: 1 }] }];
  // La base del agente solo conoce las financiaciones por el id de la ficha, como la real.
  const dbAgente = {
    verificacion_intentos: { count: async () => 0, create: async ({ data }) => data },
    clientes: { findUnique: async ({ where }) => root.estado.clientes.find((c) => c.id === where.id) ?? null },
    financiaciones: { findMany: async ({ where }) => financiaciones.filter((f) => f.cliente_id === where.cliente_id) },
  };
  const respuestas = [
    { stop_reason: "tool_use", usage: {}, content: [{ type: "tool_use", id: "t1", name: "mi_financiacion", input: { dni_ultimos: "0101" } }] },
    { stop_reason: "end_turn", usage: {}, content: [{ type: "text", text: "Te quedan 11 cuotas." }] },
  ];
  const pedidos = [];
  const anthropic = { messages: { create: async (pedido) => (pedidos.push(pedido), respuestas.shift()) } };

  await atenderMensaje({ telefono: WA_ANA, texto: "¿Cuántas cuotas me quedan?", ahora }, { ...deps(root, anthropic), dbAgente });

  const [{ content: resultado }] = pedidos[1].messages.at(-1).content;
  const consulta = JSON.parse(resultado);
  assert.equal(consulta.verificado, true);
  assert.equal(consulta.financiaciones[0].cuotas_pendientes, 11);
});
