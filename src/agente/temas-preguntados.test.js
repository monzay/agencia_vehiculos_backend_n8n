import { test } from "node:test";
import assert from "node:assert/strict";
import { temasSinContestar, marcarPreguntados, sinPreguntaRepetida, temasSinGuardar } from "./temas-preguntados.js";

const salida = (mensaje, extra = {}) => ({ direccion: "saliente", mensaje, ...extra });
const entrada = (mensaje) => ({ direccion: "entrante", mensaje });
const FALTAN = ["forma de pago", "si entrega un usado", "quién decide", "cuándo puede venir a la agencia (día, hora, semana o fecha)"];

test("temasSinContestar: el último mensaje de la asesora preguntó la forma de pago y sigue pendiente", () => {
  const historial = [entrada("km?"), salida("¡Hola! ¿La pensás pagar de contado o financiada?")];
  assert.deepEqual(temasSinContestar(historial, FALTAN), ["forma de pago"]);
});

test("temasSinContestar: si el tema ya no está pendiente, o el último mensaje no preguntó nada, no hay nada sin contestar", () => {
  const historial = [salida("¿La pensás pagar de contado o financiada?")];
  assert.deepEqual(temasSinContestar(historial, ["quién decide"]), []);
  assert.deepEqual(temasSinContestar([salida("Te espero el martes.")], FALTAN), []);
  assert.deepEqual(temasSinContestar([], FALTAN), []);
});

test("temasSinContestar: solo mira el último mensaje de la asesora (no los anteriores) y saltea los de un asesor humano", () => {
  const historial = [salida("Es nafta."), salida("¿La pensás pagar de contado o financiada?")];
  assert.deepEqual(temasSinContestar(historial, FALTAN), []);
  const conHumano = [salida("Te llamo mañana", { paso_nodo: "humano" }), salida("¿La pensás pagar de contado o financiada?")];
  assert.deepEqual(temasSinContestar(conHumano, FALTAN), ["forma de pago"], "el mensaje de la persona no cuenta como el último del bot");
});

test("marcarPreguntados avisa, dentro de la lista de lo que falta, cuáles ya preguntó y no hay que repetir ahora", () => {
  const marcados = marcarPreguntados(FALTAN, ["forma de pago"]);
  assert.equal(marcados[0], "forma de pago (ya la preguntaste en tu último mensaje: no la repitas ahora)");
  assert.deepEqual(marcados.slice(1), FALTAN.slice(1));
  assert.deepEqual(marcarPreguntados(FALTAN, []), FALTAN);
});

// ── sinPreguntaRepetida ──

test("sinPreguntaRepetida quita la pregunta repetida que va en un párrafo aparte, con su coletilla de apoyo", () => {
  const texto = "Los km no los tengo a mano, pero los ves en la agencia 🙌\n\n¿Lo pensás pagar de contado o financiado? Así te oriento mejor.";
  assert.equal(sinPreguntaRepetida(texto, ["forma de pago"]), "Los km no los tengo a mano, pero los ves en la agencia 🙌");
});

test("sinPreguntaRepetida quita la pregunta repetida cuando va en la misma línea y deja el resto", () => {
  assert.equal(sinPreguntaRepetida("Es nafta. ¿La pensás pagar de contado o financiada? Con eso te armo opciones. Te espero en la agencia.", ["forma de pago"]), "Es nafta. Te espero en la agencia.");
  assert.equal(sinPreguntaRepetida("Y contame, ¿la pensás pagar de contado o financiada?", ["forma de pago"]), "Y contame, ¿la pensás pagar de contado o financiada?", "si quedaría vacío, se deja la original");
});

test("sinPreguntaRepetida con dos temas sin contestar quita las dos preguntas", () => {
  const texto = "Tiene aire.\n\n¿Cuánto tenés de anticipo?\n¿Tenés recibo de sueldo o garante? Así te oriento mejor.";
  assert.equal(sinPreguntaRepetida(texto, ["anticipo", "recibo o garante"]), "Tiene aire.");
});

test("sinPreguntaRepetida no toca preguntas de otros temas ni respuestas sin la pregunta repetida", () => {
  const texto = "Tiene aire.\n\n¿Cuándo podrías pasar a verlo?";
  assert.equal(sinPreguntaRepetida(texto, ["forma de pago"]), texto);
  assert.equal(sinPreguntaRepetida("Tiene aire.", ["forma de pago"]), "Tiene aire.");
  assert.equal(sinPreguntaRepetida(texto, []), texto);
});

test("sinPreguntaRepetida solo quita la coletilla que sigue a la pregunta quitada y empieza con Así o Con eso", () => {
  assert.equal(sinPreguntaRepetida("Tiene aire. Así lo ves cómodo.\n\n¿Cómo la pagás, de contado o financiada? Tené en cuenta lo del auto.", ["forma de pago"]), "Tiene aire. Así lo ves cómodo.\n\nTené en cuenta lo del auto.");
});

test("sinPreguntaRepetida no deja líneas vacías colgando", () => {
  const r = sinPreguntaRepetida("Primero.\n\n¿Cuánto tenés de anticipo?\n\nSegundo.", ["anticipo"]);
  assert.equal(r, "Primero.\n\nSegundo.");
});

test("temasSinGuardar descarta los temas cuyo dato guardó la IA en el turno con registrar_calificacion", () => {
  assert.deepEqual(temasSinGuardar(["forma de pago", "recibo o garante"], ["pago_tipo"]), ["recibo o garante"]);
  assert.deepEqual(temasSinGuardar(["usado"], ["usado_marca"]), []);
  assert.deepEqual(temasSinGuardar(["visita"], ["disponibilidad"]), []);
  assert.deepEqual(temasSinGuardar(["anticipo"], []), ["anticipo"]);
});

test("sinPreguntaRepetida quita la pregunta que va en la misma línea después de un emoji, sin coletilla (caso K1)", () => {
  const texto = "Ese dato no lo tengo a mano en este momento, pero lo vas a ver en persona cuando pases por la agencia 🙌 ¿Lo pensás pagar de contado o financiado?";
  assert.equal(sinPreguntaRepetida(texto, ["forma de pago"]), "Ese dato no lo tengo a mano en este momento, pero lo vas a ver en persona cuando pases por la agencia 🙌");
});
