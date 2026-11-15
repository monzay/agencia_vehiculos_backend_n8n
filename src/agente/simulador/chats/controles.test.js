import { test } from "node:test";
import assert from "node:assert/strict";
import { aplicarControles } from "./controles.js";

const msg = (texto, extra = {}) => ({ texto, fotos: 0, recordatorio: false, ...extra });
const guardadoVacio = { pago_tipo: null, anticipo: null, entrega_usado: null, auto: null, visita: null, requiere_vendedor: null, permisos: 0, cuil: null };

// Aplica un solo control y devuelve su resultado.
function uno(control, mensajesBot = [], guardado = {}) {
  const resultado = aplicarControles({ controles: [control] }, { mensajesBot, guardado: { ...guardadoVacio, ...guardado } });
  assert.equal(resultado.length, 1);
  assert.deepEqual(resultado[0].control, control);
  return resultado[0];
}

test("devuelve un resultado por control, en el mismo orden", () => {
  const controles = [{ tipo: "fotos", cantidad: 0 }, { tipo: "recordatorios", cantidad: 0 }];
  const r = aplicarControles({ controles }, { mensajesBot: [], guardado: guardadoVacio });
  assert.deepEqual(r.map((x) => x.control), controles);
});

// ── prohibido ──

test("prohibido pasa cuando ningún mensaje contiene el texto", () => {
  const r = uno({ tipo: "prohibido", texto: "0 km" }, [msg("Tiene ochenta mil kilómetros")]);
  assert.equal(r.ok, true);
  assert.equal(r.detalle, null);
});

test("prohibido falla sin distinguir mayúsculas ni tildes", () => {
  const r = uno({ tipo: "prohibido", texto: "perdón" }, [msg("Hola"), msg("PERDON por la demora")]);
  assert.equal(r.ok, false);
  assert.ok(r.detalle.length > 0);
});

// ── obligatorio ──

test("obligatorio pasa cuando algún mensaje lo contiene, sin distinguir tildes", () => {
  assert.equal(uno({ tipo: "obligatorio", texto: "Vendedor" }, [msg("hola"), msg("un vendedór te contacta")]).ok, true);
});

test("obligatorio falla cuando ningún mensaje lo contiene", () => {
  const r = uno({ tipo: "obligatorio", texto: "19.800.000" }, [msg("hola")]);
  assert.equal(r.ok, false);
  assert.ok(r.detalle.length > 0);
});

// ── guardado ──

test("guardado vacío pasa con null, undefined o texto vacío y falla con un valor", () => {
  const c = { tipo: "guardado", dato: "entrega_usado", valor: "vacío" };
  assert.equal(uno(c, [], { entrega_usado: null }).ok, true);
  assert.equal(uno(c, [], { entrega_usado: undefined }).ok, true);
  assert.equal(uno(c, [], { entrega_usado: "" }).ok, true);
  const r = uno(c, [], { entrega_usado: true });
  assert.equal(r.ok, false);
  assert.ok(r.detalle.length > 0);
});

test("guardado sí/no sobre un booleano", () => {
  const si = { tipo: "guardado", dato: "requiere_vendedor", valor: "sí" };
  const no = { tipo: "guardado", dato: "entrega_usado", valor: "no" };
  assert.equal(uno(si, [], { requiere_vendedor: true }).ok, true);
  assert.equal(uno(si, [], { requiere_vendedor: false }).ok, false);
  assert.equal(uno(si, [], { requiere_vendedor: null }).ok, false);
  assert.equal(uno(no, [], { entrega_usado: false }).ok, true);
  assert.equal(uno(no, [], { entrega_usado: true }).ok, false);
});

test("guardado sí en anticipo, visita y cuil quiere decir que tiene algún valor", () => {
  for (const dato of ["anticipo", "visita", "cuil"]) {
    const c = { tipo: "guardado", dato, valor: "sí" };
    assert.equal(uno(c, [], { [dato]: "20123456786" }).ok, true, dato);
    assert.equal(uno(c, [], { [dato]: null }).ok, false, dato);
  }
});

test("guardado no en anticipo quiere decir que no hay valor", () => {
  const c = { tipo: "guardado", dato: "anticipo", valor: "no" };
  assert.equal(uno(c, [], { anticipo: null }).ok, true);
  assert.equal(uno(c, [], { anticipo: 4000000 }).ok, false);
});

test("guardado con un número compara por igualdad numérica", () => {
  const c = { tipo: "guardado", dato: "permisos", valor: "1" };
  assert.equal(uno(c, [], { permisos: 1 }).ok, true);
  assert.equal(uno(c, [], { permisos: "1" }).ok, true);
  const r = uno(c, [], { permisos: 2 });
  assert.equal(r.ok, false);
  assert.ok(r.detalle.length > 0);
});

test("guardado con otro texto compara los strings (pago_tipo y auto)", () => {
  const pago = { tipo: "guardado", dato: "pago_tipo", valor: "financiado" };
  assert.equal(uno(pago, [], { pago_tipo: "financiado" }).ok, true);
  assert.equal(uno(pago, [], { pago_tipo: "contado" }).ok, false);
  const auto = { tipo: "guardado", dato: "auto", valor: "64" };
  assert.equal(uno(auto, [], { auto: 64 }).ok, true);
  assert.equal(uno(auto, [], { auto: "60" }).ok, false);
});

// ── fotos y recordatorios ──

test("fotos cuenta los mensajes con fotos", () => {
  const c = { tipo: "fotos", cantidad: 1 };
  assert.equal(uno(c, [msg("a"), msg("b", { fotos: 4 })]).ok, true);
  const r = uno(c, [msg("a", { fotos: 4 }), msg("b", { fotos: 2 })]);
  assert.equal(r.ok, false);
  assert.ok(r.detalle.length > 0);
});

test("recordatorios cuenta los mensajes que son recordatorio", () => {
  const c = { tipo: "recordatorios", cantidad: 1 };
  assert.equal(uno(c, [msg("a"), msg("b", { recordatorio: true })]).ok, true);
  const r = uno(c, [msg("a")]);
  assert.equal(r.ok, false);
  assert.ok(r.detalle.length > 0);
  assert.equal(uno({ tipo: "recordatorios", cantidad: 0 }, [msg("a")]).ok, true);
});

// ── repite pregunta seguida ──

test("repite_pregunta pasa cuando cada mensaje pregunta algo distinto", () => {
  const r = uno({ tipo: "repite_pregunta" }, [msg("¿Lo pensás pagar de contado o financiado?"), msg("¿Cuánto tenés de anticipo?")]);
  assert.equal(r.ok, true);
});

test("repite_pregunta falla con el mismo tema en dos mensajes seguidos y nombra el tema", () => {
  const r = uno({ tipo: "repite_pregunta" }, [msg("¿Tenés recibo de sueldo?"), msg("Perfecto. ¿Y tenés recibo o garante?")]);
  assert.equal(r.ok, false);
  assert.match(r.detalle, /recibo/);
});

test("repite_pregunta no cuenta los recordatorios como mensaje seguido", () => {
  const r = uno({ tipo: "repite_pregunta" }, [
    msg("¿Tenés recibo de sueldo?"),
    msg("¿Seguís por ahí? ¿Tenés recibo?", { recordatorio: true }),
    msg("¿Cuánto tenés de anticipo?"),
  ]);
  assert.equal(r.ok, true);
});

test("repite_pregunta no falla si el tema vuelve pero no en mensajes consecutivos", () => {
  const r = uno({ tipo: "repite_pregunta" }, [msg("¿Tenés recibo?"), msg("Tiene 148.000 km."), msg("¿Tenés recibo?")]);
  assert.equal(r.ok, true);
});

// ── cuotas con números ──

test("cuotas_con_numeros pasa cuando el bot no nombra cuotas con montos", () => {
  assert.equal(uno({ tipo: "cuotas_con_numeros" }, [msg("La financiación se arma en la agencia.")]).ok, true);
});

test("cuotas_con_numeros falla cuando algún mensaje nombra cuotas con números", () => {
  const r = uno({ tipo: "cuotas_con_numeros" }, [msg("hola"), msg("Son 12 cuotas de $500.000")]);
  assert.equal(r.ok, false);
  assert.ok(r.detalle.length > 0);
});

// ── termina con 👍 ──

test("termina_con_pulgar pasa con un 👍 solo como mensaje o con texto que no termina en 👍", () => {
  const c = { tipo: "termina_con_pulgar" };
  assert.equal(uno(c, [msg("👍"), msg("Te esperamos el martes 👍 a la tarde")]).ok, true);
});

test("termina_con_pulgar falla con un mensaje de texto que termina con una línea que es solo 👍", () => {
  const r = uno({ tipo: "termina_con_pulgar" }, [msg("Quedamos así, te esperamos.\n\n👍")]);
  assert.equal(r.ok, false);
  assert.ok(r.detalle.length > 0);
});

// ── texto que empieza con un número ──

test("prohibido que empieza con un dígito no coincide si va pegado a otro número, punto o coma", () => {
  const c = { tipo: "prohibido", texto: "0 km" };
  assert.equal(uno(c, [msg("Tiene 148.000 km")]).ok, true);
  assert.equal(uno(c, [msg("Tiene 10 km de ruta")]).ok, true);
  assert.equal(uno(c, [msg("Tiene 1,0 km")]).ok, true);
  assert.equal(uno(c, [msg("tiene 0 km")]).ok, false);
  assert.equal(uno(c, [msg("Tiene 148.000 km y después tiene 0 km")]).ok, false);
});

test("obligatorio que empieza con un dígito tampoco coincide dentro de un número más largo", () => {
  const c = { tipo: "obligatorio", texto: "000.000" };
  assert.equal(uno(c, [msg("Son 19.000.000")]).ok, false);
  assert.equal(uno(c, [msg("Son $ 000.000 pesos")]).ok, true);
});
