import { test } from "node:test";
import assert from "node:assert/strict";
import { temasSinContestar, marcarPreguntados } from "./temas-preguntados.js";

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
