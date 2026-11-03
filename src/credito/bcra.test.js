import { test } from "node:test";
import assert from "node:assert/strict";
import { crearClienteBcra, URL_BCRA } from "./bcra.js";

const CUIL = "20123456786";
const DEUDAS = { identificacion: 20123456786, denominacion: "PERSONA DE PRUEBA", periodos: [{ periodo: "202609", entidades: [] }] };
const CHEQUES = { identificacion: 20123456786, denominacion: "PERSONA DE PRUEBA", causales: [] };

const respuesta = (status, results) => ({ ok: status >= 200 && status < 300, status, json: async () => ({ status, results }) });

function fetchFalso(responder) {
  const llamadas = [];
  const fetch = async (url, opciones) => {
    llamadas.push({ url, opciones });
    return responder(url, opciones);
  };
  return { fetch, llamadas };
}

const porRuta = (deudas, cheques) => (url) => (url.includes("ChequesRechazados") ? cheques() : deudas());

test("consulta deudas y cheques del CUIL", async () => {
  const { fetch, llamadas } = fetchFalso(porRuta(() => respuesta(200, DEUDAS), () => respuesta(200, CHEQUES)));
  const r = await crearClienteBcra({ fetch }).consultar(CUIL);
  assert.deepEqual(r, { estado: "ok", deudas: DEUDAS, cheques: CHEQUES });
  assert.deepEqual(llamadas.map((l) => l.url).sort(), [`${URL_BCRA}/Deudas/${CUIL}`, `${URL_BCRA}/Deudas/ChequesRechazados/${CUIL}`].sort());
  assert.ok(llamadas.every((l) => l.opciones.signal), "cada llamada tiene tiempo máximo");
});

test("un 404 es sin datos", async () => {
  const { fetch } = fetchFalso(() => respuesta(404, null));
  assert.deepEqual(await crearClienteBcra({ fetch }).consultar(CUIL), { estado: "ok", deudas: null, cheques: null });
});

test("un error, un 429 o el tiempo agotado se informan como error sin lanzar", async () => {
  const conError = fetchFalso(porRuta(() => respuesta(200, DEUDAS), () => respuesta(500, null)));
  assert.deepEqual(await crearClienteBcra({ fetch: conError.fetch }).consultar(CUIL), { estado: "error", motivo: "http_500" });

  const ocupado = fetchFalso(() => respuesta(429, null));
  assert.deepEqual(await crearClienteBcra({ fetch: ocupado.fetch }).consultar(CUIL), { estado: "error", motivo: "http_429" });

  const colgado = (_, { signal }) => new Promise((_resolver, rechazar) => signal.addEventListener("abort", () => rechazar(signal.reason)));
  const lento = fetchFalso(colgado);
  assert.deepEqual(await crearClienteBcra({ fetch: lento.fetch, tiempoMaximoMs: 5 }).consultar(CUIL), { estado: "error", motivo: "tiempo_agotado" });

  const caido = fetchFalso(() => Promise.reject(new TypeError("fetch failed")));
  assert.deepEqual(await crearClienteBcra({ fetch: caido.fetch }).consultar(CUIL), { estado: "error", motivo: "sin_conexion" });
});

test("un CUIL que no son 11 dígitos no llega a la URL del BCRA", async () => {
  const { fetch, llamadas } = fetchFalso(() => respuesta(200, DEUDAS));
  const bcra = crearClienteBcra({ fetch });
  for (const cuil of ["../Deudas", "2012345678", "20123456786?x=1", null]) {
    assert.deepEqual(await bcra.consultar(cuil), { estado: "error", motivo: "cuil_invalido" });
  }
  assert.equal(llamadas.length, 0);
});

test("más de 10 consultas en 10 segundos no llegan al BCRA", async () => {
  let ahora = 1_000_000;
  const { fetch, llamadas } = fetchFalso(() => respuesta(404, null));
  const bcra = crearClienteBcra({ fetch, reloj: () => ahora });

  // Cada verificación son 2 llamadas (deudas y cheques): entran 5 por ventana.
  for (let i = 0; i < 5; i += 1) assert.equal((await bcra.consultar(CUIL)).estado, "ok");
  assert.deepEqual(await bcra.consultar(CUIL), { estado: "error", motivo: "limite" });
  assert.equal(llamadas.length, 10);

  ahora += 10_000;
  assert.equal((await bcra.consultar(CUIL)).estado, "ok");
});
