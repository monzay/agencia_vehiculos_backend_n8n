import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const MODULO = new URL("./cargar-env.js", import.meta.url).href;

function valorAlCargar(contenidoEnv, entorno) {
  const carpeta = mkdtempSync(join(tmpdir(), "cargar-env-"));
  try {
    writeFileSync(join(carpeta, ".env"), contenidoEnv);
    return execFileSync(
      process.execPath,
      ["--input-type=module", "-e", `await import(${JSON.stringify(MODULO)}); process.stdout.write(process.env.VARIABLE_DE_PRUEBA ?? "");`],
      { cwd: carpeta, env: { ...process.env, ...entorno }, encoding: "utf8" },
    );
  } finally {
    rmSync(carpeta, { recursive: true, force: true });
  }
}

test("el .env gana sobre una variable que ya venía de Windows", () => {
  const valor = valorAlCargar('VARIABLE_DE_PRUEBA="del-env"\n', { VARIABLE_DE_PRUEBA: "de-windows" });
  assert.equal(valor, "del-env");
});

test("una variable que no está en el .env conserva el valor del sistema", () => {
  const valor = valorAlCargar('OTRA="x"\n', { VARIABLE_DE_PRUEBA: "de-windows" });
  assert.equal(valor, "de-windows");
});
