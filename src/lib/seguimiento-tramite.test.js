import { test } from "node:test";
import assert from "node:assert/strict";
import { seguimientoTramite } from "./seguimiento-tramite.js";

const ids = (s) => s.pasos.map((p) => p.id);
const paso = (s, id) => s.pasos.find((p) => p.id === id);
const hechos = (s) => s.pasos.filter((p) => p.hecho).map((p) => p.id);

const boleto = (extra = {}) => ({ firmado: null, permuta: { vendido: false }, pago: { pagador: "cliente", monto: 1000, enActo: 1000, saldo: 0 }, ...extra });
const tramite = (extra = {}) => ({ modalidad: "contado", conUsado: false, estado: "recepcion", vehiculo: { dominio: null }, contrato: null, financiacion: null, sena: null, hitos: {}, ...extra });
const vendida = (extra = {}) => tramite({ estado: "vendido", contrato: boleto({ firmado: "2026-11-03", permuta: { vendido: true } }), ...extra });

test("venta al contado: boleto, firma, vendido, cobro, entrega y transferencia", () => {
  const s = seguimientoTramite(tramite());
  assert.deepEqual(ids(s), ["boleto", "firma", "vendido", "cobrado", "entregado", "transferido"]);
  assert.equal(s.proximo, "boleto");
});

test("parte de pago con usado: los papeles dependen del título", () => {
  const sinTitulo = seguimientoTramite(tramite({ modalidad: "permuta", conUsado: true }));
  assert.deepEqual(ids(sinTitulo), ["papeles", "boleto", "firma", "vendido", "cobrado", "entregado", "transferido"]);
  assert.equal(sinTitulo.proximo, "papeles");

  const conTitulo = seguimientoTramite(tramite({ modalidad: "permuta", conUsado: true, vehiculo: { dominio: "AB123CD" } }));
  assert.equal(paso(conTitulo, "papeles").hecho, true);
  assert.equal(conTitulo.proximo, "boleto");
});

test("la seña aparece hecha si el trámite nació de una", () => {
  const s = seguimientoTramite(tramite({ modalidad: "permuta", sena: { id: 1 } }));
  assert.equal(s.pasos[0].id, "sena");
  assert.equal(s.pasos[0].hecho, true);
  assert.equal(s.pasos[0].accion, null);
});

test("compra de la agencia: papeles, boleto, firma, publicación y venta del usado", () => {
  const firmada = { modalidad: "compra", conUsado: true, vehiculo: { dominio: "AB123CD" }, contrato: { firmado: "2026-11-03" } };
  const preparando = seguimientoTramite(tramite({ ...firmada, preparacion: { id: 1, etapa: "recibido" } }));
  assert.deepEqual(ids(preparando), ["papeles", "boleto", "firma", "publicado", "vendido"]);
  assert.equal(preparando.proximo, "publicado");
  assert.equal(paso(preparando, "publicado").accion, "preparacion");
  assert.equal(paso(preparando, "vendido").accion, null, "se vende desde el trámite de venta");

  const publicada = seguimientoTramite(tramite({ ...firmada, preparacion: { id: 1, etapa: "publicado" } }));
  assert.equal(publicada.proximo, "vendido");

  const vendida = seguimientoTramite(tramite({ ...firmada, preparacion: { id: 1, etapa: "vendido" } }));
  assert.equal(vendida.proximo, null);

  const sinFirmar = seguimientoTramite(tramite({ ...firmada, contrato: null }));
  assert.equal(paso(sinFirmar, "publicado").accion, null, "todavía no está en preparación");
});

test("consignación: hasta publicar y vender, y el retiro la cierra", () => {
  const consignacion = (extra) => tramite({ modalidad: "consignacion", conUsado: true, requisitosContrato: { habilitado: false }, ...extra });
  const lista = { requisitosContrato: { habilitado: true }, contrato: { firmado: "2026-11-03" } };

  const nueva = seguimientoTramite(consignacion());
  assert.deepEqual(ids(nueva), ["papeles", "contrato", "firma", "publicado", "vendido"]);
  assert.equal(nueva.proximo, "papeles");

  const firmada = seguimientoTramite(consignacion(lista));
  assert.equal(firmada.proximo, "publicado");
  assert.equal(paso(firmada, "publicado").accion, "publicar");

  const publicada = seguimientoTramite(consignacion({ ...lista, estado: "publicado" }));
  assert.equal(publicada.proximo, "vendido");
  assert.equal(paso(publicada, "vendido").accion, "vender_consignacion");

  const vendida = seguimientoTramite(consignacion({ ...lista, estado: "vendido" }));
  assert.equal(vendida.proximo, null);

  const retirada = seguimientoTramite(consignacion({ ...lista, estado: "retirado" }));
  assert.deepEqual(ids(retirada), ["papeles", "contrato", "firma", "retirado"]);
  assert.equal(retirada.proximo, null);
});

test("el próximo paso es el primero sin hacer, y al terminar no hay", () => {
  const cargado = seguimientoTramite(tramite({ contrato: boleto() }));
  assert.deepEqual(hechos(cargado), ["boleto"]);
  assert.equal(cargado.proximo, "firma");

  const firmado = seguimientoTramite(tramite({ contrato: boleto({ firmado: "2026-11-03" }) }));
  assert.equal(firmado.proximo, "vendido");

  const terminada = seguimientoTramite(vendida({ hitos: { cobrado: "2026-11-03", entregado: "2026-11-03", transferido: "2026-11-03" } }));
  assert.equal(terminada.proximo, null);
});

test("cobro, entrega y transferencia se pueden marcar recién con la venta hecha", () => {
  const sinVender = seguimientoTramite(tramite({ contrato: boleto({ firmado: "2026-11-03" }) }));
  for (const id of ["cobrado", "entregado", "transferido"]) assert.equal(paso(sinVender, id).accion, null, id);

  const vendido = seguimientoTramite(vendida());
  assert.equal(vendido.proximo, "cobrado");
  for (const id of ["cobrado", "entregado", "transferido"]) assert.equal(paso(vendido, id).accion, id);
});

test("sugiere entregar antes de transferir, sin obligar", () => {
  const cobrada = seguimientoTramite(vendida({ hitos: { cobrado: "2026-11-03" } }));
  assert.equal(cobrada.proximo, "entregado");

  const transferida = seguimientoTramite(vendida({ hitos: { cobrado: "2026-11-03", transferido: "2026-11-03" } }));
  assert.equal(paso(transferida, "transferido").hecho, true);
  assert.equal(transferida.proximo, "entregado");
});

test("sin nada que cobrar no aparece Cobrado", () => {
  const paga = (pago, extra = {}) => seguimientoTramite(vendida({ contrato: boleto({ firmado: "2026-11-03", pago }), ...extra }));

  assert.equal(paso(paga({ pagador: "agencia", monto: 500, enActo: 500, saldo: 0 }), "cobrado"), undefined, "paga la agencia");
  assert.equal(paso(paga({ pagador: null, monto: 0, enActo: 0, saldo: 0 }), "cobrado"), undefined, "sin diferencia");
  assert.equal(paso(paga({ pagador: "cliente", monto: 500, enActo: 0, saldo: 500 }, { financiacion: { id: 1 } }), "cobrado"), undefined, "todo financiado");
  assert.ok(paso(paga({ pagador: "cliente", monto: 500, enActo: 100, saldo: 400 }, { financiacion: { id: 1 } }), "cobrado"), "anticipo y cuotas");
  assert.ok(paso(paga({ pagador: "agencia", monto: 500, enActo: 500, saldo: 0 }, { hitos: { cobrado: "2026-11-03" } }), "cobrado"), "lo ya marcado se sigue viendo");
});

test("con saldo aparece la financiación, opcional, y no frena", () => {
  const conSaldo = boleto({ firmado: "2026-11-03", pago: { pagador: "cliente", saldo: 1000 } });
  const s = seguimientoTramite(tramite({ modalidad: "permuta", contrato: conSaldo }));
  assert.equal(paso(s, "financiacion").opcional, true);
  assert.equal(paso(s, "financiacion").hecho, false);
  assert.equal(s.proximo, "vendido");

  const conPlan = seguimientoTramite(tramite({ modalidad: "permuta", contrato: conSaldo, financiacion: { id: 1 } }));
  assert.equal(paso(conPlan, "financiacion").hecho, true);

  const sinSaldo = seguimientoTramite(tramite({ modalidad: "permuta", contrato: boleto({ firmado: "2026-11-03" }) }));
  assert.equal(paso(sinSaldo, "financiacion"), undefined);

  const contado = seguimientoTramite(tramite({ contrato: conSaldo }));
  assert.equal(paso(contado, "financiacion"), undefined, "al contado no se financia");
});
