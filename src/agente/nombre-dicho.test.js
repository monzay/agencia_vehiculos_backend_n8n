import { test } from "node:test";
import assert from "node:assert/strict";
import { guardarNombreDicho } from "./nombre-dicho.js";

// ajustes-por-chats-reales: el nombre lo dice el cliente. La escritura corre con el usuario del
// backend (el del agente no tiene UPDATE sobre `nombre_declarado` ni sobre `clientes`).

// Base simulada: una consulta y una ficha; anota cada escritura.
function baseFalsa({ consulta = {}, ficha = {} } = {}) {
  const e = { consulta: { id: 900, cliente_id: 50, nombre_declarado: null, ...consulta }, ficha: { id: 50, nombre: null, ...ficha }, escrituras: [] };
  const leer = (fila) => async () => ({ ...fila });
  return {
    estado: e,
    chat_estado: {
      findUnique: leer(e.consulta),
      findFirst: leer(e.consulta),
      update: async (args) => (e.escrituras.push({ modelo: "chat_estado", ...args }), Object.assign(e.consulta, args.data)),
    },
    clientes: {
      findUnique: leer(e.ficha),
      findFirst: leer(e.ficha),
      update: async (args) => (e.escrituras.push({ modelo: "clientes", ...args }), Object.assign(e.ficha, args.data)),
    },
  };
}
const ctx = (db) => ({ db, clienteId: 50, sesionId: 900 });
const escritasEn = (db, modelo) => db.estado.escrituras.filter((w) => w.modelo === modelo);

test("guarda el nombre dicho en la consulta (nombre_declarado) y, si la ficha no tiene nombre, también en la ficha", async () => {
  const db = baseFalsa();
  await guardarNombreDicho(ctx(db), "Claudia Espinosa");
  const [consulta] = escritasEn(db, "chat_estado");
  assert.equal(consulta.where.id, 900);
  assert.equal(consulta.data.nombre_declarado, "Claudia Espinosa");
  const [ficha] = escritasEn(db, "clientes");
  assert.equal(ficha.where.id, 50);
  assert.equal(ficha.data.nombre, "Claudia Espinosa");
});

test("una ficha con el nombre en blanco cuenta como vacía", async () => {
  const db = baseFalsa({ ficha: { nombre: "   " } });
  await guardarNombreDicho(ctx(db), "Claudia");
  assert.equal(escritasEn(db, "clientes")[0].data.nombre, "Claudia");
});

test("si el cliente se corrige ('Clara' → 'Claudia') y la ficha se había completado con 'Clara', se actualizan la consulta y la ficha", async () => {
  const db = baseFalsa({ consulta: { nombre_declarado: "Clara" }, ficha: { nombre: "Clara" } });
  await guardarNombreDicho(ctx(db), "Claudia");
  assert.equal(escritasEn(db, "chat_estado")[0].data.nombre_declarado, "Claudia");
  assert.equal(escritasEn(db, "clientes")[0].data.nombre, "Claudia");
});

test("si la ficha tiene otro nombre ('Alvaro', del perfil de antes), la consulta guarda 'Claudia' y la ficha no se toca", async () => {
  const db = baseFalsa({ ficha: { nombre: "Alvaro" } });
  await guardarNombreDicho(ctx(db), "Claudia");
  assert.equal(escritasEn(db, "chat_estado")[0].data.nombre_declarado, "Claudia");
  assert.deepEqual(escritasEn(db, "clientes"), [], "no pisa el nombre de la ficha");
  assert.equal(db.estado.ficha.nombre, "Alvaro");
});

test("si la ficha tiene otro nombre distinto del que dijo antes en la consulta, tampoco se toca al corregirse", async () => {
  const db = baseFalsa({ consulta: { nombre_declarado: "Clara" }, ficha: { nombre: "Alvaro" } });
  await guardarNombreDicho(ctx(db), "Claudia");
  assert.equal(db.estado.consulta.nombre_declarado, "Claudia");
  assert.deepEqual(escritasEn(db, "clientes"), []);
});

test("si dice otra vez el mismo nombre, no rompe: la consulta queda igual y la ficha también", async () => {
  const db = baseFalsa({ consulta: { nombre_declarado: "Claudia" }, ficha: { nombre: "Claudia" } });
  await guardarNombreDicho(ctx(db), "Claudia");
  assert.equal(db.estado.consulta.nombre_declarado, "Claudia");
  assert.equal(db.estado.ficha.nombre, "Claudia");
});

test("solo escribe en la consulta y en la ficha de este cliente", async () => {
  const db = baseFalsa();
  await guardarNombreDicho({ db, clienteId: 50, sesionId: 900 }, "Claudia");
  for (const w of db.estado.escrituras) assert.ok(w.where.id === 900 || w.where.id === 50, JSON.stringify(w.where));
  assert.deepEqual(db.estado.escrituras.map((w) => [w.modelo, w.where.id]).sort(), [["chat_estado", 900], ["clientes", 50]]);
});

test("un nombre vacío no escribe nada", async () => {
  const db = baseFalsa();
  await guardarNombreDicho(ctx(db), "");
  await guardarNombreDicho(ctx(db), null);
  assert.deepEqual(db.estado.escrituras, []);
});
