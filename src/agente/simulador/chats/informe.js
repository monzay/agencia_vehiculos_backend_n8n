// Los documentos que deja una ronda de chats simulados: la transcripción legible, el resumen
// y el pedido para el revisor (Codex). Solo arma texto: no lee archivos ni toca la base.

const USD_POR_MENSAJE_WHATSAPP = 0.026;

const marca = (ok) => (ok ? "✅" : "❌");
const citar = (texto) => String(texto).split("\n").map((l) => `> ${l}`).join("\n");

function describirControl(c) {
  switch (c.tipo) {
    case "prohibido":
    case "obligatorio":
      return `${c.tipo}: "${c.texto}"`;
    case "guardado":
      return `guardado: ${c.dato} = ${c.valor}`;
    case "fotos":
    case "recordatorios":
      return `${c.tipo}: ${c.cantidad}`;
    case "repite_pregunta":
      return "repite pregunta seguida: no";
    case "cuotas_con_numeros":
      return "cuotas con números: no";
    case "termina_con_pulgar":
      return "termina con 👍: no";
    default:
      return c.tipo;
  }
}

function turnoMarkdown(t) {
  if (t.de === "cliente") {
    const quien = t.tipo === "audio" ? "Cliente (audio)" : "Cliente";
    return t.textos.map((texto) => `**${quien}:** ${texto}`).join("\n\n");
  }
  if (t.de === "espera") return `_(pasan ${t.minutos} minutos)_`;
  if (t.de === "reaccion") return "**Bot (reacción, gratis):** 👍";
  if (t.de === "error") return `**ERROR:** ${t.texto}`;
  const etiqueta = t.recordatorio ? "Bot (recordatorio)" : "Bot";
  const fotos = t.fotos ? `\n\n_[${t.fotos} fotos]_` : "";
  // El resultado entero de cada herramienta (gancho del orquestador); si no hay, las líneas del log como respaldo.
  const usos = t.usos?.length
    ? `\n\n${t.usos.map((u) => `_herramienta ${u.nombre} ${JSON.stringify(u.pedido)} → ${u.esError ? "ERROR " : ""}${u.resultado}_`).join("\n\n")}`
    : "";
  const lineas = !usos && t.herramientas?.length ? `\n\n${t.herramientas.map((h) => `_${h}_`).join("\n\n")}` : "";
  const herramientas = usos || lineas;
  return `**${etiqueta}:**\n${citar(t.texto || "(sin texto)")}${fotos}${herramientas}`;
}

function chatMarkdown(r) {
  const guardado = Object.entries(r.guardado ?? {})
    .map(([dato, valor]) => `- ${dato}: ${valor === null || valor === undefined || valor === "" ? "vacío" : valor}`)
    .join("\n");
  const controles = r.controles.length
    ? r.controles.map((c) => `- ${marca(c.ok)} ${describirControl(c.control)}${c.ok ? "" : ` — ${c.detalle}`}`).join("\n")
    : "- (sin controles automáticos)";
  const lista = (items) => (items.length ? items.map((i) => `- ${i}`).join("\n") : "- (nada)");
  return [
    `## ${r.codigo} · ${r.nombre} — repetición ${r.repeticion}`,
    r.reglas ? `Regla: ${r.reglas}` : null,
    r.error ? `**El chat se cortó:** ${r.error}` : null,
    "### Conversación",
    r.turnos.map(turnoMarkdown).join("\n\n"),
    "### Lo que quedó guardado",
    guardado || "- (no se pudo leer)",
    "### Controles automáticos",
    controles,
    "### Debe",
    lista(r.debe),
    "### No debe",
    lista(r.noDebe),
    `Costo de IA: US$ ${r.costoUsd.toFixed(4)} · mensajes de WhatsApp: ${r.mensajesWhatsApp}`,
  ].filter((x) => x !== null).join("\n\n");
}

export const transcripcionMarkdown = (resultados) => `# Transcripción de los chats simulados\n\n${resultados.map(chatMarkdown).join("\n\n---\n\n")}\n`;

// Un chat pasa si en TODAS sus repeticiones no se cortó y todos sus controles dieron bien.
export function resumir(resultados) {
  const porChat = new Map();
  for (const r of resultados) porChat.set(r.codigo, [...(porChat.get(r.codigo) ?? []), r]);
  const pasa = (r) => !r.error && r.controles.every((c) => c.ok);
  const chatsQuePasan = [...porChat].filter(([, rs]) => rs.every(pasa)).map(([codigo]) => codigo);
  const chatsQueFallan = [...porChat.keys()].filter((codigo) => !chatsQuePasan.includes(codigo));
  return {
    totalChats: porChat.size,
    chatsQuePasan,
    chatsQueFallan,
    costoUsd: resultados.reduce((s, r) => s + r.costoUsd, 0),
    mensajesWhatsApp: resultados.reduce((s, r) => s + r.mensajesWhatsApp, 0),
  };
}

export function resumenMarkdown(resumen, { ronda, esfuerzo } = {}) {
  return [
    `# Resumen de la ronda ${ronda ?? "(sin número)"}`,
    `- Esfuerzo de razonamiento: ${esfuerzo ?? "el del bot"}`,
    `- Chats que pasan los controles en todas las repeticiones: ${resumen.chatsQuePasan.length} de ${resumen.totalChats}`,
    `- Pasan: ${resumen.chatsQuePasan.join(", ") || "ninguno"}`,
    `- Fallan: ${resumen.chatsQueFallan.join(", ") || "ninguno"}`,
    `- Costo de IA: US$ ${resumen.costoUsd.toFixed(4)}`,
    `- ${resumen.mensajesWhatsApp} mensajes de WhatsApp (US$ ${(resumen.mensajesWhatsApp * USD_POR_MENSAJE_WHATSAPP).toFixed(3)} a USD 0,026 cada uno)`,
  ].join("\n") + "\n";
}

const INSTRUCCIONES = `# Pedido de revisión: chats simulados del bot

Sos el revisor. No ejecutes comandos ni abras archivos: todo lo que necesitás está en este documento.

Qué tenés que hacer:
1. Para cada chat y cada repetición de la transcripción, juzgá si las respuestas del bot cumplen lo que el chat pide ("Debe") y no hacen lo que prohíbe ("No debe"), y las reglas de los specs que van abajo.
2. Mirá también los controles automáticos: si alguno está mal armado, o un chat no prueba lo que dice probar, anotalo en "tests".
3. Una falla es alta si el bot rompe una regla del spec o dice algo falso o interno; media si responde mal pero sin dañar al cliente; baja si es de estilo.

Respondé SOLO con un JSON, sin texto antes ni después:

\`\`\`json
{
  "veredicto": "aprueba" | "no aprueba",
  "chats": [
    { "codigo": "K1", "repeticion": 1, "pasa": true, "fallas": [
      { "severidad": "alta" | "media" | "baja", "regla": "...", "evidencia": "cita textual de la respuesta", "explicacion": "..." }
    ] }
  ],
  "tests": [
    { "severidad": "alta" | "media" | "baja", "chat": "K1", "hallazgo": "...", "sugerencia": "..." }
  ]
}
\`\`\`

El veredicto es "aprueba" solo si ningún chat tiene fallas altas o medias.
`;

export function pedidoCodex({ specs, requisitoVigente, transcripcion }) {
  const delCambio = specs.map((s) => `### ${s.ruta}\n\n${s.texto.trim()}`).join("\n\n");
  return [
    INSTRUCCIONES,
    "## Specs del cambio",
    delCambio,
    "## Requisito vigente de agente-comportamiento (openspec/specs/agente-comportamiento/spec.md)",
    requisitoVigente.trim(),
    "## Transcripción",
    transcripcion.trim(),
  ].join("\n\n") + "\n";
}
