import { test } from "node:test";
import assert from "node:assert/strict";
import { contenidoDeLectura, salidaDeRespuesta } from "./vision-claude.js";

test("un pdf va como documento y una imagen como imagen", () => {
  const contenido = contenidoDeLectura({
    imagenes: ["https://blob/lista.jpg"],
    pdfs: ["https://blob/lista.pdf"],
    instruccion: "Leé la lista.",
  });
  assert.deepEqual(contenido, [
    { type: "document", source: { type: "url", url: "https://blob/lista.pdf" } },
    { type: "image", source: { type: "url", url: "https://blob/lista.jpg" } },
    { type: "text", text: "Leé la lista." },
  ]);
});

test("una respuesta cortada por largo pide dividir la lista", () => {
  assert.throws(
    () => salidaDeRespuesta({ stop_reason: "max_tokens", parsed_output: null }),
    (e) => e.status === 422 && /en partes/.test(e.message)
  );
});

test("una respuesta rechazada o ilegible no llega como datos", () => {
  const silenciar = console.error;
  console.error = () => {};
  try {
    assert.throws(() => salidaDeRespuesta({ stop_reason: "refusal", parsed_output: null }), (e) => e.status === 502);
    assert.throws(() => salidaDeRespuesta({ stop_reason: "end_turn", parsed_output: null }), (e) => e.status === 502);
  } finally {
    console.error = silenciar;
  }
  assert.deepEqual(salidaDeRespuesta({ stop_reason: "end_turn", parsed_output: { vehiculos: [] } }), { vehiculos: [] });
});
