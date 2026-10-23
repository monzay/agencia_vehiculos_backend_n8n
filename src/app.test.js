import { test, after } from "node:test";
import assert from "node:assert/strict";
import morgan from "morgan";

// Importar la app carga las rutas, y `lib/auth.js` exige un secreto de verdad.
process.env.JWT_SECRET ??= "s".repeat(40);
const { crearApp } = await import("./app.js");

// La línea que escribe el formato "dev" de morgan para una petición que todavía no respondió.
const lineaDeLog = (originalUrl) => morgan.dev(morgan, { method: "GET", originalUrl }, { headersSent: false });

test("el formato dev del log muestra la URL de la petición", () => {
  crearApp();
  assert.match(lineaDeLog("/api/vehiculos?limite=10"), /GET \/api\/vehiculos\?limite=10 /);
});

test("el log de peticiones no guarda el DNI ni las búsquedas que viajan en la URL", () => {
  crearApp();

  const consultaPublica = lineaDeLog("/api/financiaciones/consulta?dni=30111222");
  assert.match(consultaPublica, /\/api\/financiaciones\/consulta\?dni=\*\*\*/);
  assert.doesNotMatch(consultaPublica, /30111222/);

  const buscador = lineaDeLog("/api/consultas?limite=20&q=Juan%20P%C3%A9rez&telefono=3884708347");
  assert.match(buscador, /\/api\/consultas\?limite=20&q=\*\*\*&telefono=\*\*\*/);
  assert.doesNotMatch(buscador, /Juan|3884708347/);
});

test("si la petición no trae originalUrl el log usa url, y también oculta el DNI", () => {
  crearApp();
  const linea = morgan.dev(morgan, { method: "GET", url: "/consulta?dni=30111222" }, { headersSent: false });
  assert.match(linea, /\/consulta\?dni=\*\*\*/);
  assert.doesNotMatch(linea, /30111222/);
});

// ── Con la app andando de verdad ──

const servidor = await new Promise((listo) => {
  const s = crearApp().listen(0, () => listo(s));
});
after(() => servidor.close());
const base = `http://127.0.0.1:${servidor.address().port}`;

// morgan escribe cuando la respuesta termina, que puede ser un instante después de que el cliente la recibe.
async function esperarLinea(lineas, patron) {
  for (let intento = 0; intento < 100; intento += 1) {
    const linea = lineas.find((l) => patron.test(l));
    if (linea) return linea;
    await new Promise((siguiente) => setTimeout(siguiente, 10));
  }
  return assert.fail(`morgan no escribió una línea que cumpla ${patron}`);
}

test("una petición real con el DNI en la URL responde bien y deja el log sin el DNI", async (t) => {
  // Se anota lo que se escribe pero todo sigue pasando: el runner también usa stdout.
  const escrito = [];
  const escribir = process.stdout.write.bind(process.stdout);
  t.mock.method(process.stdout, "write", (trozo, ...resto) => (escrito.push(String(trozo)), escribir(trozo, ...resto)));

  const respuesta = await fetch(`${base}/health?dni=30111222&q=Juan`);

  assert.equal(respuesta.status, 200);
  const linea = await esperarLinea(escrito, /GET \/health/);
  assert.match(linea, /GET \/health\?dni=\*\*\*&q=\*\*\* /);
  assert.doesNotMatch(linea, /30111222|Juan/);
});

test("las respuestas llevan las cabeceras de seguridad y no dicen que corren con Express", async () => {
  const respuesta = await fetch(`${base}/health`);

  assert.equal(respuesta.headers.get("x-content-type-options"), "nosniff");
  assert.equal(respuesta.headers.get("referrer-policy"), "no-referrer");
  assert.match(respuesta.headers.get("strict-transport-security"), /max-age=\d+/);
  assert.equal(respuesta.headers.get("x-powered-by"), null);
});

test("una ruta que no existe responde 404 con el formato de la API", async () => {
  const respuesta = await fetch(`${base}/api/no-existe`);

  assert.equal(respuesta.status, 404);
  assert.deepEqual(await respuesta.json(), { ok: false, error: "Ruta no encontrada" });
});
