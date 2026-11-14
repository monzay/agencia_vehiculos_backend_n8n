import { test } from "node:test";
import assert from "node:assert/strict";
import { cambiarAuto } from "./consultas-por-auto.js";

// Base simulada con las consultas (`chat_estado`) y los autos en memoria. Las tablas que
// no están (usado, trámites, señas) revientan si se tocan, salvo las que se piden en `espiadas`,
// que registran el acceso.
function baseFalsa({ sesiones = [], autos = [], espiadas = [], ingresos = [], senas = [] } = {}) {
  const e = { sesiones: sesiones.map((s) => ({ ...s })), creadas: [], updates: [], otras: [], ingresos, senas, escriturasAjenas: [] };
  const db = {
    estado: e,
    chat_estado: {
      findUnique: async ({ where }) => e.sesiones.find((s) => s.id === where.id) ?? null,
      create: async ({ data }) => (e.creadas.push(data), { id: 999, ...data }),
      update: async ({ where, data }) => (e.updates.push({ where, data }), { id: where.id, ...data }),
    },
    autos: { findFirst: async ({ where }) => autos.find((a) => a.id === where.id) ?? null },
  };
  // Trámites (consignacion_ingresos) y señas: se pueden leer, pero cualquier escritura se registra.
  const tabla = (filas) =>
    new Proxy({}, {
      get: (_, metodo) => async (args) => {
        if (/^(create|update|delete|upsert)/.test(metodo)) e.escriturasAjenas.push({ metodo, args });
        return /^find/.test(metodo) ? filas : null;
      },
    });
  db.consignacion_ingresos = tabla(ingresos);
  db.senas = tabla(senas);
  for (const tabla of espiadas) {
    db[tabla] = new Proxy({}, { get: (_, metodo) => async (args) => (e.otras.push({ tabla, metodo, args }), null) });
  }
  return db;
}

const ahora = new Date("2026-11-14T15:00:00Z");
const antes = new Date("2026-11-10T12:00:00Z");

const gol = { id: 5, ref: "G5", marca: "Volkswagen", modelo: "Gol", anio: 2015 };
const peugeot = { id: 7, ref: "A12B", marca: "Peugeot", modelo: "208", anio: 2021 };
const AUTOS = [gol, peugeot];

const consultaDelGol = (datos = {}) => ({
  id: 900, cliente_id: 50, auto_id: 5, origen: "web", vendedor_id: 3, atribuido: true, ultimo_mensaje: antes,
  pago_tipo: "contado", anticipo: null, credito_ok: null, entrega_usado: 1, decisor: "solo", decisor_con: null, disponibilidad: "esta_semana",
  visita_propuesta: "sábado a la mañana", requiere_vendedor: false, requiere_vendedor_motivo: null,
  score: 2, clasificacion: "FRIO", atendido_at: null, atendido_por: null, orden_at: antes,
  ...datos,
});

const cambio = async (consulta, autoId = 7, extra = {}) => {
  const db = baseFalsa({ sesiones: [consulta], autos: AUTOS, ...extra });
  const id = await cambiarAuto({ db, sesionId: consulta.id, ahora }, autoId);
  return { db, id };
};

test("otro auto: sigue en la misma consulta y un solo update trae el auto nuevo, la temperatura, el aviso y el orden", async () => {
  const { db, id } = await cambio(consultaDelGol({ atendido_at: antes, atendido_por: 3 }));

  assert.equal(id, 900, "devuelve el mismo sesionId");
  assert.deepEqual(db.estado.creadas, [], "no abre otra consulta");
  assert.equal(db.estado.updates.length, 1, "todo en un solo update");
  const [{ where, data }] = db.estado.updates;
  assert.equal(where.id, 900);
  assert.deepEqual(data, {
    auto_id: 7,
    score: 11,
    clasificacion: "CALIENTE",
    requiere_vendedor: true,
    requiere_vendedor_motivo: "Ahora le interesa Peugeot 208 2021, antes Volkswagen Gol 2015",
    requiere_vendedor_at: ahora,
    atendido_at: null,
    atendido_por: null,
    orden_at: ahora,
  });
});

test("el motivo del aviso se recorta a 120 caracteres", async () => {
  const largo = { id: 7, ref: "L7", marca: "Marca", modelo: "M".repeat(200), anio: 2020 };
  const db = baseFalsa({ sesiones: [consultaDelGol()], autos: [gol, largo] });

  await cambiarAuto({ db, sesionId: 900, ahora }, 7);

  const { requiere_vendedor_motivo } = db.estado.updates[0].data;
  assert.equal(requiere_vendedor_motivo.length, 120);
  assert.ok(requiere_vendedor_motivo.startsWith("Ahora le interesa Marca MMM"));
});

test("el aviso se pone aunque la consulta ya estuviera marcada por otro motivo, y lo pisa", async () => {
  const marcada = consultaDelGol({ requiere_vendedor: true, requiere_vendedor_motivo: "Quiere reservar", requiere_vendedor_at: antes });
  const { db } = await cambio(marcada);
  const { data } = db.estado.updates[0];
  assert.equal(data.requiere_vendedor, true);
  assert.equal(data.requiere_vendedor_motivo, "Ahora le interesa Peugeot 208 2021, antes Volkswagen Gol 2015");
  assert.deepEqual(data.requiere_vendedor_at, ahora);
});

test("si estaba atendida, vuelve a pendiente: atendido_at y atendido_por quedan en null", async () => {
  const { db } = await cambio(consultaDelGol({ atendido_at: antes, atendido_por: 3 }));
  const { data } = db.estado.updates[0];
  assert.equal(data.atendido_at, null);
  assert.equal(data.atendido_por, null);
});

test("sube en la lista: orden_at es el momento del cambio", async () => {
  const { db } = await cambio(consultaDelGol());
  assert.deepEqual(db.estado.updates[0].data.orden_at, ahora);
});

test("recalcula la temperatura con el auto nuevo y las respuestas de siempre", async () => {
  // Guardada como FRIO con 2 puntos; con auto (2) + contado (3) + entrega usado (1) + decide solo (2) + esta semana (3) son 11.
  const { db } = await cambio(consultaDelGol({ score: 2, clasificacion: "FRIO" }));
  const { data } = db.estado.updates[0];
  assert.equal(data.score, 11);
  assert.equal(data.clasificacion, "CALIENTE");
});

test("el mismo auto no escribe nada", async () => {
  const { db, id } = await cambio(consultaDelGol(), 5);
  assert.equal(id, 900);
  assert.deepEqual(db.estado.updates, []);
  assert.deepEqual(db.estado.creadas, []);
});

test("una consulta sin auto recibe el auto y la temperatura, sin aviso", async () => {
  const sinAuto = consultaDelGol({ auto_id: null, pago_tipo: null, entrega_usado: null, decisor: null, disponibilidad: null, score: 0 });
  const { db, id } = await cambio(sinAuto);

  assert.equal(id, 900);
  assert.equal(db.estado.updates.length, 1);
  const { where, data } = db.estado.updates[0];
  assert.equal(where.id, 900);
  assert.deepEqual(data, { auto_id: 7, score: 2, clasificacion: "FRIO" });
  for (const campo of ["requiere_vendedor", "requiere_vendedor_motivo", "requiere_vendedor_at", "atendido_at", "atendido_por", "orden_at"]) {
    assert.equal(campo in data, false, `no toca ${campo}`);
  }
});

test("no toca las respuestas, el usado, la visita ni el asesor", async () => {
  const { db } = await cambio(consultaDelGol(), 7, { espiadas: ["vehiculo_cliente"] });
  const { data } = db.estado.updates[0];
  for (const campo of ["pago_tipo", "anticipo", "credito_ok", "entrega_usado", "decisor", "decisor_con", "disponibilidad", "visita_propuesta", "visita_propuesta_at", "vendedor_id", "atribuido", "origen"]) {
    assert.equal(campo in data, false, `no toca ${campo}`);
  }
  assert.deepEqual(db.estado.otras, [], "el usado no se mira ni se copia");
});

test("dos cambios seguidos siguen siendo una sola consulta", async () => {
  const db = baseFalsa({ sesiones: [consultaDelGol()], autos: AUTOS });

  const primero = await cambiarAuto({ db, sesionId: 900, ahora }, 7);
  db.estado.sesiones[0].auto_id = 7; // como queda en la base tras el primer update
  const segundo = await cambiarAuto({ db, sesionId: 900, ahora }, 5);

  assert.deepEqual([primero, segundo], [900, 900]);
  assert.deepEqual(db.estado.creadas, [], "no hay ningún create");
  assert.deepEqual(db.estado.updates.map((u) => [u.where.id, u.data.auto_id]), [[900, 7], [900, 5]]);
  assert.equal(db.estado.updates[1].data.requiere_vendedor_motivo, "Ahora le interesa Volkswagen Gol 2015, antes Peugeot 208 2021");
});

test("con un trámite o una seña vigente sigue en la misma consulta y no los toca", async () => {
  const tramite = { id: 31, cliente_id: 50, sesion_id: 900, auto_interes_id: 5, estado: "recepcion", estado_at: antes, deleted_at: null };
  const sena = { id: 41, cliente_id: 50, auto_id: 5, sesion_id: 900, estado: "vigente", vence: new Date("2026-11-20"), ingreso_id: null, deleted_at: null };
  const antesTramite = structuredClone(tramite);
  const antesSena = structuredClone(sena);
  const { db, id } = await cambio(consultaDelGol(), 7, { ingresos: [tramite], senas: [sena] });

  assert.equal(id, 900);
  assert.deepEqual(db.estado.creadas, []);
  assert.deepEqual(db.estado.escriturasAjenas, [], "ningún create/update/delete sobre trámites ni señas");
  assert.deepEqual(db.estado.ingresos, [antesTramite], "el trámite sigue idéntico");
  assert.deepEqual(db.estado.senas, [antesSena], "la seña sigue idéntica");
  assert.equal(db.estado.updates.length, 1);
  assert.equal(db.estado.updates[0].where.id, 900);
  assert.equal(db.estado.updates[0].data.requiere_vendedor, true, "el asesor recibe el aviso");
});
