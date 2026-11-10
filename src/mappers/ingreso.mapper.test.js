import { test } from "node:test";
import assert from "node:assert/strict";
import { mapIngreso } from "./ingreso.mapper.js";

test("el detalle trae los hitos con su fecha y la foto de la entrega", () => {
  const fila = {
    id: 1,
    modalidad: "contado",
    estado: "vendido",
    tramite_hitos: [{ tipo: "entregado", fecha: new Date("2026-11-03T00:00:00Z") }],
    entregas: [{ url: "https://x/foto.webp" }],
  };
  const legajo = mapIngreso(fila, { conDetalle: true });
  assert.deepEqual(legajo.hitos, { entregado: "2026-11-03" });
  assert.equal(legajo.fotoEntrega, "https://x/foto.webp");

  const sinNada = mapIngreso({ id: 2, modalidad: "contado", estado: "recepcion" }, { conDetalle: true });
  assert.deepEqual(sinNada.hitos, {});
  assert.equal(sinNada.fotoEntrega, null);
});

test("el auto del boleto trae su precio al contado", () => {
  const fila = (precio_contado) => ({
    id: 1,
    modalidad: "contado",
    estado: "recepcion",
    auto_interes: { ref: "A1", marca: "Fiat", modelo: "Uno", anio: 2015, precio: "12000000.00", precio_contado },
  });
  assert.equal(mapIngreso(fila("10000000.00"), { conDetalle: true }).autoInteres.precioContado, 10000000);
  assert.equal(mapIngreso(fila(null), { conDetalle: true }).autoInteres.precioContado, null);
});

test("el detalle trae la preparación del usado, salvo que se haya quitado", () => {
  const fila = (preparacion) => ({ id: 1, modalidad: "compra", estado: "recepcion", preparacion });
  const vigente = { id: 7, estado: "en_preparacion", auto_id: null, deleted_at: null, auto: null };
  assert.deepEqual(mapIngreso(fila(vigente), { conDetalle: true }).preparacion, { id: 7, etapa: "en_preparacion" });
  assert.equal(mapIngreso(fila({ ...vigente, deleted_at: new Date() }), { conDetalle: true }).preparacion, null);
  assert.equal(mapIngreso(fila(null), { conDetalle: true }).preparacion, null);
});

test("el detalle del trámite trae su seguimiento", () => {
  const venta = mapIngreso({ id: 1, modalidad: "contado", estado: "recepcion" }, { conDetalle: true });
  assert.deepEqual(venta.seguimiento.pasos.map((p) => p.id), ["boleto", "firma", "vendido", "cobrado", "entregado", "transferido"]);
  assert.equal(venta.seguimiento.proximo, "boleto");

  const consignacion = mapIngreso({ id: 2, modalidad: "consignacion", estado: "recepcion" }, { conDetalle: true });
  assert.equal(consignacion.seguimiento.proximo, "papeles", "usa los requisitos del contrato");

  assert.equal(mapIngreso({ id: 3, modalidad: "contado", estado: "recepcion" }).seguimiento, undefined, "la lista no lo calcula");
});
