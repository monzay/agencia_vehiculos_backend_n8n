import { test, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dbAgente } from "./db.js";
import { selectFicha } from "./auto-publico.js";
import { baseAutorizada } from "../lib/base-local.js";

if (existsSync(".env")) process.loadEnvFile(".env");

const url = process.env.AGENTE_DATABASE_URL;
const motivoDeSalto = !url
  ? "falta AGENTE_DATABASE_URL"
  : !baseAutorizada(url)
    ? "AGENTE_DATABASE_URL no apunta a una base local"
    : false;

after(async () => {
  if (!motivoDeSalto) await dbAgente().$disconnect();
});

test("el usuario del agente puede leer todas las columnas de la ficha", { skip: motivoDeSalto }, async () => {
  await assert.doesNotReject(() => dbAgente().autos.findFirst({ select: selectFicha() }));
});
