import { test } from "node:test";
import assert from "node:assert/strict";
import { publicarTerminos, terminosVigentes, MAX_TEXTO_TERMINOS } from "./terminos.service.js";

const PUBLICADO = new Date("2026-11-01T15:00:00Z");

// Base en memoria: solo agrega versiones (nunca borra ni pisa).
function baseFalsa(versiones = []) {
  const estado = { versiones };
  const db = {
    terminos_versiones: {
      findFirst: async () => estado.versiones.filter((v) => !v.deleted_at).at(-1) ?? null,
      create: async ({ data }) => {
        const fila = { id: estado.versiones.length + 1, created_at: PUBLICADO, deleted_at: null, ...data };
        estado.versiones = [...estado.versiones, fila];
        return fila;
      },
    },
  };
  return { db, estado };
}

test("publicar crea una versión nueva y la deja vigente", async () => {
  const { db, estado } = baseFalsa([{ id: 1, texto: "Versión vieja", publicado_por: "Ana", created_at: PUBLICADO, deleted_at: null }]);

  const vigente = await publicarTerminos({ texto: "  Política de privacidad\n\nUsamos tus datos solo para...  ", publicadoPor: "Joel" }, db);

  assert.deepEqual(vigente, { version: 2, texto: "Política de privacidad\n\nUsamos tus datos solo para...", publicado: PUBLICADO.toISOString() });
  assert.equal(estado.versiones.length, 2, "la versión anterior se conserva");
  assert.equal(estado.versiones[0].texto, "Versión vieja");
  assert.deepEqual(await terminosVigentes(db), vigente);
});

test("un texto vacío o demasiado largo se rechaza", async () => {
  const { db, estado } = baseFalsa();
  for (const texto of ["", "   ", null, 42, "x".repeat(MAX_TEXTO_TERMINOS + 1)]) {
    await assert.rejects(publicarTerminos({ texto, publicadoPor: "Joel" }, db), (e) => e.status === 400, String(texto).slice(0, 20));
  }
  assert.equal(estado.versiones.length, 0);
});

test("sin términos publicados no hay vigentes", async () => {
  assert.equal(await terminosVigentes(baseFalsa().db), null);
});

test("los caracteres invisibles se sacan; los saltos de línea quedan", async () => {
  const { db } = baseFalsa();
  const vigente = await publicarTerminos({ texto: "Hola​ mundo\u0000\nchau\r\nfin", publicadoPor: null }, db);
  assert.equal(vigente.texto, "Hola mundo\nchau\nfin");
});
