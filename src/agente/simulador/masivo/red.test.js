import { test } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import tls from "node:tls";
import http from "node:http";
import https from "node:https";
import { cortarRed } from "./red.js";

// Los hosts remotos de estas pruebas nunca reciben nada: con la red cortada no se sale a internet.

const REMOTO = "example.com";

function esperarError(pedido) {
  return new Promise((resolve) => {
    pedido.on("error", resolve);
    pedido.on("response", (r) => {
      r.resume();
      resolve(null);
    });
  });
}

function esperarErrorSocket(socket) {
  return new Promise((resolve) => {
    socket.on("error", resolve);
    socket.on("connect", () => resolve(null));
    socket.on("secureConnect", () => resolve(null));
  });
}

const CORTADA = /red|bloque|corta/i;

// Cada transporte: intenta salir a un host remoto y devuelve el error (o null si salió).
const TRANSPORTES = {
  fetch: async () => {
    try {
      await fetch(`https://${REMOTO}/`);
      return null;
    } catch (e) {
      return e;
    }
  },
  https: () => esperarError(https.get(`https://${REMOTO}/`)),
  http: () => esperarError(http.get(`http://${REMOTO}/`)),
  net: async () => {
    const s = net.connect({ host: REMOTO, port: 80 });
    const e = await esperarErrorSocket(s);
    s.destroy();
    return e;
  },
  tls: async () => {
    const s = tls.connect({ host: REMOTO, port: 443 });
    const e = await esperarErrorSocket(s);
    s.destroy();
    return e;
  },
};

// El mensaje del error (o de su causa, como en fetch) dice que la red está cortada.
function textoDelError(e) {
  return `${e?.message ?? ""} ${e?.cause?.message ?? ""} ${e?.code ?? ""} ${e?.cause?.code ?? ""}`;
}

for (const [nombre, intentar] of Object.entries(TRANSPORTES)) {
  test(`corta ${nombre} hacia un host remoto y lo cuenta`, async () => {
    const red = cortarRed();
    try {
      const antes = red.intentos();
      const error = await intentar();
      assert.ok(error, `${nombre} tiene que fallar`);
      assert.match(textoDelError(error), CORTADA, `${nombre} falla con el error de red cortada`);
      assert.ok(red.intentos() >= antes + 1, `${nombre} suma al menos un intento`);
    } finally {
      red.restaurar();
    }
  });
}

async function servidorLocal(host) {
  const servidor = net.createServer((s) => s.end("hola"));
  await new Promise((resolve, reject) => {
    servidor.once("error", reject);
    servidor.listen(0, host, resolve);
  });
  return servidor;
}

async function leer(host, port) {
  return new Promise((resolve, reject) => {
    const s = net.connect({ host, port });
    let datos = "";
    s.on("data", (d) => (datos += d));
    s.on("end", () => resolve(datos));
    s.on("error", reject);
  });
}

async function soportaIPv6() {
  try {
    const s = await servidorLocal("::1");
    await new Promise((r) => s.close(r));
    return true;
  } catch {
    return false;
  }
}

const sinIPv6 = !(await soportaIPv6()) && "::1 no está disponible en esta máquina";

for (const [nombre, host, bind, skip] of [
  ["127.0.0.1", "127.0.0.1", "127.0.0.1", false],
  ["localhost", "localhost", "127.0.0.1", false],
  ["::1", "::1", "::1", sinIPv6],
]) {
  test(`una conexión a ${nombre} con un servidor local se conecta y no se cuenta`, { skip }, async () => {
    const red = cortarRed();
    const servidor = await servidorLocal(bind);
    try {
      const recibido = await leer(host, servidor.address().port);
      assert.equal(recibido, "hola");
      assert.equal(red.intentos(), 0);
    } finally {
      red.restaurar();
      await new Promise((r) => servidor.close(r));
    }
  });
}

for (const host of [REMOTO, "localhost.ejemplo.invalid", "127.0.0.1.ejemplo.invalid", "127.0.0.1@ejemplo.invalid"]) {
  test(`${host} está bloqueado y contado`, async () => {
    const red = cortarRed();
    try {
      const s = net.connect({ host, port: 80 });
      const error = await esperarErrorSocket(s);
      s.destroy();
      assert.ok(error, "la conexión falla");
      assert.match(textoDelError(error), CORTADA);
      assert.equal(red.intentos(), 1);
    } finally {
      red.restaurar();
    }
  });
}

test("se puede cambiar la lista de hosts permitidos", async () => {
  const red = cortarRed({ permitidos: ["127.0.0.1"] });
  try {
    const socket = net.connect({ host: "localhost", port: 9 });
    const error = await esperarErrorSocket(socket);
    assert.ok(error, "localhost ya no está permitido");
    assert.match(textoDelError(error), CORTADA);
    assert.ok(red.intentos() >= 1);
    socket.destroy();
  } finally {
    red.restaurar();
  }
});

test("restaurar deja net.Socket.prototype.connect y tls.connect como estaban", () => {
  const connectAntes = net.Socket.prototype.connect;
  const tlsAntes = tls.connect;
  const red = cortarRed();
  assert.notEqual(net.Socket.prototype.connect, connectAntes, "durante el corte está reemplazada");
  assert.notEqual(tls.connect, tlsAntes);
  red.restaurar();
  assert.equal(net.Socket.prototype.connect, connectAntes);
  assert.equal(tls.connect, tlsAntes);
});

test("después de restaurar, los intentos ya no se cuentan", async () => {
  const red = cortarRed();
  red.restaurar();
  const servidor = await servidorLocal("127.0.0.1");
  await leer("127.0.0.1", servidor.address().port);
  await new Promise((r) => servidor.close(r));
  assert.equal(red.intentos(), 0);
});
