import { test } from "node:test";
import assert from "node:assert/strict";
import { consultasParaRecordar, textoDelRecordatorio, revisarRecordatorios, iniciarRecordatorios, sinSaludoInicial, TEXTO_FIJO } from "./recordatorio.js";

// Ningún test manda a WhatsApp ni arranca la revisión automática: base, Claude, envío y reloj son de mentira.

const MIN = 60_000;
const AHORA = new Date("2026-11-16T13:30:00Z");
const hace = (minutos) => new Date(AHORA.getTime() - minutos * MIN);
const TEL = "5493885550101";
const PREGUNTA = "¿Con cuánto de anticipo contás?";

// Base en memoria con lo que toca el recordatorio. La reserva (updateMany) es atómica como en MySQL.
function baseFalsa({ sesion = {}, historial = null, aviso = null, gastoMes = 0, sesiones = null } = {}) {
  const e = {
    sesiones: sesiones ?? [
      { id: 1, cliente_id: 50, sesion_inicio: hace(40), ultimo_mensaje: hace(10), auto_id: null, pago_tipo: "financiado", clasificacion: "TIBIO", score: 3, requiere_vendedor: false, bot_pausado: false, opt_out: false, recordatorio_en: null, visita_propuesta: null, disponibilidad: null, ...sesion },
    ],
    historial: historial ?? [
      { id: 1, cliente_id: 50, direccion: "entrante", mensaje: "Financiado", paso_nodo: "agente_ia", created_at: hace(11) },
      { id: 2, cliente_id: 50, direccion: "saliente", mensaje: PREGUNTA, paso_nodo: "agente_ia", created_at: hace(10) },
    ],
    consumos: [],
    reservas: [],
  };
  const sinPisar = (where) => {
    const limite = where.OR?.find((c) => c.recordatorio_en?.lt)?.recordatorio_en.lt;
    return (s) => s.recordatorio_en == null || (limite && s.recordatorio_en < limite);
  };
  const db = {
    estado: e,
    chat_estado: {
      findMany: async () => e.sesiones,
      findUnique: async ({ where }) => e.sesiones.find((s) => s.id === where.id) ?? null,
      updateMany: async ({ where, data }) => {
        const filas = e.sesiones.filter((s) => s.id === where.id && sinPisar(where)(s));
        for (const s of filas) Object.assign(s, data);
        e.reservas.push({ where, data, count: filas.length });
        return { count: filas.length };
      },
      update: async () => {
        throw new Error("el recordatorio no actualiza la consulta con update: solo reserva con updateMany");
      },
    },
    cliente_canales: { findFirst: async ({ where }) => ({ cliente_id: where.cliente_id, canal: "whatsapp", identificador: TEL }) },
    clientes: { findUnique: async ({ where }) => ({ id: where.id, nombre: "Cliente Prueba" }) },
    historial_mensajes: {
      findFirst: async ({ where }) => [...e.historial].filter((h) => h.cliente_id === where.cliente_id).sort((a, b) => b.id - a.id)[0] ?? null,
      findMany: async ({ where, take }) =>
        e.historial
          .filter((h) => h.cliente_id === where.cliente_id && (!where.created_at?.gte || h.created_at >= where.created_at.gte))
          .sort((a, b) => b.id - a.id)
          .slice(0, take ?? 100)
          .map(({ direccion, mensaje, paso_nodo, created_at, fotos_ref }) => ({ direccion, mensaje, paso_nodo, created_at, fotos_ref })),
      create: async ({ data }) => (e.historial.push({ id: Math.max(0, ...e.historial.map((h) => h.id)) + 1, ...data }), data),
    },
    financiacion_avisos: { findFirst: async () => aviso },
    vehiculo_cliente: { findFirst: async () => null },
    ubicacion: { findUnique: async () => ({ nombre: "Ortega Automotores", direccion: "C. 293", maps_url: null }) },
    autos: { findFirst: async () => null },
    ia_consumos: {
      aggregate: async () => ({ _sum: { costo_usd: gastoMes } }),
      create: async ({ data }) => (e.consumos.push(data), data),
    },
  };
  return db;
}

// Claude de mentira: una respuesta guionada (texto o error) y el registro de cada llamada.
function claudeFalso(respuesta = "¿Me contás con cuánto de anticipo contás?") {
  const llamadas = [];
  return {
    llamadas,
    messages: {
      create: async (params) => {
        llamadas.push(params);
        if (respuesta instanceof Error) throw respuesta;
        return { stop_reason: "end_turn", usage: { input_tokens: 100, output_tokens: 20 }, content: [{ type: "text", text: respuesta }] };
      },
    },
  };
}

// Envío de mentira: anota cada mensaje y devuelve un wamid.
function envioFalso({ falla = null } = {}) {
  const enviados = [];
  const enviar = async ({ telefono, texto }) => {
    enviados.push({ telefono, texto });
    if (falla) throw falla;
    return { wamid: "wamid.RECORDATORIO" };
  };
  return { enviados, enviar };
}

const revisar = (db, { anthropic = claudeFalso(), envio = envioFalso(), ahora = AHORA, minutos = 10 } = {}) =>
  revisarRecordatorios({ ahora, minutos, root: db, dbAgente: {}, anthropic, enviar: envio.enviar });

const sinRegistrarLogs = () => {
  const original = console.error;
  console.error = () => {};
  return () => (console.error = original);
};

// ── Cuándo corresponde el recordatorio ──

test("deja sin contestar una pregunta y a los 10 minutos el cliente recibe un recordatorio", async () => {
  const db = baseFalsa();
  const envio = envioFalso();
  const r = await revisar(db, { envio });
  assert.equal(envio.enviados.length, 1);
  assert.equal(envio.enviados[0].telefono, TEL);
  assert.deepEqual(r, [{ telefono: TEL, texto: envio.enviados[0].texto }]);
});

test("si todavía no pasaron 10 minutos (9), no sale nada", async () => {
  const db = baseFalsa({ historial: [{ id: 1, cliente_id: 50, direccion: "saliente", mensaje: PREGUNTA, paso_nodo: "agente_ia", created_at: hace(9) }], sesion: { ultimo_mensaje: hace(9) } });
  const envio = envioFalso();
  assert.deepEqual(await revisar(db, { envio }), []);
  assert.equal(envio.enviados.length, 0);
});

test("si el último mensaje de la asesora no pregunta ni pide nada, no sale nada", async () => {
  const db = baseFalsa({ historial: [{ id: 1, cliente_id: 50, direccion: "saliente", mensaje: "Perfecto, te esperamos el martes.", paso_nodo: "agente_ia", created_at: hace(12) }] });
  assert.deepEqual(await revisar(db), []);
});

test("si el cliente ya escribió después de la pregunta, no sale nada", async () => {
  const db = baseFalsa();
  db.estado.historial.push({ id: 3, cliente_id: 50, direccion: "entrante", mensaje: "tengo 4 millones", paso_nodo: "agente_ia", created_at: hace(5) });
  assert.deepEqual(await revisar(db), []);
});

test("justo a los 10 minutos el recordatorio corresponde", async () => {
  const db = baseFalsa();
  const candidatas = await consultasParaRecordar({ db, ahora: AHORA, minutos: 10 });
  assert.equal(candidatas.length, 1);
});

test("justo a los 60 minutos ya no corresponde", async () => {
  const db = baseFalsa({ historial: [{ id: 1, cliente_id: 50, direccion: "saliente", mensaje: PREGUNTA, paso_nodo: "agente_ia", created_at: hace(60) }], sesion: { ultimo_mensaje: hace(60) } });
  assert.deepEqual(await consultasParaRecordar({ db, ahora: AHORA, minutos: 10 }), []);
  const casiSesenta = baseFalsa({ historial: [{ id: 1, cliente_id: 50, direccion: "saliente", mensaje: PREGUNTA, paso_nodo: "agente_ia", created_at: new Date(hace(60).getTime() + 1000) }], sesion: { ultimo_mensaje: hace(59) } });
  assert.equal((await consultasParaRecordar({ db: casiSesenta, ahora: AHORA, minutos: 10 })).length, 1);
});

test("si el sistema estuvo apagado y pasó más de una hora, no sale nada aunque nunca se haya mandado un recordatorio", async () => {
  const db = baseFalsa({ historial: [{ id: 1, cliente_id: 50, direccion: "saliente", mensaje: PREGUNTA, paso_nodo: "agente_ia", created_at: hace(180) }], sesion: { ultimo_mensaje: hace(180), recordatorio_en: null } });
  assert.deepEqual(await revisar(db), []);
});

test("cada revisión atiende como mucho 20 consultas", async () => {
  const sesiones = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, cliente_id: 100 + i, sesion_inicio: hace(40), ultimo_mensaje: hace(10), bot_pausado: false, opt_out: false, requiere_vendedor: false, recordatorio_en: null }));
  const historial = sesiones.map((s, i) => ({ id: i + 1, cliente_id: s.cliente_id, direccion: "saliente", mensaje: PREGUNTA, paso_nodo: "agente_ia", created_at: hace(10) }));
  const db = baseFalsa({ sesiones, historial });
  assert.equal((await consultasParaRecordar({ db, ahora: AHORA, minutos: 10 })).length, 20);
});

// ── Consultas que no reciben recordatorio ──

test("con la visita ya acordada (o 'no sabe cuándo viene') no sale nada", async () => {
  for (const sesion of [{ visita_propuesta: "el martes a la tarde" }, { disponibilidad: "no_sabe" }]) {
    assert.deepEqual(await revisar(baseFalsa({ sesion })), []);
  }
});

test("una consulta derivada a un vendedor no recibe recordatorio", async () => {
  assert.deepEqual(await revisar(baseFalsa({ sesion: { requiere_vendedor: true } })), []);
});

test("una consulta tomada por un asesor (pausada, con baja, o con su mensaje como último) no recibe recordatorio", async () => {
  assert.deepEqual(await revisar(baseFalsa({ sesion: { bot_pausado: true } })), []);
  assert.deepEqual(await revisar(baseFalsa({ sesion: { opt_out: true } })), []);
  const delAsesor = baseFalsa({ historial: [{ id: 1, cliente_id: 50, direccion: "saliente", mensaje: "¿Te llamo mañana?", paso_nodo: "humano", created_at: hace(10) }] });
  assert.deepEqual(await revisar(delAsesor), []);
});

test("si la charla es por un recordatorio de cuota, no sale nada", async () => {
  const aviso = { avisoId: 9, financiacion_id: 3, numero: 4, financiaciones: { cantidad_cuotas: 12, precio_cuota: 100000 }, vencimiento: new Date("2026-11-18"), id: 9 };
  assert.deepEqual(await revisar(baseFalsa({ aviso })), []);
});

// ── Un recordatorio por consulta cada 24 horas ──

test("si el cliente no responde al recordatorio y pasan otros 30 minutos, no recibe un segundo mensaje", async () => {
  const db = baseFalsa();
  const envio = envioFalso();
  assert.equal((await revisar(db, { envio })).length, 1);
  const mas = new Date(AHORA.getTime() + 30 * MIN);
  assert.deepEqual(await revisar(db, { envio, ahora: mas }), []);
  assert.equal(envio.enviados.length, 1);
});

test("si respondió al recordatorio y vuelve a callar una hora después el mismo día, no recibe otro", async () => {
  const db = baseFalsa({ sesion: { recordatorio_en: hace(70) }, historial: [{ id: 1, cliente_id: 50, direccion: "saliente", mensaje: "¿Y tenés recibo de sueldo?", paso_nodo: "agente_ia", created_at: hace(10) }] });
  assert.deepEqual(await revisar(db), []);
  const pasoUnDia = baseFalsa({ sesion: { recordatorio_en: hace(25 * 60) } });
  assert.equal((await revisar(pasoUnDia)).length, 1, "pasadas 24 horas vuelve a corresponder");
});

// ── Qué dice el recordatorio ──

test("el recordatorio lo escribe la IA con las instrucciones de la asesora, retoma la última pregunta y sin herramientas", async () => {
  const db = baseFalsa();
  const anthropic = claudeFalso("¿Con cuánto de anticipo estás pensando? Así lo vamos armando 🙂");
  const envio = envioFalso();
  await revisar(db, { anthropic, envio });
  assert.equal(anthropic.llamadas.length, 1);
  const pedido = anthropic.llamadas[0];
  assert.equal(pedido.model, "claude-haiku-5-5");
  assert.ok(!pedido.tools || pedido.tool_choice?.type === "none", "sin herramientas");
  const sistema = pedido.system.map((b) => b.text).join("\n");
  assert.match(sistema, /Sos una asesora de ventas/);
  assert.match(sistema, /RECORDATORIO: el cliente no respondió tu último mensaje hace 10 minutos/);
  assert.match(sistema, /NO_CORRESPONDE/);
  assert.equal(pedido.messages.at(-1).role, "user", "la conversación termina con el cliente");
  assert.match(JSON.stringify(pedido.messages), /con cuánto de anticipo contás/i);
  assert.equal(envio.enviados[0].texto, "¿Con cuánto de anticipo estás pensando? Así lo vamos armando 🙂");
});

test("el costo de la IA del recordatorio se registra como cualquier otra llamada", async () => {
  const db = baseFalsa();
  await revisar(db);
  assert.equal(db.estado.consumos.length, 1);
  assert.equal(db.estado.consumos[0].proveedor, "claude");
  assert.equal(db.estado.consumos[0].cliente_id, 50);
});

// ── El cliente avisó que escribía después ──

test("si el cliente avisó que estaba en el trabajo, la IA responde NO_CORRESPONDE y no sale el recordatorio, pero la consulta queda marcada", async () => {
  const db = baseFalsa();
  db.estado.historial.splice(0, 1, { id: 1, cliente_id: 50, direccion: "entrante", mensaje: "ahora estoy en el trabajo, mas tarde te escribo", paso_nodo: "agente_ia", created_at: hace(11) });
  const envio = envioFalso();
  const r = await revisar(db, { anthropic: claudeFalso("NO_CORRESPONDE"), envio });
  assert.deepEqual(r, []);
  assert.equal(envio.enviados.length, 0);
  assert.deepEqual(db.estado.sesiones[0].recordatorio_en, AHORA, "queda marcada para no evaluarla cada minuto");
  assert.equal(db.estado.historial.length, 2, "no se guarda nada en la charla");
});

// ── Texto fijo si la IA no puede ──

test("si falla la llamada a Claude, sale el texto fijo", async () => {
  const restaurar = sinRegistrarLogs();
  try {
    const envio = envioFalso();
    await revisar(baseFalsa(), { anthropic: claudeFalso(new Error("overloaded")), envio });
    assert.equal(TEXTO_FIJO, "¿Seguís por ahí? Cuando puedas, contame y seguimos 🙂");
    assert.equal(envio.enviados[0].texto, TEXTO_FIJO);
  } finally {
    restaurar();
  }
});

test("si falla la IA y el último mensaje del cliente decía que escribía más tarde, no sale nada", async () => {
  const restaurar = sinRegistrarLogs();
  try {
    for (const aviso of ["más tarde te escribo", "después te aviso", "estoy ocupado", "estoy manejando", "ahora no puedo"]) {
      const db = baseFalsa();
      db.estado.historial.splice(0, 1, { id: 1, cliente_id: 50, direccion: "entrante", mensaje: aviso, paso_nodo: "agente_ia", created_at: hace(11) });
      const envio = envioFalso();
      await revisar(db, { anthropic: claudeFalso(new Error("caída")), envio });
      assert.equal(envio.enviados.length, 0, aviso);
    }
  } finally {
    restaurar();
  }
});

test("si falla la IA y el cliente se había despedido, no sale nada", async () => {
  const restaurar = sinRegistrarLogs();
  try {
    for (const despedida of ["chau", "Chau, gracias", "hasta mañana", "hasta luego", "nos vemos", "me despido", "saludos"]) {
      const db = baseFalsa();
      db.estado.historial.splice(0, 1, { id: 1, cliente_id: 50, direccion: "entrante", mensaje: despedida, paso_nodo: "agente_ia", created_at: hace(11) });
      const envio = envioFalso();
      await revisar(db, { anthropic: claudeFalso(new Error("caída")), envio });
      assert.equal(envio.enviados.length, 0, despedida);
    }
  } finally {
    restaurar();
  }
});

test("si el cliente tiene un mensaje esperando en la ráfaga, el recordatorio no sale", async () => {
  const db = baseFalsa();
  const envio = envioFalso();
  const anthropic = claudeFalso();
  const r = await revisarRecordatorios({ ahora: AHORA, minutos: 10, root: db, dbAgente: {}, anthropic, enviar: envio.enviar, hayMensajesEsperando: (tel) => tel === TEL });
  assert.deepEqual(r, []);
  assert.equal(envio.enviados.length, 0);
  assert.equal(anthropic.llamadas.length, 0);
});

test("la consulta de candidatas excluye en la base las cerradas (visita propuesta o no sabe) y no pierde la elegible", async () => {
  const db = baseFalsa();
  const wheres = [];
  // Base que respeta lo que pide el where: las cerradas quedan afuera antes del `take`.
  const elegible = db.estado.sesiones[0];
  const cerradas = Array.from({ length: 150 }, (_, i) => ({ ...elegible, id: 100 + i, cliente_id: 900 + i, visita_propuesta: i % 2 ? "martes 10hs" : null, disponibilidad: i % 2 ? null : "no_sabe", ultimo_mensaje: hace(11) }));
  const todas = [...cerradas, elegible];
  db.chat_estado.findMany = async ({ where, take }) => {
    wheres.push(where);
    const cumple = (s) => where.visita_propuesta === null ? s.visita_propuesta === null : true;
    const noCerrada = (s) => s.disponibilidad == null || s.disponibilidad !== "no_sabe";
    return todas.filter(cumple).filter(noCerrada).slice(0, take);
  };
  const candidatas = await consultasParaRecordar({ db, ahora: AHORA, minutos: 10 });
  assert.equal(candidatas.length, 1);
  assert.equal(candidatas[0].sesion.id, 1);
  assert.equal(wheres[0].visita_propuesta, null);
  assert.deepEqual(wheres[0].AND[1], { OR: [{ disponibilidad: null }, { disponibilidad: { not: "no_sabe" } }] });
});

test("si se alcanzó el tope de gasto del mes, sale el texto fijo sin llamar a Claude", async () => {
  const db = baseFalsa({ gastoMes: 999 });
  const anthropic = claudeFalso();
  const envio = envioFalso();
  await revisar(db, { anthropic, envio });
  assert.equal(anthropic.llamadas.length, 0);
  assert.equal(envio.enviados[0].texto, TEXTO_FIJO);
});

test("textoDelRecordatorio con el tope alcanzado y un aviso de demora del cliente no devuelve nada", async () => {
  const db = baseFalsa({ gastoMes: 999 });
  db.estado.historial[0].mensaje = "más tarde te escribo";
  const [candidato] = await consultasParaRecordar({ db, ahora: AHORA, minutos: 10 });
  assert.equal(await textoDelRecordatorio({ db, candidato, ahora: AHORA, minutos: 10, anthropic: claudeFalso() }), null);
});

// ── Cómo sale y qué queda guardado ──

test("con el envío aceptado sale un solo mensaje de texto al número del cliente", async () => {
  const envio = envioFalso();
  await revisar(baseFalsa(), { envio });
  assert.equal(envio.enviados.length, 1);
  assert.equal(envio.enviados[0].telefono, TEL);
});

test("si Meta rechaza el envío no queda un mensaje fantasma en la charla, no se reintenta y la consulta queda reservada", async () => {
  const restaurar = sinRegistrarLogs();
  try {
    const db = baseFalsa();
    const envio = envioFalso({ falla: Object.assign(new Error("WhatsApp respondió 400"), { status: 400 }) });
    const r = await revisar(db, { envio });
    assert.deepEqual(r, []);
    assert.equal(envio.enviados.length, 1, "un solo intento");
    assert.equal(db.estado.historial.length, 2, "nada guardado");
    assert.deepEqual(db.estado.sesiones[0].recordatorio_en, AHORA);
    await revisar(db, { envio, ahora: new Date(AHORA.getTime() + MIN) });
    assert.equal(envio.enviados.length, 1, "la reserva evita reintentar");
  } finally {
    restaurar();
  }
});

test("si el envío no responde a tiempo (timeout), no se reintenta y la consulta queda reservada", async () => {
  const restaurar = sinRegistrarLogs();
  try {
    const db = baseFalsa();
    const envio = envioFalso({ falla: Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" }) });
    await revisar(db, { envio });
    assert.equal(envio.enviados.length, 1);
    assert.deepEqual(db.estado.sesiones[0].recordatorio_en, AHORA);
    assert.equal(db.estado.historial.length, 2);
  } finally {
    restaurar();
  }
});

test("el recordatorio queda guardado en la charla como un mensaje de la asesora, con el wamid de Meta", async () => {
  const db = baseFalsa();
  await revisar(db, { anthropic: claudeFalso("¿Con cuánto de anticipo contás, más o menos?") });
  const guardado = db.estado.historial.at(-1);
  assert.equal(guardado.direccion, "saliente");
  assert.equal(guardado.paso_nodo, "agente_ia");
  assert.equal(guardado.mensaje, "¿Con cuánto de anticipo contás, más o menos?");
  assert.equal(guardado.wamid, "wamid.RECORDATORIO");
  assert.deepEqual(guardado.created_at, AHORA);
});

test("el recordatorio no cambia el último mensaje, la temperatura ni el aviso al vendedor de la consulta", async () => {
  const db = baseFalsa();
  const antes = { ...db.estado.sesiones[0] };
  await revisar(db);
  const despues = db.estado.sesiones[0];
  for (const campo of ["ultimo_mensaje", "clasificacion", "score", "requiere_vendedor", "atendido_at", "orden_at"]) assert.equal(despues[campo], antes[campo], campo);
  assert.deepEqual(despues.recordatorio_en, AHORA);
  assert.deepEqual(db.estado.reservas[0].data, { recordatorio_en: AHORA }, "la única escritura es la reserva");
});

// ── La consulta se reserva antes de enviar ──

test("dos revisiones a la vez sobre la misma consulta: solo una la reserva y sale un único recordatorio", async () => {
  const db = baseFalsa();
  const envio = envioFalso();
  const [a, b] = await Promise.all([revisar(db, { envio }), revisar(db, { envio })]);
  assert.equal(envio.enviados.length, 1);
  assert.equal(a.length + b.length, 1);
  assert.equal(db.estado.reservas.filter((r) => r.count === 1).length, 1);
});

test("si la reserva no cambia ninguna fila, no se envía", async () => {
  const db = baseFalsa();
  db.chat_estado.updateMany = async () => ({ count: 0 });
  const envio = envioFalso();
  assert.deepEqual(await revisar(db, { envio }), []);
  assert.equal(envio.enviados.length, 0);
});

// ── No pisa un mensaje nuevo ──

test("si el cliente escribe justo antes de enviar, el recordatorio no sale", async () => {
  const db = baseFalsa();
  const envio = envioFalso();
  const claude = claudeFalso();
  // El cliente escribe mientras Claude arma el texto: la comprobación de antes de enviar lo ve.
  const original = claude.messages.create;
  claude.messages.create = async (p) => {
    db.estado.historial.push({ id: 3, cliente_id: 50, direccion: "entrante", mensaje: "perdon, tengo 4 millones", paso_nodo: "agente_ia", created_at: hace(0) });
    return original(p);
  };
  assert.deepEqual(await revisar(db, { anthropic: claude, envio }), []);
  assert.equal(envio.enviados.length, 0);
});

// ── Revisión cada minuto y apagado ──

function intervaloFalso() {
  const registro = { funciones: [], desarmados: 0, unref: 0 };
  const setIntervalFn = (fn, ms) => {
    registro.funciones.push(fn);
    registro.ms = ms;
    return { unref: () => void (registro.unref += 1), id: registro.funciones.length };
  };
  return { registro, setIntervalFn, clearIntervalFn: () => void (registro.desarmados += 1) };
}
const ENV_OK = { WA_TOKEN: "t", WA_PHONE_NUMBER_ID: "1" };

test("con RECORDATORIO_MINUTOS en 0 queda apagado: no se revisa ni se manda nada", () => {
  const { registro, setIntervalFn } = intervaloFalso();
  const r = iniciarRecordatorios({ root: baseFalsa(), anthropic: claudeFalso(), enviar: envioFalso().enviar, env: { ...ENV_OK, RECORDATORIO_MINUTOS: "0" }, setIntervalFn, log: { warn() {} } });
  assert.equal(r, null);
  assert.equal(registro.funciones.length, 0);
});

test("sin WA_TOKEN o sin WA_PHONE_NUMBER_ID la revisión no arranca y avisa una vez en el log", () => {
  for (const env of [{ WA_PHONE_NUMBER_ID: "1" }, { WA_TOKEN: "t" }, {}]) {
    const { registro, setIntervalFn } = intervaloFalso();
    const avisos = [];
    const r = iniciarRecordatorios({ root: baseFalsa(), anthropic: claudeFalso(), env, setIntervalFn, log: { warn: (m) => avisos.push(m) } });
    assert.equal(r, null);
    assert.equal(registro.funciones.length, 0);
    assert.equal(avisos.length, 1);
    assert.match(avisos[0], /WA_TOKEN|WA_PHONE_NUMBER_ID/);
  }
});

test("con todo configurado revisa cada 60 segundos, con unref y los 10 minutos por defecto", async () => {
  const { registro, setIntervalFn } = intervaloFalso();
  const db = baseFalsa();
  const envio = envioFalso();
  const r = iniciarRecordatorios({ root: db, dbAgente: {}, anthropic: claudeFalso(), enviar: envio.enviar, env: ENV_OK, setIntervalFn, ahora: () => AHORA, log: { warn() {} } });
  assert.ok(r);
  assert.equal(registro.ms, 60_000);
  assert.equal(registro.unref, 1);
  await registro.funciones[0]();
  assert.equal(envio.enviados.length, 1, "la revisión usa los 10 minutos por defecto");
});

test("si una revisión no terminó cuando toca la siguiente, la siguiente se saltea", async () => {
  const { registro, setIntervalFn } = intervaloFalso();
  let revisiones = 0;
  let liberar;
  const lenta = new Promise((listo) => (liberar = listo));
  const db = baseFalsa();
  const original = db.chat_estado.findMany;
  db.chat_estado.findMany = async (...args) => {
    revisiones += 1;
    await lenta;
    return original(...args);
  };
  iniciarRecordatorios({ root: db, anthropic: claudeFalso(), enviar: envioFalso().enviar, env: ENV_OK, setIntervalFn, ahora: () => AHORA, log: { warn() {} } });
  const primera = registro.funciones[0]();
  await registro.funciones[0]();
  assert.equal(revisiones, 1, "la segunda no empezó");
  liberar();
  await primera;
  await registro.funciones[0]();
  assert.equal(revisiones, 2, "terminada la primera, la siguiente sí corre");
});

// ── Más corto y sin vueltas ──

test("la línea de sistema del recordatorio pide: sin hola, sin perdón, sin no hay apuro, sin explicar para qué sirve el dato, una oración", async () => {
  const anthropic = claudeFalso();
  await revisar(baseFalsa(), { anthropic });
  const sistema = anthropic.llamadas[0].system.map((b) => b.text).join("\n");
  assert.match(sistema, /sin "hola"/);
  assert.match(sistema, /sin "perdón por escribir de nuevo"/);
  assert.match(sistema, /sin "no hay apuro"/);
  assert.match(sistema, /sin explicar para qué sirve el dato/);
  assert.match(sistema, /una oración/);
});

test("sinSaludoInicial quita un saludo al empezar el recordatorio y deja el resto", () => {
  assert.equal(sinSaludoInicial("Hola, ¿con cuánto de anticipo contás?"), "¿Con cuánto de anticipo contás?");
  assert.equal(sinSaludoInicial("¡Hola de nuevo! ¿Me contás el anticipo?"), "¿Me contás el anticipo?");
  assert.equal(sinSaludoInicial("Buenas tardes, ¿seguís con lo del Prisma?"), "¿Seguís con lo del Prisma?");
  assert.equal(sinSaludoInicial("¿Con cuánto de anticipo contás?"), "¿Con cuánto de anticipo contás?");
  assert.equal(sinSaludoInicial("Hola"), "Hola", "si quedaría vacío, se deja");
  assert.equal(sinSaludoInicial("Holanda es lindo"), "Holanda es lindo", "solo la palabra entera");
});

test("el recordatorio que sale no empieza con un saludo aunque la IA lo escriba", async () => {
  const envio = envioFalso();
  await revisar(baseFalsa(), { anthropic: claudeFalso("Hola, ¿con cuánto de anticipo contás?"), envio });
  assert.equal(envio.enviados[0].texto, "¿Con cuánto de anticipo contás?");
});
