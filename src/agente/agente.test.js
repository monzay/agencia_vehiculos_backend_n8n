import { test } from "node:test";
import assert from "node:assert/strict";
import { responderConIA, MODELO, ESFUERZO, esfuerzoEfectivo } from "./agente.js";
import { maxTokensPara } from "./limites.js";
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

test("si una herramienta cambia el auto de la consulta, las siguientes del turno siguen en la misma consulta", async () => {
  const updates = [];
  const cambios = [];
  const dbConsultas = {
    autos: { findFirst: async () => ({ id: 7 }) },
    chat_estado: {
      findUnique: async ({ where }) => ({ id: where.id, auto_id: where.id === 900 ? 5 : 7 }),
      update: async (args) => (updates.push(args), args),
    },
    vehiculo_cliente: { findFirst: async () => null },
  };
  const anthropic = claudeFalso([
    pideHerramienta(["t1", "registrar_calificacion", { auto_ref: "7", pago_tipo: "contado" }]),
    pideHerramienta(["t2", "derivar_a_vendedor", { motivo: "quiere reservar" }]),
    texto("Listo, te paso con un asesor."),
  ]);
  await responderConIA(
    { ...entrada(), ctx: { ...ctx, db: dbConsultas, cambiarAuto: async (sesionId, autoId) => (cambios.push([sesionId, autoId]), sesionId) } },
    { anthropic }
  );
  assert.deepEqual(cambios, [[900, 7]]);
  assert.deepEqual(updates.map((u) => u.where.id), [900, 900], "registrar y derivar escriben en la misma consulta");
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
  assert.equal(p.tools.length, 11);
  assert.ok(p.tools.every((t) => t.strict === !["buscar_autos", "registrar_calificacion"].includes(t.name)), "todas estrictas salvo buscar_autos y registrar_calificacion");
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

// ── Nada interno en el texto ──

test("si el texto nombra una herramienta, pide una reescritura sin herramientas y manda el texto nuevo", async () => {
  const consumos = [];
  const anthropic = claudeFalso([texto("Te busco algo parecido con buscar_similares 😉"), texto("Te busco algo parecido 😉")]);
  const r = await responderConIA(entrada(consumos), { anthropic });
  assert.equal(r.texto, "Te busco algo parecido 😉");
  assert.equal(anthropic.pedidos.length, 2);
  assert.deepEqual(anthropic.pedidos[1].tool_choice, { type: "none" });
  assert.equal(anthropic.pedidos[1].tools.length, 11, "las herramientas siguen declaradas, pero sin poder usarse");
  const pedido = anthropic.pedidos[1].messages;
  assert.match(JSON.stringify(pedido.at(-2)), /buscar_similares/, "lleva el texto a reescribir");
  assert.equal(pedido.at(-1).role, "user");
  assert.match(pedido.at(-1).content, /sin nombrar/i);
  assert.equal(consumos.length, 2, "la reescritura registra su costo como cualquier llamada");
});

test("si la reescritura sigue nombrando una herramienta, sale sin la oración que la nombra", async () => {
  const anthropic = claudeFalso([
    texto("Hola, tengo opciones. Uso buscar_similares para mostrarte. ¿Qué presupuesto tenés?"),
    texto("Hola, tengo opciones. Lo veo con buscar_similares. ¿Qué presupuesto tenés?"),
  ]);
  const r = await responderConIA(entrada(), { anthropic });
  assert.equal(r.ok, true);
  assert.doesNotMatch(r.texto, /buscar_similares/);
  assert.match(r.texto, /Hola, tengo opciones\./);
  assert.match(r.texto, /¿Qué presupuesto tenés\?/);
  assert.equal(anthropic.pedidos.length, 2, "una sola reescritura");
});

test("si al quitar las oraciones con nombres internos no queda texto, responde el respaldo", async () => {
  const anthropic = claudeFalso([texto("Uso ver_auto."), texto("Uso ver_auto para eso.")]);
  const r = await responderConIA(entrada(), { anthropic });
  assert.equal(r.ok, false);
  assert.equal(r.texto, MENSAJES_FIJOS.respaldo);
});

test("un texto sin nombres de herramientas sale tal cual, sin una llamada extra a Claude", async () => {
  const anthropic = claudeFalso([texto("El Vento está disponible, ¿te lo muestro?")]);
  const r = await responderConIA(entrada(), { anthropic });
  assert.equal(r.texto, "El Vento está disponible, ¿te lo muestro?");
  assert.equal(anthropic.pedidos.length, 1);
});

test("si falla la reescritura, igual sale sin la oración que nombra la herramienta", async () => {
  const anthropic = claudeFalso([texto("Hola. Usé enviar_fotos_auto."), new Error("overloaded")]);
  const r = await responderConIA(entrada(), { anthropic });
  assert.equal(r.texto, "Hola.");
});

test("un 👍 suelto al final de un texto se quita antes de enviar", async () => {
  const r = await responderConIA(entrada(), { anthropic: claudeFalso([texto("Nos vemos el viernes\n\n👍")]) });
  assert.equal(r.texto, "Nos vemos el viernes");
  const r2 = await responderConIA(entrada(), { anthropic: claudeFalso([texto("Nos vemos el viernes\n👍\n")]) });
  assert.equal(r2.texto, "Nos vemos el viernes");
});

test("un texto que es solo 👍 sigue igual (sale como reacción) y un 👍 en medio de una línea no se toca", async () => {
  const r = await responderConIA(entrada(), { anthropic: claudeFalso([texto("👍")]) });
  assert.equal(r.texto, "👍");
  const r2 = await responderConIA(entrada(), { anthropic: claudeFalso([texto("Dale 👍 te espero")]) });
  assert.equal(r2.texto, "Dale 👍 te espero");
});

// ── Las fotos enviadas quedan registradas ──

test("cuando la respuesta sale con fotos, devuelve el código del auto de las fotos", async () => {
  const anthropic = claudeFalso([pideHerramienta(["t1", "enviar_fotos_auto", { ref: "12" }]), texto("Te paso las fotos 👇")]);
  const r = await responderConIA(entrada(), { anthropic });
  assert.equal(r.fotos.length, 2);
  assert.equal(r.fotosRef, "12");
});

test("sin fotos en la respuesta, fotosRef es null", async () => {
  const r = await responderConIA(entrada(), { anthropic: claudeFalso([texto("Hola")]) });
  assert.equal(r.fotosRef, null);
});

test("si la herramienta no devolvió fotos (el auto no tiene o no está disponible), fotosRef es null", async () => {
  const sinFotos = { ...db, autos: { findFirst: async () => null } };
  const anthropic = claudeFalso([pideHerramienta(["t1", "enviar_fotos_auto", { ref: "12" }]), texto("Ese auto ya no está.")]);
  const r = await responderConIA({ ...entrada(), ctx: { ...ctx, db: sinFotos } }, { anthropic });
  assert.deepEqual(r.fotos, []);
  assert.equal(r.fotosRef, null);
});

// ── Nivel de razonamiento ──

test("el nivel de razonamiento es el de la constante, salvo un AGENTE_ESFUERZO válido fuera de producción", () => {
  assert.equal(ESFUERZO, "low");
  assert.equal(esfuerzoEfectivo({}), ESFUERZO);
  for (const nivel of ["low", "medium", "high"]) assert.equal(esfuerzoEfectivo({ AGENTE_ESFUERZO: nivel }), nivel);
  assert.equal(esfuerzoEfectivo({ AGENTE_ESFUERZO: "extremo" }), ESFUERZO, "un valor inválido se ignora");
  assert.equal(esfuerzoEfectivo({ AGENTE_ESFUERZO: "" }), ESFUERZO);
});

test("en producción AGENTE_ESFUERZO se ignora", () => {
  assert.equal(esfuerzoEfectivo({ AGENTE_ESFUERZO: "high", NODE_ENV: "production" }), ESFUERZO);
  assert.equal(esfuerzoEfectivo({ AGENTE_ESFUERZO: "high", NODE_ENV: "development" }), "high");
});

test("el máximo de tokens es 2048 con nivel bajo y 4096 con medio o alto", () => {
  assert.equal(maxTokensPara("low"), 2048);
  assert.equal(maxTokensPara("medium"), 4096);
  assert.equal(maxTokensPara("high"), 4096);
});

test("la llamada a Claude usa el nivel de AGENTE_ESFUERZO y su máximo de tokens", async () => {
  const antes = process.env.AGENTE_ESFUERZO;
  process.env.AGENTE_ESFUERZO = "medium";
  try {
    const anthropic = claudeFalso([texto("ok")]);
    await responderConIA(entrada(), { anthropic });
    assert.deepEqual(anthropic.pedidos[0].output_config, { effort: "medium" });
    assert.equal(anthropic.pedidos[0].max_tokens, 4096);
  } finally {
    if (antes === undefined) delete process.env.AGENTE_ESFUERZO;
    else process.env.AGENTE_ESFUERZO = antes;
  }
});

test("devuelve los campos que la IA guardó con registrar_calificacion en el turno (solo los que no vienen vacíos)", async () => {
  const dbConsulta = {
    autos: { findFirst: async () => ({ id: 7 }) },
    chat_estado: { findUnique: async ({ where }) => ({ id: where.id, auto_id: 7 }), update: async (a) => a },
    vehiculo_cliente: { findFirst: async () => null },
  };
  const anthropic = claudeFalso([
    pideHerramienta(["t1", "registrar_calificacion", { auto_ref: "7", pago_tipo: "financiado", anticipo: null, tiene_recibo_o_garante: true }]),
    texto("Perfecto."),
  ]);
  const r = await responderConIA({ ...entrada(), ctx: { ...ctx, db: dbConsulta } }, { anthropic });
  assert.deepEqual([...r.guardados].sort(), ["auto_ref", "pago_tipo", "tiene_recibo_o_garante"]);
  assert.deepEqual((await responderConIA(entrada(), { anthropic: claudeFalso([texto("Hola")]) })).guardados, []);
});

// ── El código del auto es interno ──

test("se quita del texto el código del auto (REF #65, (REF 65), ref. 65) y quedan prolijos los espacios y la puntuación", async () => {
  const casos = [
    ["El Gol Trend 2019 (REF #65) está a $16.500.000.", "El Gol Trend 2019 está a $16.500.000."],
    ["El Gol Trend REF #65, de 2019, está disponible.", "El Gol Trend, de 2019, está disponible."],
    ["Te paso las fotos de la ref. 65 👇", "Te paso las fotos de la 👇"],
    ["Mirá este (ref 12-B) que te puede servir.\n\nREF 65\n\n¿Lo pensás pagar de contado?", "Mirá este que te puede servir.\n\n¿Lo pensás pagar de contado?"],
  ];
  for (const [crudo, esperado] of casos) {
    const r = await responderConIA(entrada(), { anthropic: claudeFalso([texto(crudo)]) });
    assert.equal(r.texto, esperado, crudo);
  }
});

test("no toca palabras que solo empiezan con ref (referencia, referido) ni un texto sin código", async () => {
  const dicho = "Te lo dejo de referencia y quedó referido por un amigo.";
  const r = await responderConIA(entrada(), { anthropic: claudeFalso([texto(dicho)]) });
  assert.equal(r.texto, dicho);
});
