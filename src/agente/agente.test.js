import { test } from "node:test";
import assert from "node:assert/strict";
import { responderConIA, MODELO } from "./agente.js";
import { MENSAJES_FIJOS } from "./limites.js";

// Claude simulado: devuelve respuestas guionadas y guarda cada pedido.
function claudeFalso(respuestas) {
  const pedidos = [];
  let i = 0;
  return {
    pedidos,
    messages: {
      create: async (params) => {
        pedidos.push(structuredClone(params));
        const r = respuestas[Math.min(i++, respuestas.length - 1)];
        if (r instanceof Error) throw r;
        return r;
      },
    },
  };
}

const uso = { input_tokens: 1000, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
const texto = (t) => ({ stop_reason: "end_turn", usage: uso, content: [{ type: "thinking", thinking: "", signature: "s1" }, { type: "text", text: t }] });
const pideHerramienta = (...usos) => ({
  stop_reason: "tool_use",
  usage: uso,
  content: [{ type: "thinking", thinking: "", signature: "s2" }, ...usos.map(([id, name, input]) => ({ type: "tool_use", id, name, input }))],
});

// Base simulada mínima para las herramientas.
const db = {
  horarios_atencion: { findMany: async () => [{ dia: 1, abierto: true, apertura: "09:00", cierre: "18:00" }] },
  autos: { findFirst: async () => ({ fotos_json: ["/vehiculos/a.jpg", "/vehiculos/b.jpg"] }) },
};
const ctx = { db, clienteId: 50, sesionId: 900, urlPublica: "https://agencia.com" };
const entrada = (consumos = []) => ({
  mensajes: [{ role: "user", content: "Hola" }],
  contexto: { agencia: "SEA Automotores" },
  ctx,
  registrarConsumo: async (c) => consumos.push(c),
});

test("responde con el texto de Claude y registra el costo de la llamada", async () => {
  const consumos = [];
  const anthropic = claudeFalso([texto("¡Hola! ¿En qué te ayudo?")]);
  const r = await responderConIA(entrada(consumos), { anthropic });
  assert.equal(r.ok, true);
  assert.equal(r.texto, "¡Hola! ¿En qué te ayudo?");
  assert.equal(consumos.length, 1);
  assert.deepEqual(consumos[0], { modelo: MODELO, usage: uso });
});

test("pide a Claude Haiku 5.5 con esfuerzo bajo, sin temperature y con las herramientas estrictas", async () => {
  const anthropic = claudeFalso([texto("ok")]);
  await responderConIA(entrada(), { anthropic });
  const p = anthropic.pedidos[0];
  assert.equal(p.model, "claude-haiku-5-5");
  assert.deepEqual(p.output_config, { effort: "low" });
  assert.equal("temperature" in p, false);
  assert.equal(p.tools.length, 9);
  assert.ok(p.tools.every((t) => t.strict === (t.name !== "registrar_calificacion")), "todas estrictas salvo registrar_calificacion");
  assert.equal(p.system[0].cache_control.type, "ephemeral", "las instrucciones fijas van cacheadas");
  assert.match(p.system.at(-1).text, /SEA Automotores/, "el contexto del momento va aparte");
});

test("ejecuta la herramienta pedida y le devuelve el resultado junto con su razonamiento intacto", async () => {
  const consumos = [];
  const anthropic = claudeFalso([pideHerramienta(["t1", "horarios_atencion", {}]), texto("Abrimos de lunes a viernes de 9 a 18.")]);
  const r = await responderConIA(entrada(consumos), { anthropic });
  assert.equal(r.texto, "Abrimos de lunes a viernes de 9 a 18.");
  assert.equal(consumos.length, 2, "cada llamada a Claude registra su costo");

  const segundo = anthropic.pedidos[1].messages;
  const asistente = segundo.at(-2);
  assert.equal(asistente.role, "assistant");
  assert.equal(asistente.content[0].type, "thinking", "el bloque de razonamiento vuelve sin tocar");
  assert.equal(asistente.content[0].signature, "s2");
  const resultado = segundo.at(-1).content[0];
  assert.equal(resultado.type, "tool_result");
  assert.equal(resultado.tool_use_id, "t1");
  assert.match(resultado.content, /Lunes/);
});

test("junta las fotos que devuelve enviar_fotos_auto para mandarlas por WhatsApp", async () => {
  const anthropic = claudeFalso([pideHerramienta(["t1", "enviar_fotos_auto", { ref: "12" }]), texto("Te paso las fotos.")]);
  const r = await responderConIA(entrada(), { anthropic });
  assert.deepEqual(r.fotos, ["https://agencia.com/vehiculos/a.jpg", "https://agencia.com/vehiculos/b.jpg"]);
  assert.equal(r.ficha, "https://agencia.com/catalogo/12", "el link a la ficha va en el botón del mensaje");
});

test("un error de herramienta vuelve a Claude marcado como error", async () => {
  const anthropic = claudeFalso([pideHerramienta(["t1", "buscar_autos", { tipo: "avion" }]), texto("Perdón, ¿qué tipo de vehículo buscás?")]);
  await responderConIA(entrada(), { anthropic });
  const resultado = anthropic.pedidos[1].messages.at(-1).content[0];
  assert.equal(resultado.is_error, true);
});

test("pasadas las 5 herramientas, le pide que responda con lo que tiene y sin más herramientas", async () => {
  const seis = Array.from({ length: 6 }, (_, i) => [`t${i}`, "horarios_atencion", {}]);
  const anthropic = claudeFalso([pideHerramienta(...seis), texto("Te cuento lo que encontré.")]);
  const r = await responderConIA(entrada(), { anthropic });
  assert.equal(r.texto, "Te cuento lo que encontré.");
  const resultados = anthropic.pedidos[1].messages.at(-1).content;
  assert.equal(resultados.filter((x) => !x.is_error).length, 5, "ejecuta solo 5");
  assert.equal(resultados.filter((x) => x.is_error).length, 1);
  assert.deepEqual(anthropic.pedidos[1].tool_choice, { type: "none" }, "la siguiente vuelta ya no puede usar herramientas");
});

test("si después del límite insiste con herramientas, responde el mensaje de respaldo", async () => {
  const anthropic = claudeFalso([
    pideHerramienta(...Array.from({ length: 6 }, (_, i) => [`t${i}`, "horarios_atencion", {}])),
    pideHerramienta(["t9", "horarios_atencion", {}]),
  ]);
  const r = await responderConIA(entrada(), { anthropic });
  assert.equal(r.ok, false);
  assert.equal(r.texto, MENSAJES_FIJOS.respaldo);
  assert.equal(r.derivar, true);
});

test("si Claude rechaza el pedido, respaldo y derivación", async () => {
  const anthropic = claudeFalso([{ stop_reason: "refusal", usage: uso, content: [] }]);
  const r = await responderConIA(entrada(), { anthropic });
  assert.equal(r.ok, false);
  assert.equal(r.texto, MENSAJES_FIJOS.respaldo);
  assert.equal(r.derivar, true);
});

test("si la API de Claude falla, respaldo sin romper", async () => {
  const anthropic = claudeFalso([new Error("overloaded")]);
  const r = await responderConIA(entrada(), { anthropic });
  assert.equal(r.ok, false);
  assert.equal(r.texto, MENSAJES_FIJOS.respaldo);
});

test("si Claude no devuelve texto, respaldo", async () => {
  const anthropic = claudeFalso([{ stop_reason: "max_tokens", usage: uso, content: [{ type: "thinking", thinking: "", signature: "x" }] }]);
  const r = await responderConIA(entrada(), { anthropic });
  assert.equal(r.ok, false);
});

test("si la respuesta se corta por largo, respaldo (no se manda un texto a medias)", async () => {
  const anthropic = claudeFalso([{ stop_reason: "max_tokens", usage: uso, content: [{ type: "text", text: "Tenemos un Gol que" }] }]);
  const r = await responderConIA(entrada(), { anthropic });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, "max_tokens");
});

test("si falla registrar el costo, igual responde (y el error no corta el agente)", async () => {
  const anthropic = claudeFalso([texto("¡Hola!")]);
  const r = await responderConIA({ ...entrada(), registrarConsumo: async () => { throw new Error("db caída"); } }, { anthropic });
  assert.equal(r.ok, true);
  assert.equal(r.texto, "¡Hola!");
});

test("ejecuta las herramientas de a una, en el orden que las pidió", async () => {
  const orden = [];
  const lenta = {
    ...db,
    horarios_atencion: {
      findMany: async () => {
        orden.push("inicio");
        await new Promise((r) => setTimeout(r, 5));
        orden.push("fin");
        return [];
      },
    },
  };
  const anthropic = claudeFalso([pideHerramienta(["t1", "horarios_atencion", {}], ["t2", "horarios_atencion", {}]), texto("ok")]);
  await responderConIA({ ...entrada(), ctx: { ...ctx, db: lenta } }, { anthropic });
  assert.deepEqual(orden, ["inicio", "fin", "inicio", "fin"]);
});

test("cada llamada a Claude tiene timeout corto y un solo reintento", async () => {
  const opciones = [];
  const anthropic = { messages: { create: async (_p, o) => (opciones.push(o), texto("ok")) } };
  await responderConIA(entrada(), { anthropic });
  assert.deepEqual(opciones[0], { timeout: 30_000, maxRetries: 1 });
});

test("si contestó junto con la herramienta y después no agrega nada, se manda lo que ya había escrito", async () => {
  const conTexto = pideHerramienta(["t1", "horarios_atencion", {}]);
  conTexto.content.splice(1, 0, { type: "text", text: "¡Genial! Abrimos de lunes a viernes de 9 a 18." });
  const anthropic = claudeFalso([conTexto, { stop_reason: "end_turn", usage: uso, content: [] }]);
  const r = await responderConIA(entrada(), { anthropic });
  assert.equal(r.ok, true);
  assert.equal(r.texto, "¡Genial! Abrimos de lunes a viernes de 9 a 18.");
});

test("si escribió antes y después de la herramienta, va solo la respuesta final (Claude suele repetir lo anterior)", async () => {
  const conTexto = pideHerramienta(["t1", "horarios_atencion", {}]);
  conTexto.content.splice(1, 0, { type: "text", text: "Dale, genial. Te espero." });
  const anthropic = claudeFalso([conTexto, texto("Dale, genial. Te espero.")]);
  const r = await responderConIA(entrada(), { anthropic });
  assert.equal(r.texto, "Dale, genial. Te espero.");
});
