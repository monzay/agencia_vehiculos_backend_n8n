import { test } from "node:test";
import assert from "node:assert/strict";
import { marcarFriasLasAbandonadas, HORAS_SIN_RESPUESTA } from "./abandonadas.js";

const ahora = new Date("2026-10-15T15:00:00Z");

function baseFalsa(cantidad = 3) {
  const pedidos = [];
  return { pedidos, chat_estado: { updateMany: async (args) => (pedidos.push(args), { count: cantidad }) } };
}

test("a las 24 horas sin respuesta la consulta pasa a fría", async () => {
  assert.equal(HORAS_SIN_RESPUESTA, 24);
  const db = baseFalsa();
  const marcadas = await marcarFriasLasAbandonadas({ db, ahora });
  assert.equal(marcadas, 3);
  const { where, data } = db.pedidos[0];
  assert.deepEqual(data, { clasificacion: "FRIO" });
  assert.deepEqual(where.ultimo_mensaje, { lt: new Date("2026-10-14T15:00:00Z") });
});

test("no toca las que cerraron (visita, 'no sabe' o derivadas) ni las que ya son frías", async () => {
  const db = baseFalsa();
  await marcarFriasLasAbandonadas({ db, ahora });
  const { where } = db.pedidos[0];
  assert.equal(where.visita_propuesta, null);
  assert.equal(where.disponibilidad, null);
  assert.deepEqual(where.NOT, { requiere_vendedor: true });
});

test("las calientes y tibias conservan su calificación: solo pasan a fría las que seguían sin clasificar", async () => {
  const db = baseFalsa();
  await marcarFriasLasAbandonadas({ db, ahora });
  const { where } = db.pedidos[0];
  assert.ok(where.AND.some((c) => c.clasificacion === null), "solo las 'en calificación'");
  assert.doesNotMatch(JSON.stringify(where), /CALIENTE|TIBIO/);
});

test("un saludo suelto sigue como consulta general (solo marca las que arrancaron el recorrido)", async () => {
  const db = baseFalsa();
  await marcarFriasLasAbandonadas({ db, ahora });
  assert.ok(JSON.stringify(db.pedidos[0].where.AND).includes("auto_id"), "usa el filtro de consultas útiles");
});
