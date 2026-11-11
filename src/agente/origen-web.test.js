import { test } from "node:test";
import assert from "node:assert/strict";
import { datosDeLaWeb, linkDelCatalogo, codigoDeAuto } from "./origen-web.js";

const DE_LA_WEB = "Hola SEA AUTOMOTORES! Estoy interesado en el Peugeot 208 2021. ¿Podrían darme más información? (REF #A12B)";

test("del mensaje predefinido de la web saca la ref del auto", () => {
  assert.equal(datosDeLaWeb(DE_LA_WEB).ref, "A12B");
});

test("saca el código del asesor y lo quita del texto (el cliente no tiene por qué verlo repetido)", () => {
  const d = datosDeLaWeb(`${DE_LA_WEB} [AS:juan-perez]`);
  assert.equal(d.asesor, "juan-perez");
  assert.equal(d.texto, DE_LA_WEB);
});

test("un mensaje común no trae ref ni asesor y queda igual", () => {
  assert.deepEqual(datosDeLaWeb("hola, tienen camionetas?"), { ref: null, asesor: null, texto: "hola, tienen camionetas?" });
  assert.deepEqual(datosDeLaWeb(undefined), { ref: null, asesor: null, texto: "" });
});

test("una ref o un código con caracteres raros no se toman", () => {
  assert.equal(datosDeLaWeb("(REF #12'; DROP)").ref, null);
  assert.equal(datosDeLaWeb("[AS:<script>]").asesor, null);
});

test("codigoDeAuto saca el código como lo escribe la IA: #13, REF #13, ref 13", () => {
  for (const texto of ["13", "#13", "# 13", "REF #13", "ref 13", "Ref. 13", "REF:13", "REF13", "(REF #13)", "  #13  "]) {
    assert.equal(codigoDeAuto(texto), "13", texto);
  }
});

test("codigoDeAuto deja igual un código que ya está limpio, también alfanumérico", () => {
  assert.equal(codigoDeAuto("A12B"), "A12B");
  assert.equal(codigoDeAuto("#A12B"), "A12B");
});

test("codigoDeAuto no toma textos que no son un código", () => {
  for (const texto of ["Onix LTZ", "13; DROP TABLE autos", "", "#", null, undefined]) {
    assert.equal(codigoDeAuto(texto), null, String(texto));
  }
});

test("el link del catálogo sale solo de una URL https configurada", () => {
  assert.equal(linkDelCatalogo("https://agencia.com/"), "https://agencia.com/catalogo");
  assert.equal(linkDelCatalogo("https://agencia.com", "A12B"), "https://agencia.com/catalogo/A12B");
  assert.equal(linkDelCatalogo(undefined), null);
  assert.equal(linkDelCatalogo("http://localhost:3000"), null);
});
