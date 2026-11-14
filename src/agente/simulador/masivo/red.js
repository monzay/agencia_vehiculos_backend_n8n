// Corta la salida a internet del proceso: solo se deja conectar a la máquina local.
// Parchea net.Socket.prototype.connect (lo usan fetch, http y https) y tls.connect.
import net from "node:net";
import tls from "node:tls";

const PERMITIDOS = ["localhost", "127.0.0.1", "::1"];

function hostDe(args) {
  let [primero, segundo] = args;
  if (Array.isArray(primero)) [primero, segundo] = primero;
  if (primero && typeof primero === "object") {
    if (primero.path) return null; // socket local (IPC)
    return primero.host ?? "localhost";
  }
  if (typeof primero === "string" && !/^\d+$/.test(primero)) return null; // ruta de socket local
  return typeof segundo === "string" ? segundo : "localhost";
}

const normalizar = (host) => String(host).toLowerCase().replace(/^\[|\]$/g, "");

export function cortarRed({ permitidos = PERMITIDOS } = {}) {
  const lista = permitidos.map(normalizar);
  const connectOriginal = net.Socket.prototype.connect;
  const tlsOriginal = tls.connect;
  let intentos = 0;
  let activa = true;

  const bloqueado = (host) => host !== null && !lista.includes(normalizar(host));
  const falla = (host) => {
    intentos += 1;
    const e = new Error(`red cortada: conexión a ${host} bloqueada en la simulación`);
    e.code = "ERED_CORTADA";
    return e;
  };

  net.Socket.prototype.connect = function connect(...args) {
    const host = hostDe(args);
    if (activa && bloqueado(host)) {
      const e = falla(host);
      process.nextTick(() => this.destroy(e));
      return this;
    }
    return connectOriginal.apply(this, args);
  };

  tls.connect = function connect(...args) {
    const [primero, segundo] = args;
    const opciones = primero && typeof primero === "object" ? primero : typeof segundo === "object" && segundo ? segundo : {};
    const host = primero && typeof primero === "object" ? (primero.host ?? "localhost") : typeof segundo === "string" ? segundo : (opciones.host ?? "localhost");
    if (activa && bloqueado(host)) {
      const e = falla(host);
      const socket = new net.Socket();
      process.nextTick(() => socket.destroy(e));
      return socket;
    }
    return tlsOriginal.apply(this, args);
  };

  return {
    intentos: () => intentos,
    restaurar() {
      activa = false;
      net.Socket.prototype.connect = connectOriginal;
      tls.connect = tlsOriginal;
    },
  };
}
