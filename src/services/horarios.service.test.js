import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma.js";
import { obtenerHorarios, guardarHorarios } from "./horarios.service.js";

function conBase(t, filas = []) {
  const upserts = [];
  let transacciones = 0;
  const { findMany, upsert } = prisma.horarios_atencion;
  const { $transaction } = prisma;
  prisma.horarios_atencion.findMany = async () => filas;
  prisma.horarios_atencion.upsert = async (args) => (upserts.push(args), args);
  prisma.$transaction = async (ops) => (transacciones++, Promise.all(ops));
  t.after(() => {
    Object.assign(prisma.horarios_atencion, { findMany, upsert });
    prisma.$transaction = $transaction;
  });
  return { upserts, transacciones: () => transacciones };
}

const dia = (n, extra = {}) => ({ dia: n, abierto: true, apertura: "08:00", cierre: "13:00", ...extra });
const rechazo = (nombre) => (e) => e.status === 400 && e.message.includes(nombre);

test("un día corrido se guarda con una sola franja", async (t) => {
  const { upserts } = conBase(t);
  await guardarHorarios([dia(1, { cierre: "21:00" })]);

  assert.deepEqual(upserts[0].update, { abierto: true, apertura: "08:00", cierre: "21:00", apertura_2: null, cierre_2: null });
});

test("un día cortado se guarda con las dos franjas", async (t) => {
  const { upserts } = conBase(t);
  await guardarHorarios([dia(1, { apertura_2: "16:00", cierre_2: "21:00" })]);

  assert.deepEqual(upserts[0].update, { abierto: true, apertura: "08:00", cierre: "13:00", apertura_2: "16:00", cierre_2: "21:00" });
  assert.equal(upserts[0].create.apertura_2, "16:00");
});

test("una segunda franja incompleta se rechaza", async (t) => {
  conBase(t);
  await assert.rejects(guardarHorarios([dia(1, { apertura_2: "16:00" })]), rechazo("lunes"));
  await assert.rejects(guardarHorarios([dia(2, { cierre_2: "21:00" })]), rechazo("martes"));
});

test("una segunda franja que empieza antes del primer cierre se rechaza", async (t) => {
  conBase(t);
  await assert.rejects(guardarHorarios([dia(1, { apertura_2: "12:00", cierre_2: "21:00" })]), rechazo("lunes"));
  await assert.rejects(guardarHorarios([dia(1, { apertura_2: "13:00", cierre_2: "21:00" })]), rechazo("lunes"));
});

test("una segunda franja que abre después de cerrar se rechaza", async (t) => {
  conBase(t);
  await assert.rejects(guardarHorarios([dia(1, { apertura_2: "21:00", cierre_2: "16:00" })]), rechazo("lunes"));
});

test("un día cerrado se guarda sin horas aunque lleguen", async (t) => {
  const { upserts } = conBase(t);
  await guardarHorarios([{ dia: 0, abierto: false, apertura: "08:00", cierre: "13:00", apertura_2: "16:00", cierre_2: "21:00" }]);

  assert.deepEqual(upserts[0].update, { abierto: false, apertura: null, cierre: null, apertura_2: null, cierre_2: null });
});

test("si un día no sirve no se guarda ninguno", async (t) => {
  const { upserts, transacciones } = conBase(t);
  await assert.rejects(
    guardarHorarios([dia(1), dia(2, { apertura_2: "12:00", cierre_2: "21:00" })]),
    rechazo("martes")
  );

  assert.deepEqual(upserts, []);
  assert.equal(transacciones(), 0);
});

test("los horarios se leen con las dos franjas", async (t) => {
  conBase(t, [
    { dia: 0, abierto: false, apertura: null, cierre: null, apertura_2: null, cierre_2: null },
    { dia: 1, abierto: true, apertura: "08:00", cierre: "13:00", apertura_2: "16:00", cierre_2: "21:00" },
  ]);

  assert.deepEqual(await obtenerHorarios(), [
    { dia: 0, abierto: false, apertura: null, cierre: null, apertura_2: null, cierre_2: null },
    { dia: 1, abierto: true, apertura: "08:00", cierre: "13:00", apertura_2: "16:00", cierre_2: "21:00" },
  ]);
});
