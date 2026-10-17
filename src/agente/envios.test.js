import { test } from "node:test";
import assert from "node:assert/strict";
import { enviosDeRespuesta, REACCION_CIERRE } from "./envios.js";

const FICHA = "https://www.seaautomotores.com/catalogo/4";
const FOTOS = ["https://www.seaautomotores.com/vehiculos/a.jpg", "https://www.seaautomotores.com/vehiculos/b.jpg"];

test("una respuesta de texto sale en UN solo mensaje, aunque tenga varios párrafos", () => {
  const envios = enviosDeRespuesta({ texto: "¡Hola! La Amarok está a $45.000.000.\n\n¿La pagás de contado o financiada?" });
  assert.equal(envios.length, 1);
  assert.deepEqual(envios[0], { type: "text", text: { body: "¡Hola! La Amarok está a $45.000.000.\n\n¿La pagás de contado o financiada?" } });
});

test("con fotos: un solo mensaje con la primera foto arriba, el texto y un botón a la ficha", () => {
  const [envio, ...resto] = enviosDeRespuesta({ texto: "Te paso las fotos 👇", fotos: FOTOS, ficha: FICHA });
  assert.equal(resto.length, 0);
  assert.equal(envio.type, "interactive");
  assert.equal(envio.interactive.type, "cta_url");
  assert.deepEqual(envio.interactive.header, { type: "image", image: { link: FOTOS[0] } });
  assert.deepEqual(envio.interactive.body, { text: "Te paso las fotos 👇" });
  assert.equal(envio.interactive.action.name, "cta_url");
  assert.equal(envio.interactive.action.parameters.url, FICHA);
  assert.ok(envio.interactive.action.parameters.display_text.length <= 20, "Meta acepta hasta 20 caracteres en el botón");
});

test("con fotos pero sin link a la ficha: una foto con el texto abajo, en un solo mensaje", () => {
  assert.deepEqual(enviosDeRespuesta({ texto: "Te paso las fotos", fotos: FOTOS }), [
    { type: "image", image: { link: FOTOS[0], caption: "Te paso las fotos" } },
  ]);
});

test("con fotos y un texto más largo de lo que entra en el botón (1024): el texto y la foto por separado", () => {
  const largo = "a".repeat(1100);
  const envios = enviosDeRespuesta({ texto: largo, fotos: FOTOS, ficha: FICHA });
  assert.equal(envios.length, 2);
  assert.equal(envios[0].type, "text");
  assert.equal(envios[1].type, "interactive");
});

test("con fotos y sin texto, el mensaje igual lleva un texto (Meta no acepta el cuerpo vacío)", () => {
  const [envio] = enviosDeRespuesta({ texto: "", fotos: FOTOS, ficha: FICHA });
  assert.ok(envio.interactive.body.text.length > 0);
});

test("una reacción al mensaje del cliente: gratis, no lleva texto", () => {
  assert.deepEqual(enviosDeRespuesta({ reaccion: REACCION_CIERRE, wamid: "wamid.ABC" }), [
    { type: "reaction", reaction: { message_id: "wamid.ABC", emoji: "👍" } },
  ]);
});

test("una reacción sin el id del mensaje no se puede mandar: no sale nada", () => {
  assert.deepEqual(enviosDeRespuesta({ reaccion: REACCION_CIERRE, wamid: null }), []);
});

test("sin texto ni fotos no sale nada", () => {
  assert.deepEqual(enviosDeRespuesta({ texto: "  " }), []);
  assert.deepEqual(enviosDeRespuesta({}), []);
});

test("solo usa fotos que Meta acepta (https y JPG/PNG): una .webp o sin https no va arriba", () => {
  const fotos = ["http://agencia.com/a.jpg", "https://agencia.com/b.webp", "https://agencia.com/c.png"];
  const [envio] = enviosDeRespuesta({ texto: "Te paso las fotos", fotos, ficha: FICHA });
  assert.deepEqual(envio.interactive.header, { type: "image", image: { link: "https://agencia.com/c.png" } });
});

test("si ninguna foto sirve, igual sale UN mensaje con el texto y el botón a la ficha", () => {
  const [envio, ...resto] = enviosDeRespuesta({ texto: "Te paso las fotos", fotos: ["https://agencia.com/a.webp"], ficha: FICHA });
  assert.equal(resto.length, 0);
  assert.equal(envio.interactive.header, undefined);
  assert.equal(envio.interactive.action.parameters.url, FICHA);
});

test("si ninguna foto sirve y no hay ficha, sale el texto solo", () => {
  assert.deepEqual(enviosDeRespuesta({ texto: "Te paso las fotos", fotos: ["/vehiculos/a.jpg"] }), [{ type: "text", text: { body: "Te paso las fotos" } }]);
});
