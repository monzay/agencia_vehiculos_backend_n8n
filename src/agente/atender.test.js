import { test } from "node:test";
import assert from "node:assert/strict";
import { atenderMensaje } from "./atender.js";
import { MENSAJES_FIJOS } from "./limites.js";
import { notaDeVoz } from "./ogg-de-prueba.js";
import { repartoFalso } from "./reparto-de-prueba.js";

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

// Consultas como las devuelve Prisma: filtradas por auto y por fecha, y en el orden pedido (desc).
const consultasQue = (sesiones, where = {}) =>
  sesiones.filter((s) => (s.cliente_id === undefined || where.cliente_id === undefined || s.cliente_id === where.cliente_id) && (where.auto_id === undefined || s.auto_id === where.auto_id) && (!where.ultimo_mensaje || s.ultimo_mensaje >= where.ultimo_mensaje.gte));
function enOrden(filas, orderBy = []) {
  const campos = [orderBy].flat().map((o) => Object.keys(o)[0]);
  return [...filas].sort((a, b) => {
    for (const campo of campos) {
      const diferencia = (b[campo] ?? 0) - (a[campo] ?? 0);
      if (diferencia) return diferencia;
    }
    return 0;
  });
}

// Base simulada con estado en memoria para lo que toca el orquestador.
// `cliente` es la ficha del número de las pruebas (TEL), ya vinculada a su canal de WhatsApp;
// `clientes` son fichas sueltas, sin ese vínculo.
function baseFalsa({ cliente = null, clientes = [], sesion = null, sesiones = [], mensajesHoy = 0, historial = [], consumosHoy = 0, gastoMes = 0, gastoClienteHoy = 0, usado = null, ubicacion = null, autos = [], vendedores = [], usuarios = [], configuracion = {}, aviso = null } = {}) {
  const reparto = repartoFalso({ vendedores, usuarios, configuracion });
  const fichas = [...(cliente ? [{ canal: "whatsapp", ...cliente }] : []), ...clientes].map((ficha) => ({ ...FICHA_VACIA, ...ficha }));
  const canales = cliente ? [{ id: 1, cliente_id: cliente.id, canal: "whatsapp", identificador: TEL }] : [];
  const e = { clientes: fichas, canales, transacciones: 0, sesiones: [...(sesion ? [sesion] : []), ...sesiones], historial: [...historial], consumos: [], updates: [], consultas: [], bajas: [], alertas: [] };
  let proximaFicha = 77;
  const fichasQue = (where = {}) => e.clientes.filter((ficha) => Object.entries(soloColumnas(where, COLUMNAS_CLIENTE)).every((par) => cumple(ficha, par)));
  const primeraFicha = async ({ where }) => fichasQue(where)[0] ?? null;
  const root = {
    estado: e,
    reparto: reparto.estado,
    $transaction: async (fn, opciones) => (e.transacciones += 1, reparto.transaccion(root, fn, opciones)),
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
      findFirst: async ({ where }) =>
        where.id !== undefined
          ? autos.find((a) => a.id === where.id) ?? null
          : autos.find((a) => a.ref === where.ref && (where.vendido_at !== null || a.disponible)) ?? null,
    },
    ...reparto.tablas,
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
      findFirst: async ({ where, orderBy } = {}) => enOrden(consultasQue(e.sesiones, where), orderBy)[0] ?? null,
      findUnique: async ({ where }) => e.sesiones.find((s) => s.id === where.id) ?? null,
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
        if (ids) return e.historial.filter((h) => ids.includes(h.wamid)).map((h) => ({ wamid: h.wamid }));
        // El historial como lo devuelve Prisma: filtra por cliente, paso y fecha, ordena por id desc y DESPUÉS corta (take).
        const { cliente_id, paso_nodo, created_at } = args.where ?? {};
        const filas = e.historial
          .filter((h) => (cliente_id === undefined || h.cliente_id === cliente_id) && (!paso_nodo?.in || paso_nodo.in.includes(h.paso_nodo)) && (!created_at?.gte || (h.created_at != null && h.created_at >= created_at.gte)))
          .sort((a, b) => b.id - a.id);
        return (args.take ? filas.slice(0, args.take) : filas).map(({ direccion, mensaje, paso_nodo, created_at, fotos_ref }) => ({ direccion, mensaje, paso_nodo, created_at, fotos_ref }));
      },
      // Como la base: el id es autoincremental (el máximo actual + 1).
      create: async ({ data }) => (e.historial.push({ ...data, id: Math.max(0, ...e.historial.map((h) => h.id ?? 0)) + 1 }), data),
    },
    vehiculo_cliente: { findFirst: async () => usado, create: async ({ data }) => data },
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

test("la sesión nueva nace con ultimo_mensaje (así vence a los 30 días)", async () => {
  const root = baseFalsa({ cliente: { id: 50 } });
  await atenderMensaje({ telefono: "5493885550101", texto: "Hola", ahora }, deps(root));
  assert.deepEqual(root.estado.sesiones[0].ultimo_mensaje, ahora);
});

test("la consulta nueva nace con orden_at igual al ahora del turno (sube al abrirse)", async () => {
  const root = baseFalsa({ cliente: { id: 50 } });
  await atenderMensaje({ telefono: "5493885550101", texto: "Hola", ahora }, deps(root));
  assert.deepEqual(root.estado.sesiones[0].orden_at, ahora);
});

test("la consulta nueva nace con 0 puntos y fría", async () => {
  const root = baseFalsa({ cliente: { id: 50 } });
  await atenderMensaje({ telefono: "5493885550101", texto: "Hola", ahora }, deps(root));
  assert.equal(root.estado.sesiones[0].score, 0);
  assert.equal(root.estado.sesiones[0].clasificacion, "FRIO");
});

const haceDias = (d) => new Date(ahora.getTime() - d * 86_400_000);

test("una consulta con el último mensaje de hace 31 días no se reutiliza; una de hace 29 días, sí", async () => {
  const vieja = baseFalsa({ cliente: { id: 50 }, sesion: { id: 1, ultimo_mensaje: haceDias(31) } });
  await atenderMensaje({ telefono: "5493885550101", texto: "Hola", ahora }, deps(vieja));
  assert.equal(vieja.estado.sesiones.length, 2);
  const reciente = baseFalsa({ cliente: { id: 50 }, sesion: { id: 1, ultimo_mensaje: haceDias(29) } });
  await atenderMensaje({ telefono: "5493885550101", texto: "Hola", ahora }, deps(reciente));
  assert.equal(reciente.estado.sesiones.length, 1);
  assert.equal(reciente.estado.sesiones[0].id, 1, "es la misma consulta, sin create");
  assert.equal(reciente.estado.updates.at(-1).where.id, 1, "el turno se cierra en esa consulta");
});

test("con el último mensaje de hace exactamente 30 días se abre una consulta nueva", async () => {
  const root = baseFalsa({ cliente: { id: 50 }, sesion: { id: 1, ultimo_mensaje: haceDias(30) } });
  await atenderMensaje({ telefono: TEL, texto: "Hola", ahora }, deps(root));
  assert.equal(root.estado.sesiones.length, 2, "30 días justos ya vence");
  assert.deepEqual(root.estado.sesiones[1].ultimo_mensaje, ahora);
});

test("quien vuelve a los 10 días sigue en la misma consulta, con su asesor, y la IA recibe lo ya respondido", async () => {
  const consulta = { id: 1, cliente_id: 50, ultimo_mensaje: haceDias(10), auto_id: 5, pago_tipo: "contado", entrega_usado: 0, decisor: null, vendedor_id: 2, atribuido: true };
  const root = baseFalsa({ cliente: { id: 50 }, sesion: consulta, autos: [{ id: 5, ref: "A12B", marca: "Peugeot", modelo: "208", anio: 2021, disponible: true }], vendedores: [{ id: 2, slug: "juan", activo: true, deleted_at: null, recibe_consultas: true }] });
  const anthropic = claudeFalso();
  await atenderMensaje({ telefono: TEL, texto: "Hola, sigo interesado", ahora }, deps(root, anthropic));
  assert.equal(root.estado.sesiones.length, 1, "no se crea otra consulta");
  assert.equal(root.estado.updates.at(-1).where.id, 1, "el turno se cierra en la misma");
  assert.equal(root.estado.updates.some((u) => "vendedor_id" in u.data), false, "conserva su asesor");
  assert.equal(root.estado.sesiones[0].vendedor_id, 2);
  const contexto = anthropic.pedidos[0].system.at(-1).text;
  assert.match(contexto, /Tenés anotado \(corregilo con registrar_calificacion si el cliente lo desmiente\): paga contado; no entrega usado/);
  const faltan = contexto.match(/Falta averiguar[^\n]*/)?.[0] ?? "";
  assert.doesNotMatch(faltan, /forma de pago/, "la forma de pago no figura como faltante");
  assert.doesNotMatch(faltan, /si entrega un usado/, "si entrega usado no figura como faltante");
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

// ── Intervención humana: el bot pausado ──

test("con la conversación tomada por una persona, guarda el entrante y no llama a Claude ni envía", async () => {
  const root = baseFalsa({ cliente: { id: 50 }, sesion: { id: 1, ultimo_mensaje: ahora, bot_pausado: true } });
  const anthropic = claudeFalso();
  const r = await atenderMensaje({ telefono: TEL, wamid: "w1", texto: "¿hay alguien?", ahora }, deps(root, anthropic));
  assert.equal(r.conIA, false);
  assert.equal(r.envios.length, 0, "no sale nada por WhatsApp");
  assert.equal(anthropic.pedidos.length, 0, "no gasta en IA");
  assert.equal(root.estado.consumos.length, 0);
  assert.deepEqual(
    root.estado.historial.map((h) => [h.direccion, h.mensaje, h.paso_nodo]),
    [["entrante", "¿hay alguien?", "agente_ia"]],
    "el mensaje del cliente queda en el historial para el panel y para cuando el bot retome"
  );
  assert.equal(root.estado.updates.at(-1).data.ultimo_mensaje, ahora, "la sesión sigue viva");
});

test("reintento con la conversación tomada: no se guarda dos veces", async () => {
  const root = baseFalsa({ cliente: { id: 50 }, sesion: { id: 1, ultimo_mensaje: ahora, bot_pausado: true } });
  await atenderMensaje({ telefono: TEL, wamid: "w1", texto: "hola?", ahora }, deps(root));
  const r = await atenderMensaje({ telefono: TEL, wamid: "w1", texto: "hola?", ahora }, deps(root));
  assert.equal(r.duplicado, true);
  assert.equal(root.estado.historial.filter((h) => h.wamid === "w1").length, 1);
});

// ── Conversación propia del agente ──

test("el agente arma su contexto y cuenta el límite del día solo con su propia conversación", async () => {
  const root = baseFalsa({ cliente: { id: 50 } });
  await atenderMensaje({ telefono: "5493885550101", texto: "Hola", ahora }, deps(root));
  assert.deepEqual(root.estado.consultas.find((c) => c.findMany).findMany.where.paso_nodo, { in: ["agente_ia", "humano"] });
  assert.equal(root.estado.consultas.find((c) => c.count).count.where.paso_nodo, "agente_ia");
});

test("al retomar, el agente lee lo que respondió el asesor, sin contarlo en el límite del día", async () => {
  const root = baseFalsa({ cliente: { id: 50 } });
  await atenderMensaje({ telefono: "5493885550101", texto: "Hola", ahora }, deps(root));
  const historial = root.estado.consultas.find((c) => c.findMany).findMany.where.paso_nodo;
  assert.ok(historial.in.includes("humano"), "ve los mensajes del asesor");
  assert.equal(root.estado.consultas.find((c) => c.count).count.where.paso_nodo, "agente_ia", "no le consumen cupo");
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
  assert.match(contexto, /Tenés anotado \(corregilo con registrar_calificacion si el cliente lo desmiente\): paga contado; entrega un usado: "Volkswagen Gol 2015"/);
  assert.match(contexto, /Falta averiguar, en este orden: 1\) cuánto pide por el usado/);
});

// ── Clientes que llegan desde la web con el mensaje predefinido ──

const DE_LA_WEB = "Hola SEA AUTOMOTORES! Estoy interesado en el Peugeot 208 2021. ¿Podrían darme más información? (REF #A12B)";
const peugeot = { id: 5, ref: "A12B", marca: "Peugeot", modelo: "208", anio: 2021, disponible: true };
const asesor = (id, slug, datos = {}) => ({ id, slug, activo: true, deleted_at: null, recibe_consultas: true, ...datos });
const PEPITO = asesor(1, "pepito");
const JUAN = asesor(2, "juan");
const JOSE = asesor(3, "jose");
const EXCLUIDO = asesor(4, "excluido", { recibe_consultas: false });
const INACTIVO = asesor(5, "inactivo", { activo: false });
const ASESORES = [PEPITO, JUAN, JOSE, EXCLUIDO, INACTIVO];

test("desde la web: la consulta arranca con origen web, el auto cargado y el asesor que trajo al cliente", async () => {
  const root = baseFalsa({ autos: [peugeot], vendedores: ASESORES });
  const anthropic = claudeFalso();
  await atenderMensaje({ telefono: "5493885550101", texto: `${DE_LA_WEB} [AS:juan]`, ahora }, deps(root, anthropic));
  const sesion = root.estado.sesiones[0];
  assert.equal(sesion.origen, "web");
  assert.equal(sesion.auto_id, 5);
  assert.equal(sesion.vendedor_id, JUAN.id);
  assert.equal(sesion.atribuido, true);
  const contexto = anthropic.pedidos[0].system.at(-1).text;
  assert.match(contexto, /viene de la web consultando por "Peugeot 208 2021" \(ref A12B\)/);
  assert.doesNotMatch(contexto, /auto de interés/, "no le pregunta qué auto le interesa");
  assert.doesNotMatch(JSON.stringify(anthropic.pedidos[0].messages), /\[AS:/, "el código del asesor no le llega a Claude");
});

test("desde la web con un asesor que no existe: la consulta queda sin asesor", async () => {
  const root = baseFalsa({ autos: [peugeot], vendedores: [INACTIVO] });
  await atenderMensaje({ telefono: "5493885550101", texto: `${DE_LA_WEB} [AS:nadie]`, ahora }, deps(root));
  assert.equal(root.estado.sesiones[0].vendedor_id, null);
  assert.equal(root.estado.sesiones[0].atribuido, false);
});

// Con nadie en el turno (el caso con asesores habilitados está en el test siguiente).
test("sin link de un asesor la consulta queda sin asignar, venga de la web o escriba directo", async () => {
  for (const texto of [DE_LA_WEB, "Hola, ¿tienen camionetas?"]) {
    const root = baseFalsa({ autos: [peugeot], vendedores: [EXCLUIDO] });
    await atenderMensaje({ telefono: "5493885550101", texto, ahora }, deps(root));
    const [sesion] = root.estado.sesiones;
    assert.ok(sesion.vendedor_id == null, "nadie se queda con la consulta");
    assert.ok(!sesion.atribuido);
  }
});

test("sin link de un asesor la consulta va por turno, venga de la web o escriba directo", async () => {
  for (const texto of [DE_LA_WEB, "Hola, ¿tienen camionetas?"]) {
    const root = baseFalsa({ autos: [peugeot], vendedores: ASESORES });
    await atenderMensaje({ telefono: "5493885550101", texto, ahora }, deps(root));
    const [sesion] = root.estado.sesiones;
    assert.deepEqual([sesion.vendedor_id, sesion.atribuido], [PEPITO.id, false], texto);
  }
});

test("desde la web nace fría con los puntos del auto de interés", async () => {
  const root = baseFalsa({ autos: [peugeot] });
  await atenderMensaje({ telefono: "5493885550101", texto: DE_LA_WEB, ahora }, deps(root));
  assert.equal(root.estado.sesiones[0].score, 2);
  assert.equal(root.estado.sesiones[0].clasificacion, "FRIO");
});

test("desde la web con la consulta abierta sin auto: el auto de la web pasa a ser el de interés y suma sus puntos", async () => {
  const root = baseFalsa({ sesion: { id: 1, ultimo_mensaje: ahora, auto_id: null }, autos: [peugeot] });
  await atenderMensaje({ telefono: "5493885550101", texto: DE_LA_WEB, ahora }, deps(root));
  assert.ok(root.estado.updates.some((u) => u.where.id === 1 && u.data.auto_id === 5 && u.data.score === 2 && u.data.clasificacion === "FRIO"));
});

test("desde la web por otro auto dentro del plazo: sigue en la misma consulta, con el auto nuevo y el aviso", async () => {
  const gol = { id: 9, ref: "G9", marca: "Volkswagen", modelo: "Gol", anio: 2015, disponible: true };
  const root = baseFalsa({ sesion: { id: 1, ultimo_mensaje: ahora, auto_id: 9, pago_tipo: "contado" }, autos: [gol, peugeot] });
  await atenderMensaje({ telefono: TEL, texto: DE_LA_WEB, ahora }, deps(root));
  assert.equal(root.estado.sesiones.length, 1, "no abre otra consulta");
  const cambio = root.estado.updates.find((u) => u.where.id === 1 && u.data.auto_id === 5);
  assert.ok(cambio, "la misma consulta pasa al Peugeot");
  assert.equal(cambio.data.requiere_vendedor, true);
  assert.equal(cambio.data.requiere_vendedor_motivo, "Ahora le interesa Peugeot 208 2021, antes Volkswagen Gol 2015");
  assert.equal(root.estado.updates.at(-1).where.id, 1, "el turno se cierra en la misma consulta");
});

test("el turno se cierra en la misma consulta cuando la IA registra otro auto", async () => {
  const root = baseFalsa({ sesion: { id: 1, ultimo_mensaje: ahora, auto_id: 9 }, autos: [peugeot] });
  const respuestas = [
    { stop_reason: "tool_use", usage: {}, content: [{ type: "tool_use", id: "t1", name: "registrar_calificacion", input: { auto_ref: "A12B" } }] },
    { stop_reason: "end_turn", usage: {}, content: [{ type: "text", text: "¡Buenísimo el 208!" }] },
  ];
  const anthropic = { messages: { create: async () => respuestas.shift() } };

  await atenderMensaje({ telefono: TEL, texto: "Mejor el Peugeot 208", ahora }, { ...deps(root, anthropic), dbAgente: root });

  assert.equal(root.estado.sesiones.length, 1, "la IA registró otro auto: sigue la misma consulta");
  const cierre = root.estado.updates.at(-1);
  assert.equal(cierre.where.id, 1);
  assert.deepEqual(cierre.data.ultimo_mensaje, ahora);
});

test("la IA registra otro auto en una consulta atendida: vuelve a pendiente y sube", async () => {
  const gol = { id: 9, ref: "G9", marca: "Volkswagen", modelo: "Gol", anio: 2015, disponible: true };
  const atendida = { id: 1, ultimo_mensaje: hace(3), auto_id: 9, atendido_at: hace(48), atendido_por: 2, orden_at: hace(48) };
  const root = conUpdatesQueGuardan(baseFalsa({ sesion: atendida, autos: [gol, peugeot] }));
  const respuestas = [
    { stop_reason: "tool_use", usage: {}, content: [{ type: "tool_use", id: "t1", name: "registrar_calificacion", input: { auto_ref: "A12B" } }] },
    { stop_reason: "end_turn", usage: {}, content: [{ type: "text", text: "¡Buenísimo el 208!" }] },
  ];
  const anthropic = { messages: { create: async () => respuestas.shift() } };

  await atenderMensaje({ telefono: TEL, texto: "Mejor el Peugeot 208", ahora }, { ...deps(root, anthropic), dbAgente: root });

  assert.equal(root.estado.sesiones.length, 1, "sigue la misma consulta");
  const [consulta] = root.estado.sesiones;
  assert.equal(consulta.auto_id, 5);
  assert.equal(consulta.atendido_at, null);
  assert.equal(consulta.atendido_por, null);
  assert.deepEqual(consulta.orden_at, ahora);
  assert.equal(consulta.requiere_vendedor_motivo, "Ahora le interesa Peugeot 208 2021, antes Volkswagen Gol 2015");
});

test("la conversación sigue en la consulta del último mensaje", async () => {
  const hace = (h) => new Date(ahora.getTime() - h * 3_600_000);
  const root = baseFalsa({ cliente: { id: 50 }, sesiones: [{ id: 1, ultimo_mensaje: hace(1), auto_id: 5 }, { id: 2, ultimo_mensaje: hace(5), auto_id: 7 }] });
  await atenderMensaje({ telefono: TEL, texto: "Hola", ahora }, deps(root));
  assert.equal(root.estado.sesiones.length, 2, "no abre otra");
  assert.equal(root.estado.updates.at(-1).where.id, 1);
});

test("desde la web por un auto que ya no está: no se carga y se le avisa al agente", async () => {
  const root = baseFalsa({ autos: [{ ...peugeot, disponible: false }] });
  const anthropic = claudeFalso();
  await atenderMensaje({ telefono: "5493885550101", texto: DE_LA_WEB, ahora }, deps(root, anthropic));
  assert.equal(root.estado.sesiones[0].auto_id ?? null, null);
  assert.match(anthropic.pedidos[0].system.at(-1).text, /ya no está disponible/);
});

test("en cada mensaje el agente recibe el auto de la consulta con su código", async () => {
  const root = baseFalsa({ sesion: { id: 1, ultimo_mensaje: ahora, auto_id: peugeot.id }, autos: [peugeot] });
  const anthropic = claudeFalso();
  await atenderMensaje({ telefono: TEL, texto: "Pasame las fotos", ahora }, deps(root, anthropic));
  const contexto = anthropic.pedidos[0].system.at(-1).text;
  assert.ok(contexto.includes('Auto de esta consulta: "Peugeot 208 2021", código A12B.'));
  assert.doesNotMatch(contexto, /auto de interés/);
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
  // Ya guardado y ya respondido (con su fecha y su id, como en la base).
  root.estado.historial.push(
    { id: 1, cliente_id: 77, direccion: "entrante", mensaje: "hola", wamid: "w1", paso_nodo: "agente_ia", created_at: haceDias(1) },
    { id: 2, cliente_id: 77, direccion: "saliente", mensaje: "¡Hola!", wamid: null, paso_nodo: "agente_ia", created_at: haceDias(1) }
  );
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
  assert.equal(root.estado.transacciones, 2, "la ficha con su canal y, aparte, el turno de la consulta nueva");
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

// ── Verificación crediticia (BCRA) ──

// Con términos publicados y sin respuestas del cliente todavía.
function conVerificacionActiva(root, { falla = false } = {}) {
  return Object.assign(root, {
    terminos_versiones: {
      findFirst: async () => {
        if (falla) throw new Error("se cayó la base");
        return { id: 1 };
      },
    },
    consentimientos: { findFirst: async () => null },
    consultas_crediticias: { findFirst: async () => null },
  });
}

async function conWebPublica(fn) {
  const antes = process.env.PUBLIC_WEB_URL;
  process.env.PUBLIC_WEB_URL = "https://agencia.com";
  try {
    return await fn();
  } finally {
    if (antes === undefined) delete process.env.PUBLIC_WEB_URL;
    else process.env.PUBLIC_WEB_URL = antes;
  }
}

const financiaConRecibo = { id: 900, cliente_id: 50, pago_tipo: "financiado", credito_ok: 1, ultimo_mensaje: new Date(ahora.getTime() - 60_000) };

test("con la verificación activa y el cliente financiando, el agente recibe el pedido de permiso con el link de privacidad", async () => {
  await conWebPublica(async () => {
    const root = conVerificacionActiva(baseFalsa({ cliente: { id: 50 }, sesion: financiaConRecibo }));
    const anthropic = claudeFalso("Dale");
    await atenderMensaje({ telefono: TEL, texto: "tengo recibo de sueldo", ahora }, deps(root, anthropic));
    const contexto = anthropic.pedidos[0].system[1].text;
    assert.match(contexto, /Verificación crediticia: pedile permiso/);
    assert.ok(contexto.includes("https://agencia.com/privacidad"));
  });
});

test("si falla averiguar en qué va la verificación crediticia, la respuesta sale igual", async () => {
  await conWebPublica(async () => {
    const root = conVerificacionActiva(baseFalsa({ cliente: { id: 50 }, sesion: financiaConRecibo }), { falla: true });
    const anthropic = claudeFalso("Dale");
    const r = await atenderMensaje({ telefono: TEL, texto: "tengo recibo", ahora }, deps(root, anthropic));
    assert.equal(r.texto, "Dale");
    assert.doesNotMatch(anthropic.pedidos[0].system[1].text, /Verificación crediticia/);
  });
});

test("el consentimiento guarda el wamid del mensaje en que el cliente respondió", async () => {
  await conWebPublica(async () => {
    const guardados = [];
    const root = conVerificacionActiva(baseFalsa({ cliente: { id: 50 }, sesion: financiaConRecibo }));
    root.consentimientos.create = async ({ data }) => (guardados.push(data), data);
    const respuestas = [
      { stop_reason: "tool_use", usage: { input_tokens: 10, output_tokens: 5 }, content: [{ type: "tool_use", id: "t1", name: "registrar_consentimiento", input: { acepta: true } }] },
      { stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 5 }, content: [{ type: "text", text: "Gracias" }] },
    ];
    const anthropic = { messages: { create: async () => respuestas.shift() } };
    await atenderMensaje({ telefono: TEL, wamid: "wamid.DEL_SI", texto: "sí, autorizo", ahora }, deps(root, anthropic));
    assert.equal(guardados.length, 1);
    assert.equal(guardados[0].acepta, true);
    assert.equal(guardados[0].wamid, "wamid.DEL_SI");
  });
});

// ── Reparto por turnos y atribución por link ──

const hace = (horas) => new Date(ahora.getTime() - horas * 3_600_000);
const telefonoNumero = (n) => `549388555${String(n).padStart(4, "0")}`;
const asignacion = (s) => [s.vendedor_id ?? null, Boolean(s.atribuido)];
const cambiosDeAsesor = (root, id) => root.estado.updates.filter((u) => u.where.id === id && "vendedor_id" in u.data).map((u) => [u.data.vendedor_id, u.data.atribuido]);
// El cliente 50 (TEL) con una consulta abierta hace una hora.
const consultaAbierta = (datos = {}) => ({ id: 1, cliente_id: 50, ultimo_mensaje: hace(1), auto_id: null, vendedor_id: null, atribuido: false, ...datos });
const baseConConsulta = (consulta, extra = {}) => baseFalsa({ cliente: { id: 50 }, sesiones: [consulta], vendedores: ASESORES, autos: [peugeot], ...extra });

test("seis consultas nuevas sin link se reparten 1, 2, 3, 1, 2, 3 y el excluido nunca recibe", async () => {
  const root = baseFalsa({ vendedores: ASESORES });
  for (let n = 1; n <= 6; n++) await atenderMensaje({ telefono: telefonoNumero(n), texto: "Hola", ahora }, deps(root));
  assert.deepEqual(root.estado.sesiones.map(asignacion), [[1, false], [2, false], [3, false], [1, false], [2, false], [3, false]]);
});

test("con el reparto apagado las consultas sin link quedan sin asignar", async () => {
  const root = baseFalsa({ vendedores: ASESORES, configuracion: { reparticion_equitativa: "0" } });
  await atenderMensaje({ telefono: TEL, texto: "Hola", ahora }, deps(root));
  assert.deepEqual(asignacion(root.estado.sesiones[0]), [null, false]);
});

test("si ningún asesor participa, la consulta queda sin asignar", async () => {
  const root = baseFalsa({ vendedores: [EXCLUIDO, INACTIVO] });
  await atenderMensaje({ telefono: TEL, texto: "Hola", ahora }, deps(root));
  assert.deepEqual(asignacion(root.estado.sesiones[0]), [null, false]);
});

test("una consulta vencida no sigue con su asesor: la nueva va por turno", async () => {
  const root = baseConConsulta(consultaAbierta({ ultimo_mensaje: haceDias(31), vendedor_id: JUAN.id, atribuido: true }));
  await atenderMensaje({ telefono: TEL, texto: "Hola de nuevo", ahora }, deps(root));
  const nueva = root.estado.sesiones.find((s) => s.id !== 1);
  assert.deepEqual(asignacion(nueva), [PEPITO.id, false]);
});

test("el link de un asesor que no participa del turno vale igual y no gasta turno", async () => {
  const root = baseFalsa({ vendedores: ASESORES });
  await atenderMensaje({ telefono: telefonoNumero(1), texto: "Hola [AS:excluido]", ahora }, deps(root));
  await atenderMensaje({ telefono: telefonoNumero(2), texto: "Hola", ahora }, deps(root));
  assert.deepEqual(root.estado.sesiones.map(asignacion), [[EXCLUIDO.id, true], [PEPITO.id, false]]);
});

test("el cliente de Juan que vuelve por el link de Pepito: la consulta abierta pasa a ser de Pepito", async () => {
  const root = baseConConsulta(consultaAbierta({ vendedor_id: JUAN.id, atribuido: true }));
  await atenderMensaje({ telefono: TEL, texto: "Hola otra vez [AS:pepito]", ahora }, deps(root));
  assert.equal(root.estado.sesiones.length, 1, "sigue en la misma consulta");
  assert.deepEqual(cambiosDeAsesor(root, 1), [[PEPITO.id, true]]);
});

test("el link de un asesor se queda con una consulta que estaba sin asignar", async () => {
  const root = baseConConsulta(consultaAbierta());
  await atenderMensaje({ telefono: TEL, texto: "Hola [AS:juan]", ahora }, deps(root));
  assert.deepEqual(cambiosDeAsesor(root, 1), [[JUAN.id, true]]);
  assert.equal(root.reparto.configuracion.reparto_ultimo_vendedor, null, "el link no gasta turno");
});

test("el link del mismo asesor que ya tiene la consulta no escribe nada de más", async () => {
  const root = baseConConsulta(consultaAbierta({ vendedor_id: JUAN.id, atribuido: true }));
  await atenderMensaje({ telefono: TEL, texto: "Hola [AS:juan]", ahora }, deps(root));
  assert.deepEqual(cambiosDeAsesor(root, 1), []);
  assert.deepEqual(root.estado.updates.filter((u) => u.where.id === 1 && ("requiere_vendedor_motivo" in u.data || "orden_at" in u.data)), [], "ni aviso ni cambio de orden");
});

test("un link inválido (inexistente, inactivo) se ignora: la consulta abierta sigue con su asesor", async () => {
  for (const slug of ["nadie", "inactivo"]) {
    const root = baseConConsulta(consultaAbierta({ vendedor_id: JUAN.id, atribuido: true }));
    await atenderMensaje({ telefono: TEL, texto: `Hola [AS:${slug}]`, ahora }, deps(root));
    assert.deepEqual(cambiosDeAsesor(root, 1), [], slug);
  }
});

test("una consulta abierta sin asesor no se reparte en mitad de la charla", async () => {
  const root = baseConConsulta(consultaAbierta());
  await atenderMensaje({ telefono: TEL, texto: "Sigo con una duda", ahora }, deps(root));
  assert.deepEqual(cambiosDeAsesor(root, 1), []);
  assert.equal(root.reparto.configuracion.reparto_ultimo_vendedor, null);
});

test("desde la web por el mismo auto con otro asesor: la consulta abierta pasa al del link", async () => {
  const root = baseConConsulta(consultaAbierta({ auto_id: peugeot.id, vendedor_id: JUAN.id, atribuido: true }));
  await atenderMensaje({ telefono: TEL, texto: `${DE_LA_WEB} [AS:pepito]`, ahora }, deps(root));
  assert.deepEqual(cambiosDeAsesor(root, 1), [[PEPITO.id, true]]);
});

test("desde la web por otro auto con el link de Pepito: sigue la misma consulta, con el auto nuevo, y queda de Pepito", async () => {
  const gol = { id: 9, ref: "G9", marca: "Volkswagen", modelo: "Gol", anio: 2015, disponible: true };
  const root = baseConConsulta(consultaAbierta({ auto_id: 9, vendedor_id: JUAN.id, atribuido: true }), { autos: [gol, peugeot] });
  await atenderMensaje({ telefono: TEL, texto: `${DE_LA_WEB} [AS:pepito]`, ahora }, deps(root));
  assert.equal(root.estado.sesiones.length, 1, "no abre otra consulta");
  assert.ok(root.estado.updates.some((u) => u.where.id === 1 && u.data.auto_id === peugeot.id), "con el auto nuevo");
  assert.deepEqual(cambiosDeAsesor(root, 1).at(-1), [PEPITO.id, true], "queda de Pepito");
  assert.equal(root.reparto.configuracion.reparto_ultimo_vendedor, null, "el link no gasta turno");
});

// ── El link de otro asesor deja la consulta completa, pendiente y arriba ──

const sinAviso = (u) => !("requiere_vendedor_motivo" in u.data) && !("orden_at" in u.data) && !("atendido_at" in u.data);
const MOTIVO_LINK = "Llegó por tu link";

test("el link de otro asesor deja la consulta completa para el asesor nuevo: suya, pendiente, arriba, con aviso y con sus respuestas", async () => {
  const consulta = consultaAbierta({ sesion_inicio: hace(5), auto_id: peugeot.id, vendedor_id: JUAN.id, atribuido: true, pago_tipo: "contado", entrega_usado: 0, decisor: "solo", requiere_vendedor: false, atendido_at: haceDias(1), atendido_por: JUAN.id, orden_at: haceDias(1) });
  const historial = [mensajeDe(1, "entrante", "quiero pagar contado", hace(3)), mensajeDe(2, "saliente", "Perfecto, anotado", hace(3))];
  const root = conUpdatesQueGuardan(baseConConsulta(consulta, { historial }));
  const anthropic = claudeFalso();
  await atenderMensaje({ telefono: TEL, texto: "Hola otra vez [AS:pepito]", ahora }, deps(root, anthropic));
  assert.equal(root.estado.sesiones.length, 1, "sigue en la misma consulta");
  assert.deepEqual(root.estado.historial.slice(0, 2), historial, "la charla de antes sigue intacta");
  assert.match(lasDeClaude(anthropic), /quiero pagar contado/, "Claude recibe la charla de la consulta");
  assert.match(lasDeClaude(anthropic), /Perfecto, anotado/);
  const [final] = root.estado.sesiones;
  assert.equal(final.vendedor_id, PEPITO.id);
  assert.equal(final.atribuido, true);
  assert.equal(final.atendido_at, null);
  assert.equal(final.atendido_por, null);
  assert.deepEqual(final.orden_at, ahora);
  assert.equal(final.requiere_vendedor, true);
  assert.equal(final.requiere_vendedor_motivo, MOTIVO_LINK);
  assert.deepEqual(final.requiere_vendedor_at, ahora);
  assert.equal(final.pago_tipo, "contado");
  assert.equal(final.entrega_usado, 0);
  assert.equal(final.decisor, "solo");
});

test("el link de otro asesor y otro auto en el mismo mensaje: misma consulta, de Pepito, pendiente y arriba, con el aviso del link y el del auto", async () => {
  const gol = { id: 9, ref: "G9", marca: "Volkswagen", modelo: "Gol", anio: 2015, disponible: true };
  const consulta = consultaAbierta({ auto_id: 9, vendedor_id: JUAN.id, atribuido: true, requiere_vendedor: false, atendido_at: haceDias(1), atendido_por: JUAN.id, orden_at: haceDias(1) });
  const root = conUpdatesQueGuardan(baseConConsulta(consulta, { autos: [gol, peugeot] }));
  await atenderMensaje({ telefono: TEL, texto: `${DE_LA_WEB} [AS:pepito]`, ahora }, deps(root));
  assert.equal(root.estado.sesiones.length, 1, "no abre otra consulta");
  const [final] = root.estado.sesiones;
  assert.equal(final.auto_id, peugeot.id);
  assert.equal(final.vendedor_id, PEPITO.id);
  assert.equal(final.atribuido, true);
  assert.equal(final.atendido_at, null);
  assert.equal(final.atendido_por, null);
  assert.deepEqual(final.orden_at, ahora);
  assert.equal(final.requiere_vendedor, true);
  assert.equal(final.requiere_vendedor_motivo, "Llegó por tu link. Ahora le interesa Peugeot 208 2021, antes Volkswagen Gol 2015");
});

test("el motivo de link y auto juntos se recorta a 120 caracteres", async () => {
  const viejo = { id: 9, ref: "G9", marca: "Marca".repeat(12), modelo: "Modelo", anio: 2015, disponible: true };
  const nuevo = { id: 7, ref: "L7", marca: "Fabricante".repeat(6), modelo: "Versión", anio: 2022, disponible: true };
  const consulta = consultaAbierta({ auto_id: 9, vendedor_id: JUAN.id, atribuido: true, atendido_at: haceDias(1), atendido_por: JUAN.id });
  const root = conUpdatesQueGuardan(baseConConsulta(consulta, { autos: [viejo, nuevo] }));
  await atenderMensaje({ telefono: TEL, texto: "Hola, me interesa (REF #L7) [AS:pepito]", ahora }, deps(root));
  const desc = (a) => `${a.marca} ${a.modelo} ${a.anio}`;
  const esperado = `Llegó por tu link. Ahora le interesa ${desc(nuevo)}, antes ${desc(viejo)}`.slice(0, 120);
  const [final] = root.estado.sesiones;
  assert.equal(final.auto_id, nuevo.id);
  assert.equal(final.vendedor_id, PEPITO.id);
  assert.equal(final.requiere_vendedor_motivo.length, 120);
  assert.equal(final.requiere_vendedor_motivo, esperado);
});

test("el link de un asesor a una consulta sin asignar la deja suya, pendiente y arriba con el aviso 'Llegó por tu link'", async () => {
  const root = conUpdatesQueGuardan(baseConConsulta(consultaAbierta({ requiere_vendedor: false, atendido_at: haceDias(1), atendido_por: JUAN.id, orden_at: haceDias(1) })));
  await atenderMensaje({ telefono: TEL, texto: "Hola [AS:juan]", ahora }, deps(root));
  const [final] = root.estado.sesiones;
  assert.equal(final.vendedor_id, JUAN.id);
  assert.equal(final.atribuido, true);
  assert.equal(final.atendido_at, null);
  assert.equal(final.atendido_por, null);
  assert.deepEqual(final.orden_at, ahora);
  assert.equal(final.requiere_vendedor, true);
  assert.equal(final.requiere_vendedor_motivo, MOTIVO_LINK);
});

test("una consulta nueva que llega con el link de Pepito es suya y atribuida, sin aviso de link", async () => {
  const root = conUpdatesQueGuardan(baseFalsa({ cliente: { id: 50 }, vendedores: ASESORES }));
  await atenderMensaje({ telefono: TEL, texto: "Hola [AS:pepito]", ahora }, deps(root));
  assert.equal(root.estado.sesiones.length, 1);
  const [nueva] = root.estado.sesiones;
  assert.deepEqual(asignacion(nueva), [PEPITO.id, true]);
  assert.notEqual(nueva.requiere_vendedor_motivo, MOTIVO_LINK);
  assert.ok(!root.estado.updates.some((u) => u.data.requiere_vendedor_motivo === MOTIVO_LINK), "ningún update lleva el aviso de link");
});

test("el link del mismo asesor que la tenía por turno, sin atribuir: solo se escribe atribuido, sin aviso ni orden", async () => {
  const root = conUpdatesQueGuardan(baseConConsulta(consultaAbierta({ vendedor_id: JUAN.id, atribuido: false })));
  await atenderMensaje({ telefono: TEL, texto: "Hola [AS:juan]", ahora }, deps(root));
  const deAsesor = root.estado.updates.filter((u) => u.where.id === 1 && "vendedor_id" in u.data);
  assert.equal(deAsesor.length, 1);
  assert.equal(deAsesor[0].data.atribuido, true);
  assert.ok(sinAviso(deAsesor[0]), "ese update no trae aviso, orden ni atención");
  assert.deepEqual(root.estado.updates.filter(tocaElAviso), []);
});

test("un link inválido (inexistente o de asesor inactivo) a una consulta atendida de Juan no cambia el asesor y la reabre como 'Volvió a escribir'", async () => {
  for (const slug of ["nadie", "inactivo"]) {
    const consulta = consultaAbierta({ vendedor_id: JUAN.id, atribuido: true, requiere_vendedor: false, atendido_at: haceDias(1), atendido_por: JUAN.id, orden_at: haceDias(1) });
    const root = conUpdatesQueGuardan(baseConConsulta(consulta));
    await atenderMensaje({ telefono: TEL, texto: `Hola [AS:${slug}]`, ahora }, deps(root));
    assert.deepEqual(cambiosDeAsesor(root, 1), [], slug);
    const [final] = root.estado.sesiones;
    assert.deepEqual(asignacion(final), [JUAN.id, true], slug);
    assert.equal(final.atendido_at, null, slug);
    assert.equal(final.atendido_por, null, slug);
    assert.equal(final.requiere_vendedor, true, slug);
    assert.equal(final.requiere_vendedor_motivo, "Volvió a escribir", slug);
    assert.deepEqual(final.requiere_vendedor_at, ahora, slug);
    assert.deepEqual(final.orden_at, ahora, slug);
  }
});

test("el link de Pepito a una consulta de Juan ya pendiente con otro motivo: pasa a Pepito y el motivo pasa a ser 'Llegó por tu link'", async () => {
  const consulta = consultaAbierta({ vendedor_id: JUAN.id, atribuido: true, requiere_vendedor: true, requiere_vendedor_motivo: "Visita propuesta: sábado", requiere_vendedor_at: hace(5), atendido_at: null, atendido_por: null, orden_at: hace(5) });
  const root = conUpdatesQueGuardan(baseConConsulta(consulta));
  await atenderMensaje({ telefono: TEL, texto: "Hola [AS:pepito]", ahora }, deps(root));
  const [final] = root.estado.sesiones;
  assert.deepEqual(asignacion(final), [PEPITO.id, true]);
  assert.equal(final.requiere_vendedor, true);
  assert.equal(final.requiere_vendedor_motivo, MOTIVO_LINK);
  assert.deepEqual(final.requiere_vendedor_at, ahora);
  assert.deepEqual(final.orden_at, ahora);
  assert.equal(final.atendido_at, null);
  assert.equal(final.atendido_por, null);
});

// Como MySQL con DATETIME(0): cada fecha que se guarda queda redondeada al segundo más cercano.
function conFechasAlSegundo(root) {
  const guardar = root.chat_estado.update;
  const alSegundo = (v) => (v instanceof Date ? new Date(Math.round(v.getTime() / 1000) * 1000) : v);
  root.chat_estado.update = (args) => guardar({ ...args, data: Object.fromEntries(Object.entries(args.data).map(([k, v]) => [k, alSegundo(v)])) });
  return root;
}

test("el motivo de link y auto juntos sale aunque la base guarde las fechas al segundo y la hora del turno traiga milisegundos", async () => {
  const ahoraConMs = new Date("2026-11-14T15:30:20.750Z");
  const gol = { id: 9, ref: "G9", marca: "Volkswagen", modelo: "Gol", anio: 2015, disponible: true };
  const antes = (horas) => new Date(ahoraConMs.getTime() - horas * 3_600_000);
  const consulta = consultaAbierta({ ultimo_mensaje: antes(1), auto_id: 9, vendedor_id: JUAN.id, atribuido: true, requiere_vendedor: false, atendido_at: antes(24), atendido_por: JUAN.id, orden_at: antes(24) });
  const root = conFechasAlSegundo(conUpdatesQueGuardan(baseConConsulta(consulta, { autos: [gol, peugeot] })));
  await atenderMensaje({ telefono: TEL, texto: `${DE_LA_WEB} [AS:pepito]`, ahora: ahoraConMs }, deps(root));
  assert.equal(root.estado.sesiones.length, 1, "no abre otra consulta");
  const [final] = root.estado.sesiones;
  assert.equal(final.vendedor_id, PEPITO.id);
  assert.equal(final.auto_id, peugeot.id);
  assert.equal(final.requiere_vendedor_motivo, "Llegó por tu link. Ahora le interesa Peugeot 208 2021, antes Volkswagen Gol 2015");
});

test("si el turno falla, la consulta se crea igual sin asesor y el mensaje se guarda y se responde", async (t) => {
  const original = console.error;
  console.error = () => {};
  t.after(() => (console.error = original));
  const root = baseFalsa({ vendedores: ASESORES });
  root.reparto.fallos.push(Object.assign(new Error("timeout"), { code: "P2028" }));
  const r = await atenderMensaje({ telefono: TEL, texto: "Hola", ahora }, deps(root));
  assert.deepEqual(asignacion(root.estado.sesiones[0]), [null, false]);
  assert.equal(r.conIA, true, "se responde");
  assert.deepEqual(root.estado.historial.map((h) => h.direccion), ["entrante", "saliente"]);
});

// Caracterización: el camino de error de autoDeLaConsulta ya existía cuando se escribió este test.
test("si no se puede leer el auto de la consulta, el agente responde igual", async (t) => {
  const errores = t.mock.method(console, "error", () => {});
  const base = baseFalsa({ sesion: { id: 1, ultimo_mensaje: ahora, auto_id: peugeot.id }, autos: [peugeot] });
  const buscarAuto = base.autos.findFirst;
  const root = {
    ...base,
    autos: { ...base.autos, findFirst: async (args) => (args.where.id !== undefined ? Promise.reject(new Error("base caída")) : buscarAuto(args)) },
  };
  const anthropic = claudeFalso("¡Hola!");
  const r = await atenderMensaje({ telefono: TEL, texto: "Pasame las fotos", ahora }, deps(root, anthropic));
  assert.equal(r.texto, "¡Hola!");
  assert.equal(anthropic.pedidos.length, 1);
  assert.doesNotMatch(anthropic.pedidos[0].system.at(-1).text, /Auto de esta consulta/);
  assert.match(errores.mock.calls.map((c) => c.arguments.join(" ")).join(" | "), /no se pudo leer el auto de la consulta: base caída/);
});

// ── Pasado el plazo se pregunta todo de nuevo, y la IA ve solo la charla de la consulta en curso ──

// Un mensaje de la charla del cliente 50, como lo guarda el orquestador (con id, como en la base).
const mensajeDe = (id, direccion, mensaje, created_at, paso_nodo = "agente_ia") => ({ id, cliente_id: 50, direccion, mensaje, paso_nodo, created_at, wamid: null });
const lasDeClaude = (anthropic) => JSON.stringify(anthropic.pedidos[0].messages);
// Una consulta con todo respondido, con su asesor.
const consultaRespondida = (datos = {}) => ({ id: 1, cliente_id: 50, sesion_inicio: haceDias(60), ultimo_mensaje: haceDias(31), auto_id: null, pago_tipo: "contado", entrega_usado: 0, decisor: "solo", vendedor_id: JUAN.id, atribuido: true, ...datos });
const charlaVieja = [mensajeDe(1, "entrante", "quiero pagar contado", haceDias(40)), mensajeDe(2, "saliente", "Perfecto, anotado el pago contado", haceDias(40))];

test("vuelve a los 31 días con todo respondido y sin link: consulta nueva sin esas respuestas, por turno, y a la IA le falta todo", async () => {
  const root = baseConConsulta(consultaRespondida(), { historial: charlaVieja });
  const anthropic = claudeFalso();
  await atenderMensaje({ telefono: TEL, texto: "Hola de nuevo", ahora }, deps(root, anthropic));
  assert.equal(root.estado.sesiones.length, 2, "se abre otra consulta");
  const nueva = root.estado.sesiones[1];
  assert.deepEqual([nueva.pago_tipo, nueva.entrega_usado, nueva.decisor], [undefined, undefined, undefined], "sin las respuestas de antes");
  assert.deepEqual(asignacion(nueva), [PEPITO.id, false], "va por turno, no sigue con Juan");
  assert.deepEqual(nueva.sesion_inicio, ahora, "arranca hoy: de ahí en adelante cuenta la charla");
  const contexto = anthropic.pedidos[0].system.at(-1).text;
  assert.doesNotMatch(contexto, /Tenés anotado/, "no hay nada respondido");
  const faltan = contexto.match(/Falta averiguar[^\n]*/)?.[0] ?? "";
  assert.match(faltan, /forma de pago/);
  assert.match(faltan, /si entrega un usado/);
  assert.doesNotMatch(lasDeClaude(anthropic), /contado/, "la charla de la consulta vencida no le llega");
});

test("vuelve a los 4 meses con el link de un asesor: consulta nueva sin respuestas ni charla anterior, asignada y atribuida a ese asesor", async () => {
  const root = baseConConsulta(consultaRespondida({ sesion_inicio: haceDias(200), ultimo_mensaje: haceDias(120), vendedor_id: PEPITO.id }), { historial: charlaVieja.map((m) => ({ ...m, created_at: haceDias(130) })) });
  const anthropic = claudeFalso();
  await atenderMensaje({ telefono: TEL, texto: "Hola, vuelvo [AS:juan]", ahora }, deps(root, anthropic));
  assert.equal(root.estado.sesiones.length, 2);
  const nueva = root.estado.sesiones[1];
  assert.deepEqual([nueva.pago_tipo, nueva.entrega_usado, nueva.decisor], [undefined, undefined, undefined]);
  assert.deepEqual(asignacion(nueva), [JUAN.id, true]);
  assert.deepEqual(nueva.sesion_inicio, ahora);
  assert.doesNotMatch(lasDeClaude(anthropic), /contado/, "ningún mensaje de la consulta vieja le llega a Claude");
  assert.equal(anthropic.pedidos[0].messages.length, 1, "solo el mensaje nuevo");
  assert.doesNotMatch(lasDeClaude(anthropic), /\[AS:/);
});

test("el 'pago contado' dicho en una consulta vencida no le llega a Claude cuando el cliente vuelve a los 31 días", async () => {
  const root = baseConConsulta(consultaRespondida({ sesion_inicio: haceDias(45) }), { historial: [...charlaVieja, mensajeDe(3, "entrante", "pago contado", haceDias(32))] });
  const anthropic = claudeFalso();
  await atenderMensaje({ telefono: TEL, texto: "¿Siguen teniendo autos?", ahora }, deps(root, anthropic));
  assert.doesNotMatch(lasDeClaude(anthropic), /pago contado/);
  assert.deepEqual(anthropic.pedidos[0].messages.map((m) => m.role), ["user"], "solo lo de ahora");
  assert.match(lasDeClaude(anthropic), /Siguen teniendo autos/);
});

test("quien vuelve a los 10 días a la misma consulta: Claude recibe los mensajes de esa consulta, incluidos los de hace 10 días", async () => {
  const consulta = consultaRespondida({ sesion_inicio: haceDias(20), ultimo_mensaje: haceDias(10) });
  const historial = [
    mensajeDe(1, "entrante", "busco un 208", haceDias(20)),
    mensajeDe(2, "saliente", "Tenemos uno 2021", haceDias(20)),
    mensajeDe(3, "entrante", "me gusta el rojo", haceDias(10)),
    mensajeDe(4, "saliente", "Es el de la foto", haceDias(10)),
  ];
  const root = baseConConsulta(consulta, { historial });
  const anthropic = claudeFalso();
  await atenderMensaje({ telefono: TEL, texto: "Sigo interesado", ahora }, deps(root, anthropic));
  assert.equal(root.estado.sesiones.length, 1);
  const recibido = lasDeClaude(anthropic);
  for (const texto of ["busco un 208", "Tenemos uno 2021", "me gusta el rojo", "Es el de la foto", "Sigo interesado"]) assert.match(recibido, new RegExp(texto));
});

test("al retomar después de una pausa dentro del plazo, Claude recibe lo que escribió el cliente mientras el asesor atendía y las respuestas del asesor", async () => {
  const consulta = consultaRespondida({ sesion_inicio: haceDias(5), ultimo_mensaje: hace(2), bot_pausado: false });
  const historial = [
    mensajeDe(1, "entrante", "¿tienen financiación?", haceDias(5)),
    mensajeDe(2, "saliente", "Soy Juan, sí tenemos", haceDias(4), "humano"),
    mensajeDe(3, "entrante", "perfecto, ¿cuánto sería la cuota?", haceDias(4)),
    mensajeDe(4, "saliente", "Son 12 cuotas de 300 mil", haceDias(3), "humano"),
  ];
  const root = baseConConsulta(consulta, { historial });
  const anthropic = claudeFalso();
  await atenderMensaje({ telefono: TEL, texto: "Genial, ¿me guardan el auto?", ahora }, deps(root, anthropic));
  const recibido = lasDeClaude(anthropic);
  for (const texto of ["tienen financiación", "Soy Juan, sí tenemos", "cuánto sería la cuota", "Son 12 cuotas de 300 mil", "me guardan el auto"]) assert.match(recibido, new RegExp(texto));
});

test("la consulta vencida tiene 50 mensajes y la nueva 3 (el primero en el mismo instante en que se abrió): Claude recibe solo los 3 de la nueva", async () => {
  const apertura = haceDias(2);
  const viejos = Array.from({ length: 50 }, (_, n) => mensajeDe(n + 1, n % 2 ? "saliente" : "entrante", `mensaje viejo ${n + 1}`, new Date(haceDias(40).getTime() + n * 60_000)));
  // Anteriores al inicio de la consulta actual pero con ids MAYORES (reloj desfasado, consultas superpuestas de antes):
  // con el filtro antes del take no entran; si se trae el take y se filtra después, ocuparían los lugares.
  const desfasados = Array.from({ length: 25 }, (_, n) => mensajeDe(100 + n, n % 2 ? "saliente" : "entrante", `mensaje desfasado ${n}`, new Date(apertura.getTime() - 3_600_000 - n * 60_000)));
  const nuevos = [
    mensajeDe(51, "entrante", "hola, busco algo nuevo", apertura),
    mensajeDe(52, "saliente", "¿Qué estás buscando?", new Date(apertura.getTime() + 1)),
    mensajeDe(53, "entrante", "una camioneta", hace(30)),
  ];
  const vencida = consultaRespondida({ id: 1, sesion_inicio: haceDias(60), ultimo_mensaje: haceDias(35) });
  const actual = { id: 2, cliente_id: 50, sesion_inicio: apertura, ultimo_mensaje: hace(30), auto_id: null, vendedor_id: PEPITO.id, atribuido: false };
  const root = baseFalsa({ cliente: { id: 50 }, sesiones: [vencida, actual], vendedores: ASESORES, autos: [peugeot], historial: [...viejos, ...desfasados, ...nuevos] });
  const anthropic = claudeFalso();
  await atenderMensaje({ telefono: TEL, texto: "de unos 5 millones", ahora }, deps(root, anthropic));
  assert.equal(root.estado.sesiones.length, 2, "sigue en la consulta actual");
  const { where, take } = root.estado.consultas.find((c) => c.findMany).findMany;
  assert.deepEqual(where.created_at?.gte, apertura, "el filtro es desde el inicio de la consulta en curso, en la misma consulta a la base");
  assert.equal(take, 20, "y el corte de 20 va en esa misma consulta");
  const recibido = lasDeClaude(anthropic);
  assert.doesNotMatch(recibido, /mensaje viejo|mensaje desfasado/, "ninguno anterior al inicio ocupa lugar");
  for (const texto of ["busco algo nuevo", "Qué estás buscando", "una camioneta", "5 millones"]) assert.match(recibido, new RegExp(texto));
});

test("con dos consultas vigentes de antes del cambio, Claude recibe la charla desde el inicio de la del último mensaje, sea de una o de otra, y nada anterior", async () => {
  const otroAuto = { id: 6, ref: "C34D", marca: "Fiat", modelo: "Cronos", anio: 2022, disponible: true };
  const A = { id: 1, cliente_id: 50, sesion_inicio: haceDias(20), ultimo_mensaje: haceDias(5), auto_id: 5, vendedor_id: JUAN.id, atribuido: false };
  const B = { id: 2, cliente_id: 50, sesion_inicio: haceDias(10), ultimo_mensaje: haceDias(1), auto_id: 6, vendedor_id: JUAN.id, atribuido: false };
  const historial = [
    mensajeDe(1, "entrante", "charla anterior del Peugeot", haceDias(15)),
    mensajeDe(2, "saliente", "respuesta anterior del Peugeot", haceDias(15)),
    mensajeDe(3, "entrante", "sigo con el Peugeot", haceDias(8)),
    mensajeDe(4, "entrante", "ahora miro el Cronos", haceDias(3)),
  ];
  const root = baseFalsa({ cliente: { id: 50 }, sesiones: [A, B], vendedores: ASESORES, autos: [peugeot, otroAuto], historial });
  const anthropic = claudeFalso();
  await atenderMensaje({ telefono: TEL, texto: "¿Cuánto es el Cronos?", ahora }, deps(root, anthropic));
  assert.equal(root.estado.updates.at(-1).where.id, 2, "cae en la del último mensaje");
  const recibido = lasDeClaude(anthropic);
  assert.doesNotMatch(recibido, /anterior del Peugeot/, "nada anterior al inicio de esa consulta");
  for (const texto of ["sigo con el Peugeot", "ahora miro el Cronos", "Cuánto es el Cronos"]) assert.match(recibido, new RegExp(texto));
});

test("la consulta nueva nace con sesion_inicio igual a la hora del turno (la de sus mensajes) y con ultimo_mensaje", async () => {
  const root = baseFalsa({ cliente: { id: 50 } });
  await atenderMensaje({ telefono: TEL, texto: "Hola", ahora }, deps(root));
  const [nueva] = root.estado.sesiones;
  assert.deepEqual(nueva.sesion_inicio, ahora);
  assert.deepEqual(nueva.ultimo_mensaje, ahora);
  assert.deepEqual(root.estado.historial[0].created_at, nueva.sesion_inicio, "el primer mensaje no queda antes del inicio de su consulta");
});

test("una consulta vigente sin sesion_inicio (de antes del campo) no manda historial previo a Claude: solo recibe el mensaje actual", async () => {
  const consulta = consultaRespondida({ sesion_inicio: null, ultimo_mensaje: hace(2) });
  const historial = [mensajeDe(1, "entrante", "pago contado", haceDias(60)), mensajeDe(2, "saliente", "Anotado, contado", haceDias(60)), mensajeDe(3, "entrante", "sigo mirando", haceDias(1)), mensajeDe(4, "saliente", "Cualquier cosa avisame", haceDias(1))];
  const root = baseConConsulta(consulta, { historial });
  const anthropic = claudeFalso();
  await atenderMensaje({ telefono: TEL, texto: "¿Sigue disponible?", ahora }, deps(root, anthropic));
  assert.equal(root.estado.sesiones.length, 1, "se reutiliza la consulta");
  assert.deepEqual(anthropic.pedidos[0].messages.map((m) => m.role), ["user"], "ninguna charla previa");
  assert.doesNotMatch(lasDeClaude(anthropic), /pago contado|sigo mirando|Cualquier cosa/);
  assert.match(lasDeClaude(anthropic), /Sigue disponible/);
});

// ── El cliente vuelve a escribir en una consulta atendida ──

// Como la base: el update de la consulta queda guardado y lo que se lea después lo ve.
function conUpdatesQueGuardan(root) {
  const registrar = root.chat_estado.update;
  root.chat_estado.update = async (args) => {
    const fila = root.estado.sesiones.find((s) => s.id === args.where.id);
    if (!fila) throw new Error(`No existe la consulta ${args.where.id} en la base simulada.`);
    await registrar(args);
    Object.assign(fila, args.data);
    return args;
  };
  return root;
}
const tocaElAviso = (u) => ["requiere_vendedor", "requiere_vendedor_motivo", "requiere_vendedor_at", "orden_at", "atendido_at", "atendido_por"].some((c) => c in u.data);
// Un update que trae el aviso completo de "Volvió a escribir" (puede traer más campos).
const esElAviso = (u) =>
  u.where.id === 1 &&
  u.data.atendido_at === null && u.data.atendido_por === null && u.data.requiere_vendedor === true &&
  u.data.requiere_vendedor_motivo === "Volvió a escribir" &&
  u.data.requiere_vendedor_at?.getTime() === ahora.getTime() && u.data.orden_at?.getTime() === ahora.getTime();
// El estado final de la consulta: nada posterior del turno revirtió el aviso.
function quedoConElAviso(root) {
  const [consulta] = root.estado.sesiones;
  assert.equal(consulta.atendido_at, null);
  assert.equal(consulta.atendido_por, null);
  assert.equal(consulta.requiere_vendedor, true);
  assert.equal(consulta.requiere_vendedor_motivo, "Volvió a escribir");
  assert.deepEqual(consulta.requiere_vendedor_at, ahora);
  assert.deepEqual(consulta.orden_at, ahora);
}
const consultaAtendida = (extra = {}) => ({ id: 1, cliente_id: 50, ultimo_mensaje: haceDias(10), auto_id: 5, requiere_vendedor: false, atendido_at: haceDias(11), atendido_por: 2, orden_at: haceDias(11), ...extra });
const autoPeugeot = { id: 5, ref: "A12B", marca: "Peugeot", modelo: "208", anio: 2021, disponible: true };

test("el cliente escribe 10 días después a una consulta atendida por el mismo auto: vuelve a pendiente, marcada 'Volvió a escribir' y arriba, y el agente responde", async () => {
  const root = conUpdatesQueGuardan(baseFalsa({ cliente: { id: 50 }, sesion: consultaAtendida(), autos: [autoPeugeot] }));
  const anthropic = claudeFalso("¡Hola de nuevo!");
  const r = await atenderMensaje({ telefono: TEL, texto: "Hola, sigo interesado", ahora }, deps(root, anthropic));
  assert.ok(root.estado.updates.some(esElAviso), "hay un update con el aviso completo");
  const [consulta] = root.estado.sesiones;
  assert.equal(consulta.atendido_at, null);
  assert.equal(consulta.atendido_por, null);
  assert.equal(consulta.requiere_vendedor, true);
  assert.equal(consulta.requiere_vendedor_motivo, "Volvió a escribir");
  assert.deepEqual(consulta.requiere_vendedor_at, ahora);
  assert.deepEqual(consulta.orden_at, ahora);
  assert.equal(r.conIA, true);
  assert.equal(r.texto, "¡Hola de nuevo!");
  assert.equal(anthropic.pedidos.length, 1);
});

test("el cliente contesta minutos después de que el asesor respondió con el bot en pausa: vuelve a pendiente con el aviso y sube, y el bot sigue en pausa sin responder", async () => {
  const atendida = consultaAtendida({ ultimo_mensaje: hace(0.1), atendido_at: hace(0.2), orden_at: hace(0.2), bot_pausado: true });
  const root = baseFalsa({ cliente: { id: 50 }, sesion: atendida, autos: [autoPeugeot] });
  const anthropic = claudeFalso();
  const r = await atenderMensaje({ telefono: TEL, texto: "Dale, gracias, ¿a qué hora paso?", ahora }, deps(root, anthropic));
  const aviso = root.estado.updates.find((u) => u.where.id === 1 && u.data.requiere_vendedor_motivo === "Volvió a escribir");
  assert.ok(aviso, "se marca 'Volvió a escribir'");
  assert.equal(aviso.data.requiere_vendedor, true);
  assert.equal(aviso.data.atendido_at, null);
  assert.equal(aviso.data.atendido_por, null);
  assert.deepEqual(aviso.data.requiere_vendedor_at, ahora);
  assert.deepEqual(aviso.data.orden_at, ahora);
  assert.equal(r.pausado, true, "el bot sigue en pausa");
  assert.equal(r.texto, null);
  assert.equal(r.envios.length, 0);
  assert.equal(anthropic.pedidos.length, 0, "no llama al agente");
  assert.ok(root.estado.updates.every((u) => u.data.bot_pausado !== false), "no se reanuda el bot");
});

test("el cliente escribe a una consulta pendiente: no cambia su motivo ni su orden", async () => {
  const pendiente = consultaAtendida({ atendido_at: null, atendido_por: null, ultimo_mensaje: hace(5), orden_at: hace(5), requiere_vendedor: true, requiere_vendedor_motivo: "Quiere ver el auto el sábado", requiere_vendedor_at: hace(5) });
  const root = baseFalsa({ cliente: { id: 50 }, sesion: pendiente, autos: [autoPeugeot] });
  await atenderMensaje({ telefono: TEL, texto: "Hola, ¿sigue en pie?", ahora }, deps(root));
  assert.ok(root.estado.updates.length > 0, "el turno se cierra en la consulta");
  assert.deepEqual(root.estado.updates.filter(tocaElAviso), [], "ningún update toca el motivo, el orden ni la atención");
  assert.equal(root.estado.sesiones[0].requiere_vendedor_motivo, "Quiere ver el auto el sábado");
});

test("el cliente de una consulta atendida llega desde la web por otro auto: queda pendiente y arriba con 'Ahora le interesa <nuevo>, antes <anterior>', no 'Volvió a escribir'", async () => {
  const gol = { id: 9, ref: "G9", marca: "Volkswagen", modelo: "Gol", anio: 2015, disponible: true };
  const root = conUpdatesQueGuardan(baseFalsa({ cliente: { id: 50 }, sesion: consultaAtendida({ auto_id: 9 }), autos: [gol, autoPeugeot] }));
  await atenderMensaje({ telefono: TEL, texto: DE_LA_WEB, ahora }, deps(root));
  const [consulta] = root.estado.sesiones;
  assert.equal(consulta.auto_id, 5);
  assert.equal(consulta.requiere_vendedor_motivo, "Ahora le interesa Peugeot 208 2021, antes Volkswagen Gol 2015");
  assert.equal(consulta.atendido_at, null);
  assert.equal(consulta.atendido_por, null);
  assert.deepEqual(consulta.orden_at, ahora);
  assert.ok(!root.estado.updates.some((u) => u.data.requiere_vendedor_motivo === "Volvió a escribir"), "nunca se marcó 'Volvió a escribir'");
});

test("el cliente de una consulta atendida le pide otro auto a la IA: el motivo que queda es el del auto, no 'Volvió a escribir'", async () => {
  const gol = { id: 9, ref: "G9", marca: "Volkswagen", modelo: "Gol", anio: 2015, disponible: true };
  const root = conUpdatesQueGuardan(baseFalsa({ cliente: { id: 50 }, sesion: consultaAtendida({ auto_id: 9 }), autos: [gol, autoPeugeot] }));
  const respuestas = [
    { stop_reason: "tool_use", usage: {}, content: [{ type: "tool_use", id: "t1", name: "registrar_calificacion", input: { auto_ref: "A12B" } }] },
    { stop_reason: "end_turn", usage: {}, content: [{ type: "text", text: "¡Buenísimo el 208!" }] },
  ];
  const anthropic = { messages: { create: async () => respuestas.shift() } };
  await atenderMensaje({ telefono: TEL, texto: "Mejor el Peugeot 208", ahora }, { ...deps(root, anthropic), dbAgente: root });
  const [consulta] = root.estado.sesiones;
  assert.equal(consulta.auto_id, 5);
  assert.equal(consulta.requiere_vendedor_motivo, "Ahora le interesa Peugeot 208 2021, antes Volkswagen Gol 2015");
  assert.equal(consulta.atendido_at, null);
  assert.deepEqual(consulta.orden_at, ahora);
});

test("el cliente vuelve a los 31 días a una consulta atendida: no se le toca el aviso y se abre una consulta nueva", async () => {
  const vencida = consultaAtendida({ ultimo_mensaje: haceDias(31) });
  const root = baseFalsa({ cliente: { id: 50 }, sesion: vencida, autos: [autoPeugeot] });
  await atenderMensaje({ telefono: TEL, texto: "Hola, ¿sigue el auto?", ahora }, deps(root));
  assert.equal(root.estado.sesiones.length, 2, "se abre una consulta nueva");
  assert.deepEqual(root.estado.updates.filter((u) => u.where.id === 1), [], "la consulta vencida no se toca");
  assert.equal(root.estado.sesiones[0].atendido_at.getTime(), vencida.atendido_at.getTime());
});

// Los caminos que cortan el turno antes del agente también avisan: el aviso va apenas se conoce la consulta.

test("la BAJA a los recordatorios de cuotas de una consulta atendida la vuelve a pendiente con el aviso, y la baja se hace igual sin IA", async () => {
  const root = conUpdatesQueGuardan(baseFalsa({ cliente: { id: 50 }, sesion: consultaAtendida({ ultimo_mensaje: hace(2) }), aviso: recordatorio }));
  const anthropic = claudeFalso();
  const r = await atenderMensaje({ telefono: TEL, texto: "BAJA", ahora }, deps(root, anthropic));
  assert.ok(root.estado.updates.some(esElAviso), "hay un update con el aviso completo");
  quedoConElAviso(root);
  assert.equal(anthropic.pedidos.length, 0);
  assert.equal(r.conIA, false);
  assert.match(r.texto, /no vas a recibir más recordatorios de cuotas/);
  assert.deepEqual(root.estado.bajas[0].where.id, { in: [12] });
});

test("el mensaje fijo por falta de cupo a una consulta atendida también la vuelve a pendiente con el aviso, sin IA", async () => {
  const root = conUpdatesQueGuardan(baseFalsa({ cliente: { id: 50 }, sesion: consultaAtendida({ ultimo_mensaje: hace(2) }), gastoMes: 10 }));
  const anthropic = claudeFalso();
  const r = await atenderMensaje({ telefono: TEL, texto: "Hola", ahora }, deps(root, anthropic));
  assert.ok(root.estado.updates.some(esElAviso), "hay un update con el aviso completo");
  quedoConElAviso(root);
  assert.equal(r.conIA, false);
  assert.equal(r.texto, MENSAJES_FIJOS.sinCupo);
  assert.equal(anthropic.pedidos.length, 0);
});

test("la despedida 👍 a una consulta atendida también la vuelve a pendiente con el aviso, y se responde con la reacción sin IA", async () => {
  const root = conUpdatesQueGuardan(baseFalsa({ cliente: { id: 50 }, sesion: consultaAtendida({ ultimo_mensaje: hace(2), visita_propuesta: "sábado a la mañana" }) }));
  const anthropic = claudeFalso();
  const r = await atenderMensaje({ telefono: TEL, wamid: "wamid.CHAU", texto: "dale, gracias!", ahora }, deps(root, anthropic));
  assert.ok(root.estado.updates.some(esElAviso), "hay un update con el aviso completo");
  quedoConElAviso(root);
  assert.deepEqual(r.envios, [{ type: "reaction", reaction: { message_id: "wamid.CHAU", emoji: "👍" } }]);
  assert.equal(anthropic.pedidos.length, 0);
});

test("la nota de voz a una consulta atendida también la vuelve a pendiente con el aviso, y el agente responde al texto transcripto", async () => {
  const root = conUpdatesQueGuardan(baseFalsa({ cliente: { id: 50 }, sesion: consultaAtendida({ ultimo_mensaje: hace(2) }) }));
  const anthropic = claudeFalso("¡Sí! Tenemos varias.");
  const groq = groqFalso("Hola, ¿tienen camionetas?", 5);
  const r = await atenderMensaje({ telefono: TEL, audio: audio(5), ahora }, deps(root, anthropic, groq));
  assert.ok(root.estado.updates.some(esElAviso), "hay un update con el aviso completo");
  quedoConElAviso(root);
  assert.equal(r.texto, "¡Sí! Tenemos varias.");
  assert.equal(groq.llamadas.length, 1);
});

// ── Preguntas del recorrido que el cliente no contestó ──

const consultaFinanciando = { id: 1, cliente_id: 50, sesion_inicio: haceDias(1), ultimo_mensaje: haceDias(0), auto_id: 5, pago_tipo: "financiado", anticipo: "5 millones", entrega_usado: null, decisor: null };
const charlaDeRecibo = (...saliente) => [
  mensajeDe(1, "saliente", saliente[0], haceDias(0.5)),
  mensajeDe(2, "entrante", "y ese de que año es?", haceDias(0.4)),
  mensajeDe(3, "saliente", saliente[1], haceDias(0.3)),
  mensajeDe(4, "entrante", "tiene gnc?", haceDias(0.2)),
];

test("si el último mensaje de la asesora preguntó por el recibo y sigue pendiente, el contexto lo dice", async () => {
  const root = baseFalsa({
    cliente: { id: 50 },
    sesion: consultaFinanciando,
    historial: charlaDeRecibo("Es del 2019. ¿Tenés recibo de sueldo o garante?", "Es nafta. ¿Y tenés recibo de sueldo o garante?"),
  });
  const anthropic = claudeFalso();
  await atenderMensaje({ telefono: TEL, texto: "y ese tiene aire?", ahora }, deps(root, anthropic));
  const contexto = anthropic.pedidos[0].system.at(-1).text;
  assert.match(contexto, /Tu último mensaje ya preguntó por recibo o garante/);
});

test("si el cliente contestó la última pregunta de la asesora, el contexto no agrega la línea de pregunta sin contestar", async () => {
  const root = baseFalsa({
    cliente: { id: 50 },
    sesion: { ...consultaFinanciando, credito_ok: 1 },
    historial: charlaDeRecibo("Es del 2019. ¿Tenés recibo de sueldo o garante?", "Es nafta. ¿Y tenés recibo de sueldo o garante?"),
  });
  const anthropic = claudeFalso();
  await atenderMensaje({ telefono: TEL, texto: "si tengo recibo", ahora }, deps(root, anthropic));
  assert.doesNotMatch(anthropic.pedidos[0].system.at(-1).text, /Tu último mensaje ya preguntó/);
});

test("una pregunta hecha en un mensaje anterior al último no cuenta como sin contestar", async () => {
  const root = baseFalsa({
    cliente: { id: 50 },
    sesion: consultaFinanciando,
    historial: charlaDeRecibo("Es del 2019. ¿Tenés recibo de sueldo o garante?", "Es nafta. Te lo muestro cuando vengas."),
  });
  const anthropic = claudeFalso();
  await atenderMensaje({ telefono: TEL, texto: "y ese tiene aire?", ahora }, deps(root, anthropic));
  assert.doesNotMatch(anthropic.pedidos[0].system.at(-1).text, /Tu último mensaje ya preguntó/);
});

// ── El bot se acuerda de lo que hizo ──

// Claude guionado: devuelve en orden lo que se le pasa (cada uno, una respuesta completa).
function claudeGuionado(...respuestas) {
  const pedidos = [];
  let i = 0;
  return { pedidos, messages: { create: async (p) => (pedidos.push(p), respuestas[Math.min(i++, respuestas.length - 1)]) } };
}
const usoFalso = { input_tokens: 100, output_tokens: 20 };
const pideFotos = (ref) => ({ stop_reason: "tool_use", usage: usoFalso, content: [{ type: "tool_use", id: "t1", name: "enviar_fotos_auto", input: { ref } }] });
const respondeTexto = (t) => ({ stop_reason: "end_turn", usage: usoFalso, content: [{ type: "text", text: t }] });
const dbDelAgenteConFotos = (fotos) => ({ autos: { findFirst: async ({ where }) => (where.ref ? { id: 1, fotos_json: fotos } : null) } });

test("una respuesta con fotos se guarda con el código del auto de las fotos (fotos_ref)", async () => {
  const root = baseFalsa({ cliente: { id: 50 } });
  const anthropic = claudeGuionado(pideFotos("65"), respondeTexto("Te paso las fotos 👇"));
  await atenderMensaje({ telefono: TEL, texto: "pasame fotos", ahora }, { ...deps(root, anthropic), dbAgente: dbDelAgenteConFotos(["/a.jpg"]) });
  const saliente = root.estado.historial.find((h) => h.direccion === "saliente");
  assert.equal(saliente.fotos_ref, "65");
});

test("si la herramienta no devolvió fotos, el mensaje se guarda sin fotos_ref", async () => {
  const root = baseFalsa({ cliente: { id: 50 } });
  const anthropic = claudeGuionado(pideFotos("65"), respondeTexto("Ese auto no tiene fotos."));
  await atenderMensaje({ telefono: TEL, texto: "pasame fotos", ahora }, { ...deps(root, anthropic), dbAgente: dbDelAgenteConFotos([]) });
  const saliente = root.estado.historial.find((h) => h.direccion === "saliente");
  assert.equal("fotos_ref" in saliente, false);
});

const haceHoras = (horas) => new Date(ahora.getTime() - horas * 3_600_000);
const consultaConCharla = { id: 1, cliente_id: 50, sesion_inicio: haceHoras(80), ultimo_mensaje: haceHoras(1), auto_id: 5 };
const gol = { id: 8, ref: "65", marca: "Volkswagen", modelo: "Gol Trend", anio: 2019, disponible: true };

test("el contexto dice de qué autos ya se mandaron fotos en la consulta, y cuándo", async () => {
  const root = baseFalsa({
    cliente: { id: 50 },
    sesion: consultaConCharla,
    autos: [peugeot, gol],
    historial: [
      { ...mensajeDe(1, "entrante", "pasame fotos del gol", haceHoras(2)) },
      { ...mensajeDe(2, "saliente", "Te paso las fotos 👇", haceHoras(1.9)), fotos_ref: "65" },
    ],
  });
  const anthropic = claudeFalso();
  await atenderMensaje({ telefono: TEL, texto: "y de que año es?", ahora }, deps(root, anthropic));
  const contexto = anthropic.pedidos[0].system.at(-1).text;
  assert.match(contexto, /Fotos que ya le mandaste en esta charla: Volkswagen Gol Trend 2019 \(hoy 10:06\)\. No digas que no las mandaste ni las vuelvas a mandar si no te las pide\./);
});

test("sin mensajes con fotos, el contexto no habla de fotos enviadas", async () => {
  const root = baseFalsa({ cliente: { id: 50 }, sesion: consultaConCharla, historial: [mensajeDe(1, "saliente", "Hola", haceHoras(2))] });
  const anthropic = claudeFalso();
  await atenderMensaje({ telefono: TEL, texto: "hola", ahora }, deps(root, anthropic));
  assert.doesNotMatch(anthropic.pedidos[0].system.at(-1).text, /Fotos que ya le mandaste/);
});

test("si pasaron cuatro días desde el mensaje anterior, el contexto lo dice y la visita propuesta lleva el día en que se dijo", async () => {
  const miercoles = new Date("2026-10-07T13:00:00Z"); // miércoles 07/10, 10:00 en Argentina
  const root = baseFalsa({
    cliente: { id: 50 },
    sesion: { ...consultaConCharla, sesion_inicio: miercoles, pago_tipo: "contado", visita_propuesta: "mañana a la mañana", visita_propuesta_at: miercoles },
    historial: [mensajeDe(1, "entrante", "mañana a la mañana", miercoles), mensajeDe(2, "saliente", "Te esperamos", new Date(miercoles.getTime() + 1))],
  });
  const anthropic = claudeFalso();
  await atenderMensaje({ telefono: TEL, texto: "hola, al final no pude ir", ahora }, deps(root, anthropic));
  const contexto = anthropic.pedidos[0].system.at(-1).text;
  assert.match(contexto, /El mensaje anterior de esta charla fue hace 4 días \(el miércoles 07\/10\)\. Lo que se dijo entonces con "hoy" o "mañana" se refiere a ese día\./);
  assert.match(contexto, /visita propuesta: "mañana a la mañana" \(lo dijo el miércoles 07\/10\)/);
});

test("si el mensaje anterior es de hace unos minutos, el contexto no agrega la línea del tiempo que pasó", async () => {
  const root = baseFalsa({
    cliente: { id: 50 },
    sesion: consultaConCharla,
    historial: [mensajeDe(1, "entrante", "hola", new Date(ahora.getTime() - 300_000)), mensajeDe(2, "saliente", "¡Hola!", new Date(ahora.getTime() - 299_000))],
  });
  const anthropic = claudeFalso();
  await atenderMensaje({ telefono: TEL, texto: "y el precio?", ahora }, deps(root, anthropic));
  assert.doesNotMatch(anthropic.pedidos[0].system.at(-1).text, /El mensaje anterior de esta charla/);
});

test("el estado de la verificación entra en lo que falta: el permiso va después del recibo y antes del usado", async () => {
  const root = baseFalsa({
    cliente: { id: 50 },
    sesion: { ...consultaConCharla, pago_tipo: "financiado", anticipo: "4 millones", credito_ok: 1 },
    historial: [mensajeDe(1, "saliente", "Hola", haceHoras(1))],
  });
  root.terminos_versiones = { findFirst: async () => ({ id: 3 }) };
  root.consentimientos = { findFirst: async () => null };
  root.consultas_crediticias = { findFirst: async () => null };
  const anthropic = claudeFalso();
  process.env.PUBLIC_WEB_URL = "https://agencia.com";
  try {
    await atenderMensaje({ telefono: TEL, texto: "si tengo recibo", ahora }, deps(root, anthropic));
  } finally {
    delete process.env.PUBLIC_WEB_URL;
  }
  const faltan = anthropic.pedidos[0].system.at(-1).text.match(/Falta averiguar[^\n]*/)?.[0] ?? "";
  assert.match(faltan, /1\) permiso para consultar su situación en el BCRA.*2\) si entrega un usado/);
});

test("en lo que falta, la pregunta del último mensaje de la asesora llega marcada para no repetirla", async () => {
  const root = baseFalsa({
    cliente: { id: 50 },
    sesion: consultaFinanciando,
    historial: charlaDeRecibo("Es del 2019. ¿Tenés recibo de sueldo o garante?", "Es nafta. ¿Y tenés recibo de sueldo o garante?"),
  });
  const anthropic = claudeFalso();
  await atenderMensaje({ telefono: TEL, texto: "y ese tiene aire?", ahora }, deps(root, anthropic));
  const faltan = anthropic.pedidos[0].system.at(-1).text.match(/Falta averiguar[^\n]*/)?.[0] ?? "";
  assert.match(faltan, /1\) recibo o garante \(ya la preguntaste en tu último mensaje: no la repitas ahora\); 2\) si entrega un usado/);
});
