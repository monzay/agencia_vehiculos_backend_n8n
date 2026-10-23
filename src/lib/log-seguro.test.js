import { test } from "node:test";
import assert from "node:assert/strict";
import { urlSinDatosPersonales } from "./log-seguro.js";

// El log de peticiones no tiene que guardar nombres, teléfonos ni DNIs que viajan
// en la URL: `?dni=` de la consulta pública y `?q=` de los buscadores del panel.

test("oculta el valor de dni, q y telefono y deja intacto el resto de la URL", () => {
  assert.equal(urlSinDatosPersonales("/api/financiaciones/consulta?dni=30111222"), "/api/financiaciones/consulta?dni=***");
  assert.equal(urlSinDatosPersonales("/api/consultas?q=Juan%20P%C3%A9rez"), "/api/consultas?q=***");
  assert.equal(urlSinDatosPersonales("/api/leads?telefono=%2B54%209%20388%20470-8347"), "/api/leads?telefono=***");
});

test("respeta los demás parámetros y su orden", () => {
  assert.equal(
    urlSinDatosPersonales("/api/consultas?limite=20&offset=40&q=ana&clasif=CALIENTE&modalidad=venta"),
    "/api/consultas?limite=20&offset=40&q=***&clasif=CALIENTE&modalidad=venta"
  );
});

test("sin query string, o con una vacía, la URL queda como estaba", () => {
  for (const url of ["/api/vehiculos", "/api/vehiculos/12", "/api/vehiculos?", "/health", "/"]) {
    assert.equal(urlSinDatosPersonales(url), url);
  }
});

test("oculta cada aparición de un parámetro repetido", () => {
  assert.equal(urlSinDatosPersonales("/x?q=ana&limite=5&q=luis&dni=1&dni=2"), "/x?q=***&limite=5&q=***&dni=***&dni=***");
});

test("oculta el parámetro aunque su nombre venga codificado o en mayúsculas", () => {
  assert.equal(urlSinDatosPersonales("/x?%64ni=30111222&%71=ana"), "/x?%64ni=***&%71=***");
  assert.equal(urlSinDatosPersonales("/x?DNI=30111222&Telefono=388&Q=ana"), "/x?DNI=***&Telefono=***&Q=***");
});

test("oculta el valor aunque el parámetro llegue como objeto o lista (?dni[not]=x, ?q[]=ana)", () => {
  assert.equal(urlSinDatosPersonales("/x?dni[not]=30111222&q[]=ana&q%5Bb%5D=luis"), "/x?dni[not]=***&q[]=***&q%5Bb%5D=***");
});

test("un parámetro sin valor se deja como está: no hay nada que ocultar", () => {
  assert.equal(urlSinDatosPersonales("/x?dni&q=&telefono=&limite=5"), "/x?dni&q=&telefono=&limite=5");
});

test("el valor se oculta entero aunque tenga un = o un %= adentro", () => {
  assert.equal(urlSinDatosPersonales("/x?q=a=b%3Dc&limite=5"), "/x?q=***&limite=5");
});

test("no confunde un parámetro que solo se parece, ni toca el camino", () => {
  assert.equal(urlSinDatosPersonales("/x?query=1&dnis=2&qty=3&telefono_alt=4"), "/x?query=1&dnis=2&qty=3&telefono_alt=4");
  assert.equal(urlSinDatosPersonales("/api/dni=30111222/q=ana?limite=5"), "/api/dni=30111222/q=ana?limite=5");
});

test("una codificación rota en el nombre de un parámetro no hace fallar el log", () => {
  assert.equal(urlSinDatosPersonales("/x?%E0%A4%A=1&%zz=2&dni=30111222"), "/x?%E0%A4%A=1&%zz=2&dni=***");
});

test("con algo que no es texto devuelve vacío en vez de fallar", () => {
  for (const raro of [undefined, null]) assert.equal(urlSinDatosPersonales(raro), "");
});

test("es pura: no modifica nada y da lo mismo cada vez", () => {
  const url = "/x?q=ana&dni=30111222";
  assert.equal(urlSinDatosPersonales(url), urlSinDatosPersonales(url));
  assert.equal(url, "/x?q=ana&dni=30111222");
});
