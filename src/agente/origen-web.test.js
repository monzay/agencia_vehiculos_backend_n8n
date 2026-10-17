import { test } from "node:test";
import assert from "node:assert/strict";
import { datosDeLaWeb, linkDelCatalogo } from "./origen-web.js";

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

test("el link del catálogo sale solo de una URL https configurada", () => {
  assert.equal(linkDelCatalogo("https://agencia.com/"), "https://agencia.com/catalogo");
  assert.equal(linkDelCatalogo("https://agencia.com", "A12B"), "https://agencia.com/catalogo/A12B");
  assert.equal(linkDelCatalogo(undefined), null);
  assert.equal(linkDelCatalogo("http://localhost:3000"), null);
});
