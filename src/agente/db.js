import { PrismaClient } from "@prisma/client";

// Conexión del agente con el usuario de MySQL de mínimo privilegio (migración
// 067). Si falta la variable, falla: nunca se conecta con el usuario del
// backend, que puede borrar y modificar todo.
let cliente;

export function dbAgente() {
  if (!cliente) {
    const url = process.env.AGENTE_DATABASE_URL;
    if (!url) throw new Error("Falta AGENTE_DATABASE_URL: el agente usa su propio usuario de base de datos.");
    cliente = new PrismaClient({ datasourceUrl: url });
  }
  return cliente;
}
