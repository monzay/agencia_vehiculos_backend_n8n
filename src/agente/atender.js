import { z } from "zod";
import { responderConIA } from "./agente.js";
import { duracionOgg, transcribirConGroq, MODELO_GROQ } from "./audio.js";
import { LIMITES, MENSAJES_FIJOS, decidirAtencion, audioPermitido, historialParaClaude, recortar } from "./limites.js";
import { puntaje, clasificar, pendientes, respondido } from "./calificacion.js";
import { consultaPorAuto } from "./consultas-por-auto.js";
import { datosDeLaWeb, linkDelCatalogo } from "./origen-web.js";
import { whereDisponible } from "./auto-publico.js";
import { enviosDeRespuesta, REACCION_CIERRE } from "./envios.js";
import { debeReaccionar } from "./cierre.js";
import { juntarRafaga, ESPERA_RAFAGA_MS } from "./rafagas.js";
import { PASO_AGENTE, PASO_REACCION } from "./pasos.js";
import { gastoDelMes, topeConfigurado, registrarConsumoClaude, registrarConsumoGroq } from "../services/ia-consumos.service.js";
import { avisoReciente, darDeBaja, esBaja, BAJA_CONFIRMADA } from "../services/avisos-cuotas.service.js";
import { resolverCliente } from "../services/clientes.service.js";

// Orquestador: lo que pasa cada vez que llega un mensaje de WhatsApp.
//   1. reconoce al cliente por su número de WhatsApp o por el teléfono de una ficha que ya existe (o lo crea);
//   2. revisa el tope del mes y los límites del cliente en el día;
//   3. llama al agente o responde el mensaje fijo;
//   4. guarda la conversación en el historial;
//   5. marca "requiere vendedor" cuando corresponde.
// Corre con el usuario de base del backend (`root`); el agente usa el suyo, limitado.

const DESFASE_AR_MS = 3 * 3_600_000;
const SESION_VIGENTE_MS = 24 * 3_600_000;
const MAX_TEXTO_WHATSAPP = 4096;
const MAX_ARCHIVO_BASE64 = 7_000_000; // ~5 MB, el máximo que acepta Claude por imagen
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const BYTES_AUDIO_MIN = 100; // menos que esto no es un audio: no se manda a Groq

const archivoBase64 = (tipos) =>
  z.object({ media_type: z.enum(tipos), data: z.string().max(MAX_ARCHIVO_BASE64).regex(BASE64) });


const MOTIVOS = {
  tope: "Se alcanzó el tope de gasto de IA del mes.",
  limite_cliente: "El cliente superó el límite de mensajes del día.",
  gasto_cliente: "El cliente superó el gasto de IA permitido en el día.",
};

const entradaSchema = z.object({
  telefono: z.union([z.string(), z.number()]),
  wamid: z.string().max(128).nullish(),
  nombre: z.string().max(200).nullish(),
  texto: z.string().max(MAX_TEXTO_WHATSAPP).nullish(),
  imagenes: z
    .array(archivoBase64(["image/jpeg", "image/png", "image/gif", "image/webp"]))
    .max(3)
    .default([]),
  // Formatos que lee Groq; las notas de voz de WhatsApp son audio/ogg.
  audio: archivoBase64(["audio/ogg", "audio/mpeg", "audio/mp4"]).nullish(),
  ahora: z.date().optional(),
});

function inicioDiaAR(ahora) {
  const enAR = new Date(ahora.getTime() - DESFASE_AR_MS);
  return new Date(Date.UTC(enAR.getUTCFullYear(), enAR.getUTCMonth(), enAR.getUTCDate(), 3));
}

function telefonoValido(telefono) {
  const limpio = String(telefono ?? "").replace(/\D/g, "");
  if (limpio.length < 8 || limpio.length > 15) throw new Error("Número de WhatsApp inválido.");
  return limpio;
}

// Mensajes del mismo número, de a uno: así los conteos del día y el historial
// ven siempre el mensaje anterior. Alcanza mientras el backend sea un solo proceso.
const colas = new Map();
function deAUno(clave, tarea) {
  const actual = (colas.get(clave) ?? Promise.resolve()).then(tarea);
  const cola = actual.catch(() => {});
  colas.set(clave, cola);
  cola.then(() => colas.get(clave) === cola && colas.delete(clave));
  return actual;
}

// El auto del mensaje predefinido de la web: si está disponible pasa a ser el de
// interés; si no, el agente lo sabe y ofrece parecidos.
async function autoDeLaWeb(root, ref) {
  if (!ref) return null;
  const [auto, disponible] = await Promise.all([
    root.autos.findFirst({ where: { ref, deleted_at: null }, select: { id: true, marca: true, modelo: true, anio: true } }),
    root.autos.findFirst({ where: { ...whereDisponible(), ref }, select: { id: true } }),
  ]);
  if (!auto) return null;
  return { id: auto.id, ref, descripcion: [auto.marca, auto.modelo, auto.anio].filter(Boolean).join(" "), disponible: Boolean(disponible) };
}

// El asesor cuyo link trajo al cliente se queda con la consulta (como en el bot anterior).
async function asesorDeLaWeb(root, slug) {
  if (!slug) return {};
  const vendedor = await root.vendedores.findFirst({ where: { slug, activo: true, deleted_at: null }, select: { id: true } });
  return { vendedor_id: vendedor?.id ?? null, atribuido: Boolean(vendedor) };
}

// Desde la web por un auto: si la consulta abierta no tenía auto, ese pasa a ser el
// de interés y suma sus puntos; si era por otro, va en su propia consulta.
async function conAutoDeLaWeb(root, { sesion, clienteId, ahora }, auto) {
  if (!auto?.disponible || sesion.auto_id === auto.id) return sesion;
  if (sesion.auto_id != null) {
    const id = await consultaPorAuto({ db: root, clienteId, sesionId: sesion.id, ahora }, auto.id);
    return root.chat_estado.findUnique({ where: { id } });
  }
  const conAuto = { ...sesion, auto_id: auto.id };
  const temperatura = { score: puntaje(conAuto), clasificacion: clasificar(conAuto) };
  await root.chat_estado.update({ where: { id: sesion.id }, data: { auto_id: auto.id, ...temperatura } });
  return { ...conAuto, ...temperatura };
}

// La conversación sigue en la misma sesión mientras haya actividad en las
// últimas 24 h; si no, empieza una nueva. Con una consulta por auto, sigue en la
// del último mensaje.
async function sesionDe(root, clienteId, ahora, web) {
  const ultima = await root.chat_estado.findFirst({ where: { cliente_id: clienteId }, orderBy: [{ ultimo_mensaje: "desc" }, { id: "desc" }] });
  const actividad = ultima?.ultimo_mensaje ?? ultima?.sesion_inicio;
  const vigente = actividad && ahora - new Date(actividad) < SESION_VIGENTE_MS;
  if (vigente) return conAutoDeLaWeb(root, { sesion: ultima, clienteId, ahora }, web.auto);
  // Nace fría, con los puntos de lo que ya se sabe (el auto si viene de la web).
  const inicial = web.auto?.disponible ? { auto_id: web.auto.id } : {};
  return root.chat_estado.create({
    data: {
      cliente_id: clienteId,
      origen: web.ref ? "web" : "whatsapp",
      ultimo_mensaje: ahora,
      ...inicial,
      score: puntaje(inicial),
      clasificacion: clasificar(inicial),
      ...(await asesorDeLaWeb(root, web.asesor)),
    },
  });
}

async function verificarCupo({ root, cliente, ahora, paso }, topeUsd) {
  const clienteId = cliente.id;
  const desdeHoy = { gte: inicioDiaAR(ahora) };
  const [mensajesHoy, delCliente, gastoMesUsd] = await Promise.all([
    root.historial_mensajes.count({ where: { cliente_id: clienteId, direccion: "entrante", paso_nodo: paso, created_at: desdeHoy } }),
    root.ia_consumos.aggregate({
      where: { cliente_id: clienteId, created_at: desdeHoy },
      _sum: { costo_usd: true },
      _count: true,
    }),
    gastoDelMes(ahora, root),
  ]);
  return decidirAtencion({
    gastoMesUsd,
    topeUsd,
    mensajesHoy,
    clienteHabloHoy: delCliente._count > 0,
    gastoClienteHoyUsd: Number(delCliente._sum.costo_usd ?? 0),
  });
}

const guardarMensaje = ({ root, cliente, paso }, direccion, mensaje, fecha, wamid = null) =>
  root.historial_mensajes.create({
    data: { cliente_id: cliente.id, direccion, mensaje, paso_nodo: paso, created_at: fecha, wamid },
  });

const unMsDespues = (fecha) => new Date(fecha.getTime() + 1);

// Datos de la sesión al cerrar el turno; al vendedor se lo marca una sola vez.
const cierreDeSesion = (sesion, ahora, motivo) => ({
  ultimo_mensaje: ahora,
  ...(motivo &&
    !sesion.requiere_vendedor && {
      requiere_vendedor: true,
      requiere_vendedor_motivo: motivo.slice(0, 120),
      requiere_vendedor_at: ahora,
    }),
});

// Cada mensaje de una ráfaga se guarda con su id: así un reintento de Meta no se
// vuelve a responder. Van en orden.
async function guardarEntrantes(turno) {
  for (const { mensaje, wamid } of turno.entrantes) {
    await guardarMensaje(turno, "entrante", mensaje, turno.ahora, wamid);
  }
}

const conUltimo = (entrantes, mensaje) => [...entrantes.slice(0, -1), { ...entrantes.at(-1), mensaje }];

async function responderFijo(turno, respuesta, motivo) {
  const { root, sesion, ahora } = turno;
  await guardarEntrantes(turno);
  await root.chat_estado.update({ where: { id: sesion.id }, data: cierreDeSesion(sesion, ahora, motivo) });
  await guardarMensaje(turno, "saliente", respuesta, unMsDespues(ahora));
  return { texto: respuesta, fotos: [], envios: enviosDeRespuesta({ texto: respuesta }), conIA: false };
}

// Despedida con la charla cerrada: 👍 al mensaje del cliente, sin IA y gratis.
async function reaccionar(turno) {
  const { root, sesion, ahora, wamid } = turno;
  await guardarEntrantes(turno);
  await Promise.all([
    guardarMensaje({ ...turno, paso: PASO_REACCION }, "saliente", REACCION_CIERRE, unMsDespues(ahora)),
    root.chat_estado.update({ where: { id: sesion.id }, data: { ultimo_mensaje: ahora } }),
  ]);
  return { texto: null, fotos: [], envios: enviosDeRespuesta({ reaccion: REACCION_CIERRE, wamid }), conIA: false };
}

// Las condiciones baratas primero; lo último que dijo Agustina se busca solo si hace falta.
async function correspondeReaccionar({ root, cliente, sesion }, texto, datos) {
  if (datos.audio || datos.imagenes.length) return false;
  if (!debeReaccionar({ texto, sesion, ultimaRespuesta: null })) return false;
  const ultima = await root.historial_mensajes.findFirst({
    where: { cliente_id: cliente.id, direccion: "saliente", paso_nodo: PASO_AGENTE },
    orderBy: { id: "desc" },
    select: { mensaje: true },
  });
  return debeReaccionar({ texto, sesion, ultimaRespuesta: ultima?.mensaje });
}

// Después de gastar en Claude la respuesta sale igual: un fallo al guardar queda en el log.
// Si la IA pasó a la consulta de otro auto, el turno se cierra en esa.
async function cerrarTurno(turno, r) {
  const { root, ahora } = turno;
  const sesion = r.sesionId ? { id: r.sesionId } : turno.sesion;
  const motivo = r.derivar ? `El agente no pudo responder (${r.motivo}).` : null;
  const resultados = await Promise.allSettled([
    guardarMensaje(turno, "saliente", r.texto, unMsDespues(ahora)),
    root.chat_estado.update({ where: { id: sesion.id }, data: cierreDeSesion(sesion, ahora, motivo) }),
  ]);
  for (const fallo of resultados.filter((x) => x.status === "rejected")) {
    console.error("[agente] no se pudo guardar el cierre del turno:", fallo.reason?.message);
  }
}

// El mensaje del cliente como contenido para Claude: fotos y texto.
function contenidoNuevo({ texto, imagenes }) {
  const bloques = imagenes.map((img) => ({
    type: "image",
    source: { type: "base64", media_type: img.media_type, data: img.data },
  }));
  return texto ? [...bloques, { type: "text", text: texto }] : bloques;
}

function conversacionParaClaude(filas, nuevo) {
  const turnos = historialParaClaude(filas);
  const ultimo = turnos.at(-1);
  if (ultimo?.role !== "user") return [...turnos, { role: "user", content: nuevo }];
  return [...turnos.slice(0, -1), { role: "user", content: [{ type: "text", text: ultimo.content }, ...nuevo] }];
}

// Lo que el agente necesita saber en este mensaje: la agencia (nombre, dirección,
// mapa) y en qué punto del recorrido de venta está el cliente.
async function contextoDelTurno({ root, cliente, sesion, ahora, autoWeb, cobranza }) {
  const [usado, ubicacion] = await Promise.all([
    root.vehiculo_cliente.findFirst({ where: { sesion_id: sesion.id, contexto: "trade_in", deleted_at: null } }),
    root.ubicacion.findUnique({ where: { id: 1 }, select: { nombre: true, direccion: true, maps_url: true } }),
  ]);
  return {
    asesora: process.env.AGENTE_NOMBRE,
    agencia: ubicacion?.nombre || process.env.AGENCIA_NOMBRE,
    direccion: ubicacion?.direccion,
    mapsUrl: ubicacion?.maps_url,
    ahora,
    nombreCliente: cliente.nombre,
    catalogoUrl: linkDelCatalogo(process.env.PUBLIC_WEB_URL),
    consultaWeb: autoWeb && { descripcion: autoWeb.descripcion, ref: autoWeb.ref, disponible: autoWeb.disponible },
    cobranza,
    respondido: respondido(sesion, usado),
    faltan: pendientes(sesion, usado),
  };
}

async function responderConAgente(turno, imagenes, deps) {
  const { root, cliente, sesion, ahora, entrante, texto, wamid } = turno;
  const historial = await root.historial_mensajes.findMany({
    where: { cliente_id: cliente.id, paso_nodo: turno.paso },
    orderBy: { id: "desc" },
    take: LIMITES.historialMensajes,
    select: { direccion: true, mensaje: true },
  });
  // Se guarda antes de llamar a Claude: el mensaje ya cuenta para el límite del día.
  await guardarEntrantes(turno);
  const nuevo = contenidoNuevo({ texto, imagenes });
  const r = await responderConIA(
    {
      mensajes: conversacionParaClaude([...historial].reverse(), nuevo.length ? nuevo : [{ type: "text", text: entrante }]),
      contexto: await contextoDelTurno(turno),
      ctx: {
        db: deps.dbAgente,
        clienteId: cliente.id,
        sesionId: sesion.id,
        urlPublica: process.env.PUBLIC_WEB_URL,
        ahora,
        // Abrir o retomar la consulta de otro auto: con el usuario del backend, solo para este cliente.
        consultaPorAuto: (sesionId, autoId) => consultaPorAuto({ db: root, clienteId: cliente.id, sesionId, ahora }, autoId),
        cobranza: turno.cobranza && { financiacionId: turno.cobranza.financiacionId, avisoId: turno.cobranza.avisoId },
      },
      registrarConsumo: ({ modelo, usage }) =>
        registrarConsumoClaude({ sesionId: sesion.id, clienteId: cliente.id, modelo, usage }, root),
    },
    { anthropic: deps.anthropic }
  );
  // Si Agustina solo contesta 👍 (el cliente agradeció), sale como reacción: gratis.
  const reaccion = r.ok && r.texto?.trim() === REACCION_CIERRE ? REACCION_CIERRE : null;
  await cerrarTurno(reaccion ? { ...turno, paso: PASO_REACCION } : turno, r);
  return {
    texto: reaccion ? null : r.texto,
    fotos: r.fotos,
    envios: enviosDeRespuesta({ texto: r.texto, fotos: r.fotos, ficha: r.ficha, reaccion, wamid }),
    conIA: true,
  };
}

// La duración del encabezado ogg la controla quien manda el audio: sirve para no
// pagar por audios que se ven largos, pero el costo real se toma de lo que mide Groq.
function audioRecibido({ media_type, data }) {
  const buffer = Buffer.from(data, "base64");
  const duracion = media_type === "audio/ogg" ? duracionOgg(buffer) : null;
  const largo = buffer.length > LIMITES.bytesAudioMax || (duracion != null && !audioPermitido(duracion));
  return { buffer, mediaType: media_type, duracion, largo, vacio: buffer.length < BYTES_AUDIO_MIN };
}

const transcribirPorDefecto = (audio) => transcribirConGroq(audio, { apiKey: process.env.GROQ_API_KEY });

// Devuelve el texto ("" si no se pudo) y los segundos facturados, que suman al tope.
async function transcribirAudio({ root, cliente, sesion }, audio, transcribir = transcribirPorDefecto) {
  const resultado = await transcribir({ buffer: audio.buffer, mediaType: audio.mediaType }).catch((err) => {
    console.error("[agente] no se pudo transcribir el audio:", err?.message);
    return null;
  });
  if (!resultado) return { texto: "", segundos: 0 };
  // Groq factura lo que decodifica: se registra el mayor entre lo medido y lo informado.
  const segundos = Math.max(audio.duracion ?? 0, resultado.segundos ?? 0) || LIMITES.segundosAudioMax;
  await registrarConsumoGroq({ sesionId: sesion.id, clienteId: cliente.id, modelo: MODELO_GROQ, segundos }, root).catch((err) =>
    console.error("[agente] no se pudo registrar el consumo de Groq:", err?.message, segundos)
  );
  return { texto: recortar(resultado.texto), segundos };
}

async function responderAudio(base, audio, imagenes, deps, textoPrevio) {
  const fijo = (mensaje) => responderFijo({ ...base, entrante: "[audio]" }, mensaje);
  if (audio.largo) return fijo(MENSAJES_FIJOS.audioLargo);
  if (audio.vacio) return fijo(MENSAJES_FIJOS.audioIlegible);
  const { texto, segundos } = await transcribirAudio(base, audio, deps.transcribir);
  if (segundos > LIMITES.segundosAudioMax) return fijo(MENSAJES_FIJOS.audioLargo);
  if (!texto) return fijo(MENSAJES_FIJOS.audioIlegible);
  // La nota de voz llega sola (WhatsApp no manda texto con un audio); si antes
  // escribió algo en la misma ráfaga, va adelante.
  const transcripcion = `[audio] ${texto}`;
  const unido = [textoPrevio, transcripcion].filter(Boolean).join("\n");
  return responderConAgente({ ...base, entrantes: conUltimo(base.entrantes, transcripcion), entrante: unido, texto: unido }, imagenes, deps);
}

async function atender(datos, deps) {
  const { root } = deps;
  const ahora = datos.ahora ?? new Date();
  // Con `root` y no con un `tx`: si otro mensaje del mismo número gana la carrera, `resolverCliente`
  // vuelve a buscar y tiene que ver su ficha ya confirmada.
  const { cliente } = await resolverCliente(
    { canal: "whatsapp", identificador: datos.telefono, telefono: datos.telefono, nombre: datos.nombre },
    root
  );
  const web = datosDeLaWeb(datos.texto);
  const autoWeb = await autoDeLaWeb(root, web.ref);
  const sesion = await sesionDe(root, cliente.id, ahora, { ...web, auto: autoWeb });
  const texto = recortar(web.texto);
  const marcaArchivo = datos.imagenes.length ? "[foto]" : datos.audio ? "[audio]" : "[mensaje sin texto]";
  const entrante = texto || marcaArchivo;
  const partes = datos.partes ?? [{ texto: datos.texto ?? null, wamid: datos.wamid ?? null }];
  const entrantes = partes.map((p, i) => ({
    mensaje: recortar(datosDeLaWeb(p.texto).texto) || (i === partes.length - 1 ? marcaArchivo : "[mensaje sin texto]"),
    wamid: p.wamid,
  }));
  const base = { root, cliente, sesion, ahora, wamid: datos.wamid ?? null, paso: PASO_AGENTE, autoWeb, entrantes };

  // BAJA a un recordatorio de cuota: regla fija, sin IA.
  if (esBaja(texto) && (await darDeBaja({ db: root, telefono: datos.telefono, ahora }))) {
    return responderFijo({ ...base, entrante }, BAJA_CONFIRMADA);
  }
  const turno = { ...base, cobranza: await avisoReciente({ db: root, telefono: datos.telefono, ahora }) };

  if (await correspondeReaccionar(turno, texto, datos)) return reaccionar(turno);

  const decision = await verificarCupo(turno, deps.topeUsd ?? topeConfigurado().topeUsd);
  if (!decision.conIA) return responderFijo({ ...turno, entrante }, MENSAJES_FIJOS.sinCupo, MOTIVOS[decision.motivo]);
  if (datos.audio) return responderAudio(turno, audioRecibido(datos.audio), datos.imagenes, deps, texto);
  return responderConAgente({ ...turno, entrante, texto }, datos.imagenes, deps);
}

const DUPLICADO = { duplicado: true, texto: null, fotos: [], envios: [], conIA: false };
// Llegó en una ráfaga y la responde el último mensaje, con todos juntos.
const JUNTADO = { juntado: true, texto: null, fotos: [], envios: [], conIA: false };

const choqueDeWamid = (err) => err?.code === "P2002" && String(err.meta?.target ?? "").includes("wamid");

// Saca de la ráfaga los mensajes ya guardados (reintentos). Si se cae el último,
// también su archivo: solo el último puede traerlo.
async function sinRepetidos(lote, root) {
  const ids = lote.partes.map((p) => p.wamid).filter(Boolean);
  if (!ids.length) return lote;
  const guardados = await root.historial_mensajes.findMany({ where: { wamid: { in: ids } }, select: { wamid: true } });
  if (!guardados.length) return lote;
  const vistos = new Set(guardados.map((g) => g.wamid));
  const partes = lote.partes.filter((p) => !p.wamid || !vistos.has(p.wamid));
  if (!partes.length) return null;
  const sigueElUltimo = partes.at(-1) === lote.partes.at(-1);
  return {
    ...lote,
    partes,
    texto: partes.map((p) => p.texto).filter(Boolean).join("\n") || null,
    wamid: partes.at(-1).wamid,
    ...(!sigueElUltimo && { imagenes: [], audio: null }),
  };
}

// Meta y n8n pueden reintentar: un mensaje ya guardado no se vuelve a procesar.
// Dentro de este proceso lo frena la cola; entre procesos, el índice único.
async function atenderUnaVez(lote, deps) {
  const datos = await sinRepetidos(lote, deps.root);
  if (!datos) return DUPLICADO;
  try {
    return await atender(datos, deps);
  } catch (err) {
    if (choqueDeWamid(err)) return DUPLICADO;
    throw err;
  }
}

// `ahora` y `topeUsd` existen solo para los tests: el webhook nunca los toma del mensaje.
export async function atenderMensaje(entrada, deps) {
  const datos = entradaSchema.parse(entrada);
  const telefono = telefonoValido(datos.telefono);
  // Mensajes seguidos del mismo número: los responde el último, todos juntos.
  const lote = await juntarRafaga(telefono, { ...datos, telefono }, deps.esperaRafagaMs ?? ESPERA_RAFAGA_MS);
  if (!lote) return JUNTADO;
  return deAUno(telefono, () => atenderUnaVez(lote, deps));
}
