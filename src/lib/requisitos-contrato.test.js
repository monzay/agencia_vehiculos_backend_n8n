import { test } from "node:test";
import assert from "node:assert/strict";

import { requisitosContrato, exigirRequisitosContrato } from "./requisitos-contrato.js";

const completo = () => ({
  vehiculo: { dominio: "AE918TR", motor: "CFZ482915", chasis: "9BWAB45U8LT014782", kmRecepcion: 87450 },
  titular: {
    nombre: "Martín",
    apellido: "Ferreyra",
    dni: "31877654",
    cuit: "20318776549",
    domicilio: "Bv. Oroño 1450",
    localidad: "Rosario",
    provincia: "Santa Fe",
    telefono: "3415550142",
    cbu: "0110599520000012345678",
  },
  documentos: [
    { tipo: "titulo", tenencia: "original" },
    { tipo: "dni_titular", tenencia: "copia" },
  ],
  contrato: null,
});

const faltantes = (detalle) => requisitosContrato(detalle).items.filter((i) => !i.cumplido).map((i) => i.clave);

test("con todo cargado el contrato queda habilitado", () => {
  assert.equal(requisitosContrato(completo()).habilitado, true);
  assert.doesNotThrow(() => exigirRequisitosContrato(completo()));
});

test("un papel cargado pero no recibido no cuenta", () => {
  const d = completo();
  d.documentos[1].tenencia = "no_recibido";
  assert.deepEqual(faltantes(d), ["dni_titular"]);
});

test("un papel que no se cargó falta", () => {
  const d = completo();
  d.documentos = [{ tipo: "titulo", tenencia: "original" }];
  assert.deepEqual(faltantes(d), ["dni_titular"]);
});

test("los datos en blanco del titular y del vehículo faltan", () => {
  const d = completo();
  d.titular.cuit = null;
  d.titular.domicilio = "   ";
  d.vehiculo.motor = null;
  d.vehiculo.kmRecepcion = null;
  assert.deepEqual(faltantes(d), ["cuit", "domicilio", "motor", "kmRecepcion"]);
});

test("cero kilómetros es un dato cargado", () => {
  const d = completo();
  d.vehiculo.kmRecepcion = 0;
  assert.equal(requisitosContrato(d).habilitado, true);
});

test("el CBU se exige solo si la liquidación es por transferencia", () => {
  const d = completo();
  d.titular.cbu = null;
  assert.deepEqual(faltantes(d), ["cbu"]);
  d.contrato = { liquidacion: { forma: "efectivo" } };
  assert.equal(requisitosContrato(d).habilitado, true);
});

test("sin titular falta todo lo del titular y el error lo lista con 409", () => {
  const d = completo();
  d.titular = null;
  assert.throws(
    () => exigirRequisitosContrato(d),
    (e) => e.status === 409 && e.message.includes("CUIT / CUIL") && e.message.includes("Nombre"),
  );
});
