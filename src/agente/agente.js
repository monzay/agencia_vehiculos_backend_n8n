import { definicionesParaClaude, ejecutarHerramienta, NOMBRES_HERRAMIENTAS } from "./herramientas.js";
import { INSTRUCCIONES, contextoDelMomento } from "./instrucciones.js";
import { LIMITES, MENSAJES_FIJOS, maxTokensPara } from "./limites.js";

// El agente vendedor: le habla a Claude, ejecuta las herramientas que pide y
// arma la respuesta para WhatsApp. Nunca lanza: ante cualquier problema
// devuelve el mensaje de respaldo y pide derivar a un vendedor.

export const MODELO = "claude-haiku-5-5";

// Nivel de razonamiento del agente. Fuera de producción, AGENTE_ESFUERZO (low|medium|high) lo cambia para medir.
export const ESFUERZO = "low";
const NIVELES = ["low", "medium", "high"];
export const esfuerzoEfectivo = (env = process.env) =>
  env.NODE_ENV !== "production" && NIVELES.includes(env.AGENTE_ESFUERZO) ? env.AGENTE_ESFUERZO : ESFUERZO;

const respaldo = (motivo) => ({ ok: false, texto: MENSAJES_FIJOS.respaldo, fotos: [], derivar: true, motivo });

const textoDe = (respuesta) =>
  respuesta.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

const LIMITE_ALCANZADO = "Límite de consultas alcanzado: respondé al cliente con la información que ya tenés.";

// De a una y en orden: así dos herramientas del mismo turno no compiten (p. ej.
// los intentos de verificar el DNI) y las fotos salen en el orden pedido. Si una
// pasa a la consulta de otro auto, las siguientes trabajan sobre esa.
async function resolverHerramientas(usos, ctx, disponibles) {
  const resultados = [];
  let fotos = [];
  let ficha = null;
  let fotosRef = null;
  const guardados = [];
  let ctxActual = ctx;
  for (const [i, uso] of usos.entries()) {
    if (i >= disponibles) {
      resultados.push({ type: "tool_result", tool_use_id: uso.id, is_error: true, content: LIMITE_ALCANZADO });
      continue;
    }
    const r = await ejecutarHerramienta(uso.name, uso.input, ctxActual);
    // Qué datos del recorrido guardó la IA: sirve para saber si el cliente contestó lo que se le preguntó.
    if (uso.name === "registrar_calificacion" && !r.esError) guardados.push(...Object.entries(uso.input ?? {}).filter(([, v]) => v != null).map(([campo]) => campo));
    if (r.sesionId) ctxActual = { ...ctxActual, sesionId: r.sesionId };
    if (uso.name === "enviar_fotos_auto" && !r.esError) {
      fotos = [...fotos, ...(r.resultado.fotos ?? [])];
      ficha = ficha ?? r.resultado.ficha ?? null;
      if (r.resultado.fotos?.length) fotosRef = r.resultado.ref ?? fotosRef;
    }
    resultados.push(
      r.esError
        ? { type: "tool_result", tool_use_id: uso.id, is_error: true, content: r.error }
        : { type: "tool_result", tool_use_id: uso.id, content: JSON.stringify(r.resultado) }
    );
  }
  return { resultados, fotos, ficha, fotosRef, guardados, ctx: ctxActual };
}

// Nada interno le llega al cliente: ni el nombre de una herramienta ni un 👍 suelto con texto.
const nombraHerramienta = (texto) => NOMBRES_HERRAMIENTAS.some((nombre) => texto.includes(nombre));

// Quita las oraciones que nombran una herramienta (línea por línea, para respetar los párrafos).
export function sinOracionesInternas(texto) {
  return texto
    .split(/\r?\n/)
    .map((linea) =>
      linea
        .split(/(?<=[.!?…])\s+/)
        .filter((oracion) => !nombraHerramienta(oracion))
        .join(" ")
        .trim()
    )
    .filter(Boolean)
    .join("\n");
}

const PULGAR_SUELTO = /^👍[\u{1F3FB}-\u{1F3FF}]?\uFE0F?$/u;

// Un texto con más de una línea no termina con un 👍 solo: ese va únicamente como respuesta entera (reacción).
export function sinPulgarSuelto(texto) {
  const lineas = texto.trim().split(/\r?\n/);
  if (lineas.length < 2 || !PULGAR_SUELTO.test(lineas.at(-1).trim())) return texto;
  return lineas.slice(0, -1).join("\n").trim() || texto;
}

const PEDIDO_DE_REESCRITURA = "Reescribí ese mismo mensaje para el cliente sin nombrar ninguna herramienta ni nada de cómo trabajás por dentro. Respondé solo con el texto del mensaje.";

// Una sola reescritura sin herramientas; si falla o sigue nombrándolas, se quita la oración.
async function sinNombresInternos(texto, { anthropic, system, tools, conversacion, registrarConsumo }) {
  if (!nombraHerramienta(texto)) return texto;
  let reescrito = "";
  try {
    const respuesta = await anthropic.messages.create({
      model: MODELO,
      max_tokens: maxTokensPara(esfuerzoEfectivo()),
      system,
      tools,
      messages: [...conversacion, { role: "assistant", content: texto }, { role: "user", content: PEDIDO_DE_REESCRITURA }],
      output_config: { effort: esfuerzoEfectivo() },
      tool_choice: { type: "none" },
    }, OPCIONES_PEDIDO);
    await registrarSinCortar(registrarConsumo, respuesta.usage);
    if (respuesta.stop_reason === "end_turn") reescrito = textoDe(respuesta);
  } catch (err) {
    console.error("[agente] falló la reescritura sin nombres internos:", err?.status ?? "", err?.message);
  }
  return sinOracionesInternas(reescrito || texto);
}

// Un fallo al guardar el costo no le corta la respuesta al cliente: queda en el log
// con el uso completo para cargarlo a mano.
async function registrarSinCortar(registrarConsumo, usage) {
  try {
    await registrarConsumo({ modelo: MODELO, usage });
  } catch (err) {
    console.error("[agente] no se pudo registrar el consumo:", err?.message, JSON.stringify(usage));
  }
}

// Un webhook no puede esperar minutos: corta rápido y deja el reintento a Meta.
const OPCIONES_PEDIDO = { timeout: 30_000, maxRetries: 1 };

// mensajes: turnos para Claude (historial + mensaje nuevo, que puede traer imágenes).
// registrarConsumo({ modelo, usage }) guarda el costo de cada llamada.
export async function responderConIA({ mensajes, contexto, ctx, registrarConsumo }, { anthropic }) {
  const tools = definicionesParaClaude();
  const system = [
    { type: "text", text: INSTRUCCIONES, cache_control: { type: "ephemeral" } },
    { type: "text", text: contextoDelMomento(contexto) },
  ];
  let conversacion = [...mensajes];
  let herramientasUsadas = 0;
  let sinHerramientas = false;
  let fotos = [];
  let ficha = null;
  let fotosRef = null;
  let guardados = [];
  let ctxTurno = ctx;
  // Claude a veces contesta en el mismo turno en que usa una herramienta y después
  // no agrega nada (o repite lo mismo): se manda la respuesta final y, si viene
  // vacía, lo que había escrito antes.
  let textos = [];

  for (;;) {
    let respuesta;
    try {
      respuesta = await anthropic.messages.create({
        model: MODELO,
        max_tokens: maxTokensPara(esfuerzoEfectivo()),
        system,
        tools,
        messages: conversacion,
        output_config: { effort: esfuerzoEfectivo() },
        ...(sinHerramientas && { tool_choice: { type: "none" } }),
      }, OPCIONES_PEDIDO);
    } catch (err) {
      console.error("[agente] falló la llamada a Claude:", err?.status ?? "", err?.message);
      return respaldo("error_api");
    }

    await registrarSinCortar(registrarConsumo, respuesta.usage);

    if (respuesta.stop_reason === "refusal") return respaldo("rechazo");
    if (respuesta.stop_reason === "max_tokens") return respaldo("max_tokens");

    if (respuesta.stop_reason === "tool_use") {
      if (sinHerramientas) return respaldo("demasiadas_herramientas");
      const usos = respuesta.content.filter((b) => b.type === "tool_use");
      const disponibles = LIMITES.herramientasPorMensaje - herramientasUsadas;
      const { resultados, fotos: nuevas, ficha: fichaNueva, fotosRef: refNueva, guardados: nuevosGuardados, ctx: ctxNuevo } = await resolverHerramientas(usos, ctxTurno, disponibles);
      ctxTurno = ctxNuevo;
      fotos = [...fotos, ...nuevas];
      ficha = ficha ?? fichaNueva;
      fotosRef = refNueva ?? fotosRef;
      guardados = [...guardados, ...nuevosGuardados];
      herramientasUsadas += Math.min(usos.length, disponibles);
      sinHerramientas = herramientasUsadas >= LIMITES.herramientasPorMensaje;
      // La respuesta va completa (con sus bloques de razonamiento) y todos los
      // resultados juntos en un solo mensaje.
      textos = [...textos, textoDe(respuesta)];
      conversacion = [...conversacion, { role: "assistant", content: respuesta.content }, { role: "user", content: resultados }];
      continue;
    }

    const crudo = textoDe(respuesta) || textos.filter(Boolean).join("\n");
    const texto = crudo ? sinPulgarSuelto(await sinNombresInternos(crudo, { anthropic, system, tools, conversacion, registrarConsumo })) : "";
    // Si el turno pasó a la consulta de otro auto, el orquestador lo cierra en esa.
    const otraConsulta = ctxTurno.sesionId !== ctx.sesionId && { sesionId: ctxTurno.sesionId };
    return texto ? { ok: true, texto, fotos, ficha, fotosRef: fotos.length ? fotosRef : null, guardados, ...otraConsulta } : respaldo("sin_texto");
  }
}
