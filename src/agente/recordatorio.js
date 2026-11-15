// Recordatorio a los 10 minutos: si la asesora preguntó algo y el cliente no contestó, se le escribe UNA vez
// (como mucho cada 24 horas por consulta). Reemplaza la regla del 15/10/2026 de no escribirle al que deja
// de responder. Todo con dependencias inyectadas (base, Claude, envío, reloj): los tests no tocan nada real.
import { MODELO, esfuerzoEfectivo, sinOracionesInternas, sinPulgarSuelto } from "./agente.js";
import { enCola, contextoDelTurno } from "./atender.js";
import { conversacionCerrada, pregunta } from "./cierre.js";
import { INSTRUCCIONES, contextoDelMomento } from "./instrucciones.js";
import { LIMITES, historialParaClaude, maxTokensPara } from "./limites.js";
import { PASO_AGENTE, PASO_HUMANO } from "./pasos.js";
import { NOMBRES_HERRAMIENTAS } from "./herramientas.js";
import { crearEnvioWhatsapp } from "./whatsapp-envio.js";
import { avisoReciente } from "../services/avisos-cuotas.service.js";
import { gastoDelMes, topeConfigurado, registrarConsumoClaude } from "../services/ia-consumos.service.js";

const MIN = 60_000;
const VENTANA_MAX_MIN = 60; // pasada la hora, no se le escribe: el sistema pudo estar apagado
const MIN_ENTRE_RECORDATORIOS_H = 24;
const MAX_POR_REVISION = 20;
const CADA_MS = 60_000;
const MINUTOS_POR_DEFECTO = 10;
const OPCIONES_PEDIDO = { timeout: 30_000, maxRetries: 1 };

export const TEXTO_FIJO = "¿Seguís por ahí? Cuando puedas, contame y seguimos 🙂";
const NO_CORRESPONDE = "NO_CORRESPONDE";

// El cliente avisó que se demoraba: no se le escribe aunque el sistema no pueda armar un texto.
const AVISO_DE_DEMORA = /m[aá]s tarde|(?:despu[eé]s|luego) te (?:escribo|aviso|hablo)|luego te|estoy ocupad|en el trabajo|manejando|ahora no puedo/i;

const hace = (ahora, ms) => new Date(ahora.getTime() - ms);

// ── Qué consultas corresponden ──

const ultimoMensajeDe = (db, clienteId) => db.historial_mensajes.findFirst({ where: { cliente_id: clienteId }, orderBy: { id: "desc" } });

// Lo barato primero: consultas con actividad en la ventana; después se mira el último mensaje de cada una.
// Todo lo que filtra la base se vuelve a comprobar acá, con el dato leído.
export async function consultasParaRecordar({ db, ahora, minutos = MINUTOS_POR_DEFECTO, telefono = null }) {
  const sesiones = await db.chat_estado.findMany({
    where: {
      // El último mensaje se guarda 1 ms después de `ultimo_mensaje`: se deja un margen y la edad exacta se mira abajo.
      ultimo_mensaje: { gte: hace(ahora, (VENTANA_MAX_MIN + 1) * MIN), lte: hace(ahora, minutos * MIN - 1000) },
      bot_pausado: false,
      opt_out: false,
      requiere_vendedor: false,
      OR: [{ recordatorio_en: null }, { recordatorio_en: { lt: hace(ahora, MIN_ENTRE_RECORDATORIOS_H * 3_600_000) } }],
    },
    orderBy: { ultimo_mensaje: "asc" },
    take: MAX_POR_REVISION * 5,
  });
  const candidatas = [];
  for (const sesion of sesiones) {
    if (candidatas.length >= MAX_POR_REVISION) break;
    if (sesion.bot_pausado || sesion.opt_out || conversacionCerrada(sesion)) continue;
    if (sesion.recordatorio_en && new Date(sesion.recordatorio_en) >= hace(ahora, MIN_ENTRE_RECORDATORIOS_H * 3_600_000)) continue;
    const ultimo = await ultimoMensajeDe(db, sesion.cliente_id);
    if (!esPreguntaSinContestar(ultimo, ahora, minutos)) continue;
    const canal = await db.cliente_canales.findFirst({ where: { cliente_id: sesion.cliente_id, canal: "whatsapp" }, select: { identificador: true } });
    if (!canal?.identificador || (telefono && String(canal.identificador) !== String(telefono))) continue;
    if (await avisoReciente({ db, telefono: canal.identificador, ahora })) continue; // charla por una cuota
    candidatas.push({ sesion, clienteId: sesion.cliente_id, telefono: String(canal.identificador), ultimo });
  }
  return candidatas;
}

// El último mensaje es del bot (no de un asesor ni una reacción), pregunta o pide algo y tiene entre `minutos` y 60.
function esPreguntaSinContestar(ultimo, ahora, minutos) {
  if (!ultimo || ultimo.direccion !== "saliente" || ultimo.paso_nodo !== PASO_AGENTE || !pregunta(ultimo.mensaje)) return false;
  const edad = ahora.getTime() - new Date(ultimo.created_at).getTime();
  return edad >= minutos * MIN && edad < VENTANA_MAX_MIN * MIN;
}

// ── Qué dice ──

const SALUDO_INICIAL = /^[¡!\s]*(?:hola|buenas(?: tardes| noches)?|buen d[ií]a|buenos d[ií]as)(?= |[,!.¡:]|$)(?: de nuevo)?\s*[,!.:¡]*\s*/i;

// Un saludo al empezar el recordatorio sobra: se quita (y la primera letra queda en mayúscula).
export function sinSaludoInicial(texto) {
  const resto = texto.replace(SALUDO_INICIAL, "");
  if (!resto.trim()) return texto;
  return resto.replace(/\p{L}/u, (letra) => letra.toUpperCase());
}

const lineaDelRecordatorio = (minutos) =>
  `RECORDATORIO: el cliente no respondió tu último mensaje hace ${minutos} minutos. Escribí un único mensaje de una oración que retome tu última pregunta con otras palabras: sin "hola", sin "perdón por escribir de nuevo", sin "no hay apuro", sin explicar para qué sirve el dato, sin presionar y sin datos nuevos. Respondé únicamente ${NO_CORRESPONDE} solo si el último mensaje del cliente dice expresamente que está ocupado, que escribe más tarde o que se despide. Si simplemente no contestó tu pregunta, escribí el recordatorio: es lo normal.`;

const textoDeClaude = (respuesta) =>
  respuesta.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

// El texto a enviar, o null si no corresponde mandar nada.
export async function textoDelRecordatorio({ db, candidato, ahora, minutos = MINUTOS_POR_DEFECTO, anthropic }) {
  const { sesion, clienteId } = candidato;
  const historial = sesion.sesion_inicio
    ? await db.historial_mensajes.findMany({
        where: { cliente_id: clienteId, paso_nodo: { in: [PASO_AGENTE, PASO_HUMANO] }, created_at: { gte: sesion.sesion_inicio } },
        orderBy: { id: "desc" },
        take: LIMITES.historialMensajes,
        select: { direccion: true, mensaje: true, paso_nodo: true, created_at: true, fotos_ref: true },
      })
    : [];
  const delCliente = historial.find((h) => h.direccion === "entrante")?.mensaje ?? "";
  const textoFijo = AVISO_DE_DEMORA.test(delCliente) ? null : TEXTO_FIJO;

  const gasto = await gastoDelMes(ahora, db).catch(() => 0);
  if (gasto >= topeConfigurado().topeUsd) return textoFijo;

  try {
    const cliente = await db.clientes.findUnique({ where: { id: clienteId } });
    const contexto = await contextoDelTurno({ root: db, cliente: cliente ?? { id: clienteId }, sesion, ahora, autoWeb: null, cobranza: null, historial });
    const conversacion = historialParaClaude([...historial].reverse());
    if (!conversacion.length) return null;
    const esfuerzo = esfuerzoEfectivo();
    const respuesta = await anthropic.messages.create(
      {
        model: MODELO,
        max_tokens: maxTokensPara(esfuerzo),
        system: [
          { type: "text", text: INSTRUCCIONES, cache_control: { type: "ephemeral" } },
          { type: "text", text: contextoDelMomento(contexto) },
          { type: "text", text: lineaDelRecordatorio(Math.round((ahora.getTime() - new Date(candidato.ultimo.created_at).getTime()) / MIN)) },
        ],
        // La conversación termina con la asesora: se cierra con un turno del cliente que dice que no contestó.
        messages: [...conversacion, { role: "user", content: "(El cliente todavía no respondió a tu último mensaje.)" }],
        output_config: { effort: esfuerzo },
      },
      OPCIONES_PEDIDO
    );
    await registrarConsumoClaude({ sesionId: sesion.id, clienteId, modelo: MODELO, usage: respuesta.usage }, db).catch((err) =>
      console.error("[recordatorio] no se pudo registrar el consumo:", err?.message)
    );
    if (respuesta.stop_reason !== "end_turn") return textoFijo;
    const texto = textoDeClaude(respuesta);
    if (new RegExp(`^${NO_CORRESPONDE}\\b`, "i").test(texto)) return null;
    // Nunca nombres internos ni un 👍 suelto, como en el resto de las respuestas.
    const limpio = sinPulgarSuelto(NOMBRES_HERRAMIENTAS.some((n) => texto.includes(n)) ? sinOracionesInternas(texto) : texto);
    return limpio ? sinSaludoInicial(limpio) : textoFijo;
  } catch (err) {
    console.error("[recordatorio] falló la IA, sale el texto fijo:", err?.status ?? "", err?.message);
    return textoFijo;
  }
}

// ── Envío ──

const sinPisar = (ahora) => ({ OR: [{ recordatorio_en: null }, { recordatorio_en: { lt: hace(ahora, MIN_ENTRE_RECORDATORIOS_H * 3_600_000) } }] });

// Corre dentro de la cola del número: así no pisa un mensaje que está llegando. Devuelve el texto enviado o null.
async function enviarRecordatorio({ db, candidato, ahora, minutos, anthropic, enviar, cola }) {
  const { sesion, clienteId, telefono, ultimo } = candidato;
  return cola(telefono, async () => {
    // El cliente pudo escribir mientras tanto: solo sigue si el último mensaje es el mismo del bot.
    const sigue = async () => {
      const actual = await ultimoMensajeDe(db, clienteId);
      return actual && String(actual.id) === String(ultimo.id);
    };
    if (!(await sigue())) return null;
    // Reserva atómica: la consulta queda evaluada haya o no recordatorio. Si no cambia ninguna fila, otro se adelantó.
    const { count } = await db.chat_estado.updateMany({ where: { id: sesion.id, ...sinPisar(ahora) }, data: { recordatorio_en: ahora } });
    if (count === 0) return null;
    const texto = await textoDelRecordatorio({ db, candidato, ahora, minutos, anthropic });
    if (!texto) return null;
    if (!(await sigue())) return null;
    let wamid;
    try {
      ({ wamid = null } = (await enviar({ telefono, texto })) ?? {});
    } catch (err) {
      // Meta rechazó o no respondió: no queda un mensaje fantasma y no se reintenta (la reserva queda).
      console.error("[recordatorio] no se pudo enviar:", err?.status ?? err?.name ?? "", err?.message);
      return null;
    }
    // No toca ultimo_mensaje, la temperatura ni el aviso al vendedor.
    await db.historial_mensajes.create({ data: { cliente_id: clienteId, direccion: "saliente", mensaje: texto, paso_nodo: PASO_AGENTE, created_at: ahora, wamid } }).catch((err) =>
      console.error("[recordatorio] salió pero no se pudo guardar en la charla:", err?.message)
    );
    return texto;
  });
}

/**
 * Una revisión: busca las consultas que corresponden y les manda el recordatorio. Devuelve lo enviado.
 * @returns {Promise<{ telefono: string, texto: string }[]>}
 */
export async function revisarRecordatorios({ ahora = new Date(), minutos = MINUTOS_POR_DEFECTO, root, anthropic, enviar = crearEnvioWhatsapp().enviarTexto, cola = enCola, soloTelefono = null }) {
  const candidatas = await consultasParaRecordar({ db: root, ahora, minutos, telefono: soloTelefono });
  const enviados = [];
  for (const candidato of candidatas) {
    try {
      const texto = await enviarRecordatorio({ db: root, candidato, ahora, minutos, anthropic, enviar, cola });
      if (texto) enviados.push({ telefono: candidato.telefono, texto });
    } catch (err) {
      console.error("[recordatorio] falló una consulta:", err?.message);
    }
  }
  return enviados;
}

// ── Arranque ──

/**
 * Revisa cada minuto, sin superponer revisiones. Devuelve null si queda apagado (RECORDATORIO_MINUTOS en 0 o
 * sin credenciales de WhatsApp). Nunca se arranca al importar un módulo: lo llama server.js.
 */
export function iniciarRecordatorios({ root, dbAgente, anthropic, enviar, env = process.env, setIntervalFn = setInterval, clearIntervalFn = clearInterval, ahora = () => new Date(), log = console } = {}) {
  const configurado = env.RECORDATORIO_MINUTOS;
  const minutos = configurado === undefined || configurado === "" ? MINUTOS_POR_DEFECTO : Number(configurado);
  if (!(minutos > 0)) return null;
  if (!env.WA_TOKEN || !env.WA_PHONE_NUMBER_ID) {
    log.warn("[recordatorio] apagado: falta WA_TOKEN o WA_PHONE_NUMBER_ID.");
    return null;
  }
  let enCurso = false;
  const revisar = async () => {
    if (enCurso) return;
    enCurso = true;
    try {
      await revisarRecordatorios({ ahora: ahora(), minutos, root, dbAgente, anthropic, enviar });
    } catch (err) {
      console.error("[recordatorio] falló la revisión:", err?.message);
    } finally {
      enCurso = false;
    }
  };
  const intervalo = setIntervalFn(revisar, CADA_MS);
  intervalo.unref?.();
  return { detener: () => clearIntervalFn(intervalo) };
}
