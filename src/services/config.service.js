import { prisma } from "../lib/prisma.js";

// Configuración global del panel, guardada en la tabla clave-valor `configuracion`.
// Se declaran las claves conocidas y su tipo para parsear/serializar de forma
// consistente (la columna `valor` es texto).

const BOOL_KEYS = ["reparticion_equitativa"];
const DEFAULTS = { reparticion_equitativa: true };

function parsear(clave, valor) {
  if (BOOL_KEYS.includes(clave)) return valor === "1" || valor === "true";
  return valor;
}

function serializar(clave, valor) {
  if (BOOL_KEYS.includes(clave)) return valor ? "1" : "0";
  return String(valor);
}

// Devuelve la config como objeto tipado, completando defaults de claves faltantes.
// Solo las claves conocidas: la tabla también guarda datos internos (como el puntero del
// reparto por turnos, `reparto_ultimo_vendedor`) que no se exponen ni se editan desde el panel.
export async function obtenerConfig() {
  const filas = await prisma.configuracion.findMany();
  const cfg = { ...DEFAULTS };
  for (const f of filas.filter((fila) => BOOL_KEYS.includes(fila.clave))) cfg[f.clave] = parsear(f.clave, f.valor);
  return cfg;
}

// Actualiza (upsert) solo las claves conocidas presentes en `patch`.
export async function actualizarConfig(patch = {}) {
  const claves = Object.keys(patch).filter((k) => BOOL_KEYS.includes(k));
  for (const clave of claves) {
    const valor = serializar(clave, patch[clave]);
    await prisma.configuracion.upsert({
      where: { clave },
      update: { valor },
      create: { clave, valor },
    });
  }
  return obtenerConfig();
}
