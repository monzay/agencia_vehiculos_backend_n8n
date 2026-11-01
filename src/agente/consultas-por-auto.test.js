import { test } from "node:test";
import assert from "node:assert/strict";
import { consultaPorAuto } from "./consultas-por-auto.js";

// Base simulada con las consultas (`chat_estado`) y los usados del cliente en memoria.
function baseFalsa({ sesiones = [], usados = [] } = {}) {
  const e = { sesiones: sesiones.map((s) => ({ ...s })), usados: [...usados], creadas: [], updates: [], usadosCreados: [] };
  return {
    estado: e,
    chat_estado: {
      findUnique: async ({ where }) => e.sesiones.find((s) => s.id === where.id) ?? null,
      findFirst: async ({ where }) =>
        e.sesiones
          .filter((s) => s.cliente_id === where.cliente_id && s.auto_id === where.auto_id && s.ultimo_mensaje >= where.ultimo_mensaje.gte)
          .sort((a, b) => b.id - a.id)[0] ?? null,
      create: async ({ data }) => {
        const nueva = { id: 900 + e.sesiones.length + 1, ...data };
        e.sesiones.push(nueva);
        e.creadas.push(nueva);
        return nueva;
      },
      update: async ({ where, data }) => (e.updates.push({ where, data }), { id: where.id, ...data }),
    },
    vehiculo_cliente: {
      findFirst: async ({ where }) => e.usados.find((u) => u.sesion_id === where.sesion_id && u.contexto === where.contexto && !u.deleted_at) ?? null,
      create: async ({ data }) => (e.usadosCreados.push(data), data),
    },
  };
}

const ahora = new Date("2026-10-31T15:00:00Z");
const hace = (horas) => new Date(ahora.getTime() - horas * 3_600_000);

const consultaDelGol = {
  id: 900, cliente_id: 50, auto_id: 5, origen: "web", vendedor_id: 3, atribuido: true, ultimo_mensaje: ahora,
  pago_tipo: "financiado", anticipo: "3 millones", cuotas: null, credito_ok: 1, entrega_usado: 1,
  decisor: "solo", decisor_con: null, disponibilidad: "esta_semana",
  visita_propuesta: "sábado a la mañana", requiere_vendedor: true, score: 10, clasificacion: "CALIENTE",
};
const usadoDelGol = { id: 1, sesion_id: 900, contexto: "trade_in", marca: "Volkswagen", modelo: "Gol", anio: 2015, kms: "90000", detalles: null, precio_pedido: "No sabe", deleted_at: null };

test("otro auto sin consulta: abre una nueva con las respuestas de la persona, el usado y el mismo asesor", async () => {
  const db = baseFalsa({ sesiones: [consultaDelGol], usados: [usadoDelGol] });

  const id = await consultaPorAuto({ db, clienteId: 50, sesionId: 900, ahora }, 7);

  const [nueva] = db.estado.creadas;
  assert.equal(id, nueva.id);
  assert.notEqual(id, 900);
  assert.equal(nueva.cliente_id, 50);
  assert.equal(nueva.auto_id, 7);
  assert.deepEqual(
    { origen: nueva.origen, vendedor_id: nueva.vendedor_id, atribuido: nueva.atribuido },
    { origen: "web", vendedor_id: 3, atribuido: true },
    "mismo asesor y mismo origen"
  );
  assert.deepEqual(
    [nueva.pago_tipo, nueva.anticipo, nueva.credito_ok, nueva.entrega_usado, nueva.decisor, nueva.disponibilidad],
    ["financiado", "3 millones", 1, 1, "solo", "esta_semana"],
    "copia las respuestas de la persona"
  );
  assert.equal(nueva.visita_propuesta, undefined, "la visita era por el otro auto");
  assert.equal(nueva.requiere_vendedor, undefined, "el aviso al vendedor era por el otro auto");
  assert.deepEqual(nueva.ultimo_mensaje, ahora);
  assert.equal(nueva.score, 10);
  assert.equal(nueva.clasificacion, "CALIENTE");

  const [usado] = db.estado.usadosCreados;
  assert.deepEqual(
    { ...usado },
    { sesion_id: id, contexto: "trade_in", marca: "Volkswagen", modelo: "Gol", anio: 2015, kms: "90000", detalles: null, precio_pedido: "No sabe" }
  );
  assert.deepEqual(db.estado.updates, [], "la consulta del Gol no se toca");
});

test("otro auto con consulta abierta: la retoma y le completa lo que faltaba de la persona", async () => {
  const delGol = { id: 900, cliente_id: 50, auto_id: 5, ultimo_mensaje: hace(2), pago_tipo: null, credito_ok: null, decisor: "consulta", disponibilidad: null };
  const delCronos = { id: 901, cliente_id: 50, auto_id: 7, ultimo_mensaje: ahora, pago_tipo: "contado", decisor: "solo", disponibilidad: "proximas" };
  const db = baseFalsa({ sesiones: [delGol, delCronos] });

  const id = await consultaPorAuto({ db, clienteId: 50, sesionId: 901, ahora }, 5);

  assert.equal(id, 900);
  assert.deepEqual(db.estado.creadas, [], "no abre otra");
  const [{ where, data }] = db.estado.updates;
  assert.equal(where.id, 900);
  assert.equal(data.pago_tipo, "contado");
  assert.equal(data.disponibilidad, "proximas");
  assert.equal("decisor" in data, false, "no pisa lo que ya había respondido en esa consulta");
  assert.equal(data.score, 5);
  assert.equal(data.clasificacion, "TIBIO");
});

test("una consulta de ese auto de hace más de 24 h no se retoma", async () => {
  const vieja = { id: 900, cliente_id: 50, auto_id: 7, ultimo_mensaje: hace(30) };
  const actual = { id: 901, cliente_id: 50, auto_id: 5, ultimo_mensaje: ahora };
  const db = baseFalsa({ sesiones: [vieja, actual] });

  const id = await consultaPorAuto({ db, clienteId: 50, sesionId: 901, ahora }, 7);

  assert.notEqual(id, 900);
  assert.equal(db.estado.creadas.length, 1);
});
