import { test } from "node:test";
import assert from "node:assert/strict";
import { esSoloAgradecimiento, conversacionCerrada, debeReaccionar } from "./cierre.js";

const CERRADA = { visita_propuesta: "sábado a la mañana" };

test("charla cerrada + solo agradece + Agustina no había preguntado nada: se reacciona", () => {
  assert.equal(debeReaccionar({ texto: "dale, gracias!", sesion: CERRADA, ultimaRespuesta: "¡Te esperamos el sábado! Te dejo la dirección." }), true);
  assert.equal(debeReaccionar({ texto: "gracias!", sesion: CERRADA, ultimaRespuesta: null }), true);
});

test("si Agustina había preguntado algo, un 'dale' es una respuesta: no se reacciona", () => {
  assert.equal(debeReaccionar({ texto: "dale", sesion: CERRADA, ultimaRespuesta: "¿Querés que te pase las fotos?" }), false);
});

test("con la charla abierta no se reacciona, aunque solo agradezca", () => {
  assert.equal(debeReaccionar({ texto: "gracias!", sesion: { pago_tipo: "contado" }, ultimaRespuesta: "Anotado." }), false);
});

test("reconoce los agradecimientos y despedidas cortos", () => {
  for (const texto of ["gracias!", "Dale, gracias!", "dale gracias 👍", "genial 👍", "ok", "Okey", "👍", "🙏🙏", "joya", "Muchas gracias!!", "bueno, gracias", "listo, nos vemos", "gracias igualmente", "dale\ngracias!"]) {
    assert.equal(esSoloAgradecimiento(texto), true, texto);
  }
});

test("si pregunta, pide algo o trae un dato nuevo, NO es solo un agradecimiento (hay que responder)", () => {
  for (const texto of [
    "gracias, y el lunes abren?",
    "gracias! otra consulta",
    "dale, pero el sábado no puedo",
    "genial, el domingo voy",
    "ok mandame las fotos",
    "gracias, cuánto sale la otra?",
    "el sábado a las 9 llego",
    "",
    "   ",
  ]) {
    assert.equal(esSoloAgradecimiento(texto), false, texto);
  }
});

test("un mensaje largo nunca se toma como agradecimiento", () => {
  assert.equal(esSoloAgradecimiento(`gracias ${"gracias ".repeat(20)}`), false);
});

test("la charla está cerrada si acordó la visita, si no sabe cuándo viene o si ya la tomó un vendedor", () => {
  assert.equal(conversacionCerrada({ visita_propuesta: "sábado a la mañana" }), true);
  assert.equal(conversacionCerrada({ disponibilidad: "no_sabe" }), true);
  assert.equal(conversacionCerrada({ requiere_vendedor: true }), true);
  assert.equal(conversacionCerrada({ requiere_vendedor: 1 }), true);
});

test("con el recorrido a medias la charla sigue abierta", () => {
  assert.equal(conversacionCerrada({ pago_tipo: "contado", visita_propuesta: null, disponibilidad: "esta_semana" }), false);
  assert.equal(conversacionCerrada({}), false);
  assert.equal(conversacionCerrada(null), false);
});

test("'buenas' es un saludo, no una despedida", () => {
  assert.equal(esSoloAgradecimiento("Buenas"), false);
});

test("si Agustina pidió algo aunque sea sin signo de pregunta, un 'dale' se responde", () => {
  for (const ultimaRespuesta of ["Decime qué día podés pasar.", "Avisame cuando lo hables con tu marido.", "Confirmame el horario y lo dejo anotado."]) {
    assert.equal(debeReaccionar({ texto: "dale", sesion: CERRADA, ultimaRespuesta }), false, ultimaRespuesta);
  }
  assert.equal(debeReaccionar({ texto: "dale, gracias", sesion: CERRADA, ultimaRespuesta: "Cualquier cosa escribime por acá 🙌" }), true);
});
