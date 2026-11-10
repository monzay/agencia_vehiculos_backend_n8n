import { test } from "node:test";
import assert from "node:assert/strict";
import { asesorDelLink, heredarAsesor, asesorPorTurno, asesorParaConsultaNueva } from "./reparto.js";
import { repartoFalso } from "./reparto-de-prueba.js";

const asesor = (id, datos = {}) => ({ id, nombre: `Asesor ${id}`, slug: `asesor-${id}`, activo: true, deleted_at: null, recibe_consultas: true, ...datos });
const PEPITO = asesor(1, { slug: "pepito" });
const JUAN = asesor(2, { slug: "juan" });
const JOSE = asesor(3, { slug: "jose" });
const EXCLUIDO = asesor(4, { slug: "excluido", recibe_consultas: false });
const INACTIVO = asesor(5, { slug: "inactivo", activo: false });
const BORRADO = asesor(6, { slug: "borrado", deleted_at: new Date("2026-11-01T00:00:00Z") });
const ROSTER = [PEPITO, JUAN, JOSE, EXCLUIDO, INACTIVO, BORRADO];

const SIN_ASESOR = { vendedor_id: null, atribuido: false };
const delTurno = (id) => ({ vendedor_id: id, atribuido: false });
const delLink = (id) => ({ vendedor_id: id, atribuido: true });

async function turnos(db, cantidad) {
  const ids = [];
  for (let i = 0; i < cantidad; i++) ids.push((await asesorPorTurno(db)).vendedor_id);
  return ids;
}

// ── Link ──

test("el link de un asesor activo lo asigna con atribuido", async () => {
  const db = repartoFalso({ vendedores: ROSTER });
  assert.deepEqual(await asesorDelLink(db, "juan"), delLink(2));
});

test("el link vale aunque el asesor no participe del turno", async () => {
  const db = repartoFalso({ vendedores: ROSTER });
  assert.deepEqual(await asesorDelLink(db, "excluido"), delLink(4));
});

test("un link sin código, inexistente, de un asesor inactivo o borrado se ignora", async () => {
  const db = repartoFalso({ vendedores: ROSTER });
  for (const slug of [null, undefined, "", "nadie", "inactivo", "borrado"]) {
    assert.equal(await asesorDelLink(db, slug), null, `slug ${JSON.stringify(slug)}`);
  }
});

// ── Heredar ──

test("heredar: el asesor de la consulta actual se mantiene con su atribuido mientras siga activo", async () => {
  const db = repartoFalso({ vendedores: ROSTER });
  assert.deepEqual(await heredarAsesor(db, { vendedor_id: 2, atribuido: true }), delLink(2));
  assert.deepEqual(await heredarAsesor(db, { vendedor_id: 2, atribuido: false }), delTurno(2));
  assert.deepEqual(await heredarAsesor(db, { vendedor_id: 4, atribuido: 0 }), delTurno(4), "no participar del turno no le quita lo que ya tenía");
});

test("heredar: sin asesor, inactivo, borrado o sin consulta actual no hereda nada", async () => {
  const db = repartoFalso({ vendedores: ROSTER });
  for (const actual of [null, {}, { vendedor_id: null, atribuido: false }, { vendedor_id: 5, atribuido: true }, { vendedor_id: 6, atribuido: true }, { vendedor_id: 99, atribuido: true }]) {
    assert.equal(await heredarAsesor(db, actual), null, JSON.stringify(actual));
  }
});

// ── Turno ──

test("seis consultas sin link rotan 1, 2, 3, 1, 2, 3 y nunca llegan al excluido, al inactivo ni al borrado", async () => {
  const db = repartoFalso({ vendedores: ROSTER });
  assert.deepEqual(await turnos(db, 6), [1, 2, 3, 1, 2, 3]);
});

test("el turno asigna sin atribuir", async () => {
  const db = repartoFalso({ vendedores: ROSTER });
  assert.deepEqual(await asesorPorTurno(db), delTurno(1));
});

test("el puntero queda guardado en la configuración con el id del último que recibió", async () => {
  const db = repartoFalso({ vendedores: ROSTER });
  await turnos(db, 2);
  assert.equal(db.estado.configuracion.reparto_ultimo_vendedor, "2");
});

test("el siguiente es el primero con id mayor al último, aunque el último ya no esté", async () => {
  const sinJuan = ROSTER.map((v) => (v.id === 2 ? { ...v, activo: false } : v));
  const db = repartoFalso({ vendedores: sinJuan, configuracion: { reparto_ultimo_vendedor: "2" } });
  assert.deepEqual(await turnos(db, 2), [3, 1]);
});

test("si el último es mayor que todos los elegibles, vuelve al primero", async () => {
  const db = repartoFalso({ vendedores: ROSTER, configuracion: { reparto_ultimo_vendedor: "9" } });
  assert.deepEqual(await turnos(db, 1), [1]);
});

test("un puntero ilegible arranca desde el primero", async () => {
  const db = repartoFalso({ vendedores: ROSTER, configuracion: { reparto_ultimo_vendedor: "abc" } });
  assert.deepEqual(await turnos(db, 1), [1]);
});

test("el asesor vinculado a una cuenta de administrador no recibe del turno", async () => {
  const db = repartoFalso({
    vendedores: ROSTER,
    usuarios: [{ id: 10, rol: "admin", activo: true, deleted_at: null, vendedor_id: 2 }],
  });
  assert.deepEqual(await turnos(db, 4), [1, 3, 1, 3]);
});

test("una cuenta de administrador dada de baja o un usuario asesor no excluyen al vendedor", async () => {
  const db = repartoFalso({
    vendedores: [PEPITO, JUAN],
    usuarios: [
      { id: 10, rol: "admin", activo: true, deleted_at: new Date("2026-11-01T00:00:00Z"), vendedor_id: 1 },
      { id: 11, rol: "admin", activo: false, deleted_at: null, vendedor_id: 1 },
      { id: 12, rol: "asesor", activo: true, deleted_at: null, vendedor_id: 2 },
    ],
  });
  assert.deepEqual(await turnos(db, 2), [1, 2]);
});

test("con el reparto apagado nadie recibe y el puntero no se mueve", async () => {
  const db = repartoFalso({ vendedores: ROSTER, configuracion: { reparticion_equitativa: "0", reparto_ultimo_vendedor: "1" } });
  assert.deepEqual(await asesorPorTurno(db), SIN_ASESOR);
  assert.equal(db.estado.configuracion.reparto_ultimo_vendedor, "1");
});

test("sin la fila de configuración el reparto está encendido", async () => {
  const db = repartoFalso({ vendedores: ROSTER });
  delete db.estado.configuracion.reparticion_equitativa;
  assert.deepEqual(await asesorPorTurno(db), delTurno(1));
});

test("si ningún asesor participa queda sin asignar y el puntero no se mueve", async () => {
  const db = repartoFalso({ vendedores: [EXCLUIDO, INACTIVO, BORRADO], configuracion: { reparto_ultimo_vendedor: "3" } });
  assert.deepEqual(await asesorPorTurno(db), SIN_ASESOR);
  assert.equal(db.estado.configuracion.reparto_ultimo_vendedor, "3");
});

test("sin asesores en la base queda sin asignar", async () => {
  assert.deepEqual(await asesorPorTurno(repartoFalso()), SIN_ASESOR);
});

test("el turno lee el puntero con SELECT ... FOR UPDATE parametrizado dentro de una transacción", async () => {
  const db = repartoFalso({ vendedores: ROSTER });
  await asesorPorTurno(db);
  assert.equal(db.estado.transacciones, 1);
  const [lectura] = db.estado.consultasRaw;
  assert.match(lectura.sql, /SELECT valor FROM configuracion WHERE clave = \? FOR UPDATE/);
  assert.deepEqual(lectura.valores, ["reparto_ultimo_vendedor"]);
});

test("seis consultas simultáneas reciben seis turnos distintos: ninguno se repite antes de dar la vuelta", async () => {
  const db = repartoFalso({ vendedores: ROSTER });
  const recibidos = await Promise.all(Array.from({ length: 6 }, () => asesorPorTurno(db)));
  assert.deepEqual(recibidos.map((r) => r.vendedor_id).sort(), [1, 1, 2, 2, 3, 3]);
  assert.equal(db.estado.configuracion.reparto_ultimo_vendedor, "3");
});

// ── Consulta nueva: link, herencia o turno ──

test("consulta nueva: el link gana al heredado y no gasta turno", async () => {
  const db = repartoFalso({ vendedores: ROSTER });
  const r = await asesorParaConsultaNueva(db, { link: delLink(2), actual: { vendedor_id: 1, atribuido: true } });
  assert.deepEqual(r, delLink(2));
  assert.equal(db.estado.transacciones, 0);
});

test("consulta nueva: sin link hereda al asesor activo de la consulta actual y no gasta turno", async () => {
  const db = repartoFalso({ vendedores: ROSTER });
  const r = await asesorParaConsultaNueva(db, { actual: { vendedor_id: 3, atribuido: true } });
  assert.deepEqual(r, delLink(3));
  assert.equal(db.estado.transacciones, 0);
});

test("consulta nueva: sin link y sin asesor que heredar va por turno", async () => {
  const db = repartoFalso({ vendedores: ROSTER });
  assert.deepEqual(await asesorParaConsultaNueva(db), delTurno(1));
  assert.deepEqual(await asesorParaConsultaNueva(db, { actual: { vendedor_id: 5, atribuido: true } }), delTurno(2));
});

// ── Fallas del turno ──

const errorDePrisma = (code) => Object.assign(new Error(`falla ${code}`), { code });
const callado = (t) => {
  const original = console.error;
  const registros = [];
  console.error = (...args) => registros.push(args.join(" "));
  t.after(() => (console.error = original));
  return registros;
};

test("si la transacción del turno falla, la consulta queda sin asignar y el error se registra", async (t) => {
  const registros = callado(t);
  const db = repartoFalso({ vendedores: ROSTER });
  db.estado.fallos.push(errorDePrisma("P2028"));
  assert.deepEqual(await asesorPorTurno(db), SIN_ASESOR);
  assert.equal(db.estado.transacciones, 1, "un error que no es deadlock no se reintenta");
  assert.match(registros[0], /\[reparto\].*P2028|\[reparto\].*falla/);
  assert.equal(db.estado.configuracion.reparto_ultimo_vendedor, null);
});

test("un deadlock (P2034) se reintenta una vez y, si el reintento sale bien, asigna y avanza el puntero", async (t) => {
  const registros = callado(t);
  const db = repartoFalso({ vendedores: ROSTER });
  db.estado.fallos.push(errorDePrisma("P2034"));
  assert.deepEqual(await asesorPorTurno(db), delTurno(1));
  assert.equal(db.estado.transacciones, 2);
  assert.equal(db.estado.configuracion.reparto_ultimo_vendedor, "1");
  assert.deepEqual(registros, []);
});

test("si el reintento del deadlock también falla, queda sin asignar y no se reintenta de nuevo", async (t) => {
  const registros = callado(t);
  const db = repartoFalso({ vendedores: ROSTER });
  db.estado.fallos.push(errorDePrisma("P2034"), errorDePrisma("P2034"), errorDePrisma("P2034"));
  assert.deepEqual(await asesorPorTurno(db), SIN_ASESOR);
  assert.equal(db.estado.transacciones, 2);
  assert.equal(registros.length, 1);
});

test("la transacción del turno pide READ COMMITTED con tope de espera y de duración", async () => {
  const db = repartoFalso({ vendedores: ROSTER });
  await asesorPorTurno(db);
  assert.deepEqual(db.estado.opciones, [{ isolationLevel: "ReadCommitted", timeout: 10_000, maxWait: 5_000 }]);
});
