import { test } from "node:test";
import assert from "node:assert/strict";
import { listarAlertasPendientes, marcarAlertaAtendida } from "./alertas-financiacion.service.js";

const ahora = new Date("2026-10-15T15:00:00Z");

const fila = (extra = {}) => ({
  id: 3,
  financiacion_id: 12,
  tipo: "transferencia",
  detalle: "Paga el viernes",
  created_at: new Date("2026-10-15T13:00:00Z"),
  financiaciones: { clientes: { nombre: "Juan Pérez", telefono: "3885550101" } },
  aviso: { numero: 8, telefono: "543885550101" },
  ...extra,
});

test("lista las alertas sin atender con el cliente, la cuota y el teléfono al que se le avisó", async () => {
  const pedidos = [];
  const db = { financiacion_alertas: { findMany: async (args) => (pedidos.push(args), [fila()]) } };
  const alertas = await listarAlertasPendientes({ db });
  assert.equal(pedidos[0].where.atendida_at, null);
  assert.ok(pedidos[0].take <= 100, "lista acotada");
  assert.deepEqual(alertas, [
    { id: 3, financiacionId: 12, tipo: "transferencia", detalle: "Paga el viernes", creada: "2026-10-15T13:00:00.000Z", nombre: "Juan Pérez", telefono: "543885550101", cuota: 8 },
  ]);
});

test("una baja sin aviso asociado usa el teléfono del cliente", async () => {
  const db = { financiacion_alertas: { findMany: async () => [fila({ tipo: "baja", aviso: null })] } };
  const [alerta] = await listarAlertasPendientes({ db });
  assert.equal(alerta.telefono, "3885550101");
  assert.equal(alerta.cuota, null);
});

test("marcar como atendida guarda quién y cuándo, una sola vez", async () => {
  const pedidos = [];
  let pendientes = 1;
  const db = {
    financiacion_alertas: {
      updateMany: async (args) => {
        pedidos.push(args);
        const count = pendientes;
        pendientes = 0;
        return { count };
      },
    },
  };
  assert.equal(await marcarAlertaAtendida({ db, id: 3, usuario: "Admin", ahora }), true);
  assert.deepEqual(pedidos[0], { where: { id: 3, atendida_at: null }, data: { atendida_at: ahora, atendida_por: "Admin" } });
  assert.equal(await marcarAlertaAtendida({ db, id: 3, usuario: "Admin", ahora }), false);
});
