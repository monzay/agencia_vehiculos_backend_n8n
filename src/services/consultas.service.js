import { prisma } from "../lib/prisma.js";
import { SESION_UTIL } from "../lib/consultas-utiles.js";
import { NINGUNA } from "../lib/alcance-consultas.js";
import { telefonosParaBuscar } from "../lib/busqueda-telefono.js";
import { mapConsultaResumen, mapConsultaVenta, mapMensaje, construirRespuestas } from "../mappers/consulta.mapper.js";
import { INCLUDE_AVANCE } from "./consulta-avance.service.js";
import { ULTIMA_CONSULTA_CREDITICIA } from "./leads.service.js";
import { PASO_HUMANO } from "../agente/pasos.js";
import { crearEnvioWhatsapp } from "../agente/whatsapp-envio.js";
import { telefonoWhatsApp } from "./avisos-cuotas.service.js";

// WhatsApp solo deja enviar texto libre dentro de las 24 h desde el último mensaje del cliente.
const VENTANA_ATENCION_MS = 24 * 60 * 60 * 1000;
const MAX_TEXTO = 4096;

const dentroDeVentana = (fecha, ahora = new Date()) =>
  fecha ? ahora.getTime() - new Date(fecha).getTime() < VENTANA_ATENCION_MS : false;

// `cliente_canales` guarda solo los de mensajería; "web" existe únicamente en la ficha.
const CANALES_MENSAJERIA = ["whatsapp", "facebook", "instagram"];
const CANALES = [...CANALES_MENSAJERIA, "web"];

const CLASIFICACIONES = ["CALIENTE", "TIBIO", "FRIO"];

// Las consultas de venta/consignación se listan aparte (filtro "Tipo" de la
// sección Consultas, ver `listarConsultasVenta`), así que acá van solo las de compra. `tipo_lead` es NULL
// en la mayoría de las consultas, y en SQL `<> 'venta'` no matchea NULL, por eso
// el NULL se contempla explícitamente.
const SIN_VENTA = { OR: [{ tipo_lead: null }, { tipo_lead: { not: "venta" } }] };

// El teléfono se guarda con 10 dígitos, pero se busca pegándolo como venga (+54 9 388…).
const filtrosPorTelefono = (termino) =>
  telefonosParaBuscar(termino).map((telefono) => ({ clientes: { telefono: { contains: telefono } } }));

// Arma el `where` de búsqueda POR COINCIDENCIA sobre toda la base de datos:
// cruza el cliente (nombre/teléfono/canal), el vehículo de interés
// (ref/marca/modelo/año) y el asesor asignado. Como `auto_id` y `vendedor_id`
// no son relaciones Prisma de la sesión, primero se resuelven sus ids
// coincidentes y se cruzan por id.
async function construirFiltroBusqueda(termino) {
  const anio = /^\d{4}$/.test(termino) ? Number(termino) : null;

  const [autos, vendedores] = await Promise.all([
    prisma.autos.findMany({
      where: {
        OR: [
          { ref: { contains: termino } },
          { marca: { contains: termino } },
          { modelo: { contains: termino } },
          ...(anio != null ? [{ anio }] : []),
        ],
      },
      select: { id: true },
    }),
    prisma.vendedores.findMany({
      where: { nombre: { contains: termino } },
      select: { id: true },
    }),
  ]);

  const canales = CANALES.filter((c) => c.includes(termino.toLowerCase()));
  const canalesMensajeria = canales.filter((c) => CANALES_MENSAJERIA.includes(c));

  const OR = [{ clientes: { nombre: { contains: termino } } }, ...filtrosPorTelefono(termino)];
  // Una ficha fusionada puede decir "web" y tener WhatsApp: se encuentra por cualquiera de los dos.
  if (canales.length) OR.push({ clientes: { canal: { in: canales } } });
  if (canalesMensajeria.length) OR.push({ clientes: { canales: { some: { canal: { in: canalesMensajeria } } } } });
  if (autos.length) OR.push({ auto_id: { in: autos.map((a) => a.id) } });
  if (vendedores.length) OR.push({ vendedor_id: { in: vendedores.map((v) => v.id) } });

  return { OR };
}

// LISTA liviana PAGINADA (lazy loading con "Ver más"): una consulta por sesión,
// sin mensajes. `offset` = cuántas saltar, `limite` = tamaño del bloque.
// `q` busca por coincidencia en toda la base (cliente/vehículo/asesor).
// `clasif` = CALIENTE|TIBIO|FRIO. Las de venta/consignación se excluyen (van en
// su propia sección). Los filtros se combinan con AND, así que el total y la
// paginación los respetan. Devuelve { items, hayMas, total }.
// `alcance` (ver lib/alcance-consultas) acota lo que el usuario puede ver; sin él no se ve ninguna.
export async function listarConsultas({ limite = 20, offset = 0, q = "", clasif = "", alcance = NINGUNA } = {}) {
  const take = Math.max(1, Number(limite) || 20);
  const skip = Math.max(0, Number(offset) || 0);
  const termino = String(q || "").trim();

  // Las consultas vacías nunca se listan ni suman al total.
  const filtros = [alcance, SESION_UTIL, SIN_VENTA];
  if (termino) filtros.push(await construirFiltroBusqueda(termino));
  if (CLASIFICACIONES.includes(clasif)) filtros.push({ clasificacion: clasif });
  const where = { AND: filtros };

  // Se pide 1 de más para saber si quedan más páginas sin otra query.
  const [sesiones, total] = await Promise.all([
    prisma.chat_estado.findMany({
      where,
      // El mapper muestra `canales[0]`: ordenados por id, el canal de una persona con varios es siempre el mismo.
      include: {
        clientes: {
          include: { canales: { select: { canal: true }, orderBy: { id: "asc" } }, consultas_crediticias: ULTIMA_CONSULTA_CREDITICIA },
        },
        ...INCLUDE_AVANCE,
      },
      // La lista sube lo que tuvo novedad (se abrió, cambió de auto, el cliente volvió a escribir
      // en una atendida, pasó a otro asesor por link).
      orderBy: [{ orden_at: "desc" }, { id: "desc" }],
      skip,
      take: take + 1,
    }),
    prisma.chat_estado.count({ where }),
  ]);
  const hayMas = sesiones.length > take;
  const pagina = hayMas ? sesiones.slice(0, take) : sesiones;

  const autoIds = [...new Set(pagina.map((s) => s.auto_id).filter((v) => v != null))];
  const autos = autoIds.length
    ? await prisma.autos.findMany({ where: { id: { in: autoIds } } })
    : [];
  const autoMap = Object.fromEntries(autos.map((a) => [a.id, a]));

  // Asesor asignado a cada consulta (sesiones.vendedor_id → vendedores). No hay
  // relación Prisma en el modelo, así que se resuelve por lote como los autos.
  const vendedorIds = [...new Set(pagina.map((s) => s.vendedor_id).filter((v) => v != null))];
  const vendedores = vendedorIds.length
    ? await prisma.vendedores.findMany({ where: { id: { in: vendedorIds } }, select: { id: true, nombre: true } })
    : [];
  const vendedorMap = Object.fromEntries(vendedores.map((v) => [v.id, v]));

  const items = pagina.map((s) =>
    mapConsultaResumen(s, s.clientes, autoMap[s.auto_id] ?? null, vendedorMap[s.vendedor_id] ?? null)
  );
  return { items, hayMas, total };
}

// Búsqueda para el listado de venta/consignación: por cliente (nombre/teléfono)
// y por el vehículo que ofrece (vive en `vehiculo_cliente`, contexto 'venta').
function filtroBusquedaVenta(termino) {
  const anio = /^\d{4}$/.test(termino) ? Number(termino) : null;
  return {
    OR: [
      { clientes: { nombre: { contains: termino } } },
      ...filtrosPorTelefono(termino),
      {
        vehiculo_cliente: {
          some: {
            contexto: "venta",
            OR: [
              { marca: { contains: termino } },
              { modelo: { contains: termino } },
              ...(anio != null ? [{ anio }] : []),
            ],
          },
        },
      },
    ],
  };
}

// LISTA paginada de consultas de VENTA/CONSIGNACIÓN: una fila por sesión (como la
// sección Consultas, pero para los leads que quieren vender). `tipo_lead='venta'`
// abarca venta directa y consignación (la modalidad las distingue). `q` busca por
// cliente y por el vehículo ofrecido. Ordenadas por más recientes.
// Solo las COMPLETAS (paso 'handoff' = respondió todas las preguntas del bot):
// las abandonadas a mitad del flujo no son una consulta real.
// `modalidad` = venta | consignacion. Las anteriores a que el bot lo preguntara
// (NULL) se listan con las de venta directa: si no, no aparecerían en ningún lado.
export async function listarConsultasVenta({ limite = 10, offset = 0, q = "", modalidad = "", alcance = NINGUNA } = {}) {
  const take = Math.max(1, Number(limite) || 10);
  const skip = Math.max(0, Number(offset) || 0);
  const termino = String(q || "").trim();

  const filtros = [alcance, { tipo_lead: "venta", paso_actual: "handoff" }];
  if (modalidad === "consignacion") filtros.push({ modalidad_venta: "consignacion" });
  if (modalidad === "venta") filtros.push({ OR: [{ modalidad_venta: "venta" }, { modalidad_venta: null }] });
  if (termino) filtros.push(filtroBusquedaVenta(termino));
  const where = { AND: filtros };

  const [sesiones, total] = await Promise.all([
    prisma.chat_estado.findMany({
      where,
      include: { clientes: true, vehiculo_cliente: true },
      // Misma regla que la lista principal: sube lo que tuvo novedad.
      orderBy: [{ orden_at: "desc" }, { id: "desc" }],
      skip,
      take: take + 1,
    }),
    prisma.chat_estado.count({ where }),
  ]);
  const hayMas = sesiones.length > take;
  const pagina = hayMas ? sesiones.slice(0, take) : sesiones;
  return { items: pagina.map((s) => mapConsultaVenta(s, s.clientes)), hayMas, total };
}

// DETALLE: el chat completo de UNA consulta (entrantes del cliente y salientes
// del bot y de una persona). Como `historial_mensajes` guarda por cliente, se
// acota a la ventana de tiempo de esa sesión: desde su inicio hasta el inicio de
// la sesión siguiente del mismo cliente (la primera sesión toma también lo anterior a ella).
export async function obtenerConsulta(sesionId, alcance = NINGUNA) {
  // `sesionId` viene de la URL: un id no numérico debe dar 404, no reventar Prisma.
  const id = Number(sesionId);
  if (!Number.isInteger(id) || id <= 0) return null;

  const sesion = await prisma.chat_estado.findFirst({
    where: { id, ...alcance },
    include: { vehiculo_cliente: true, clientes: { select: { cuil: true } } },
  });
  if (!sesion) return null;

  // Sesiones del mismo cliente ordenadas por inicio, para calcular la ventana.
  const hermanas = await prisma.chat_estado.findMany({
    where: { cliente_id: sesion.cliente_id },
    orderBy: { sesion_inicio: "asc" },
    select: { id: true, sesion_inicio: true },
  });
  const idx = hermanas.findIndex((h) => h.id === sesion.id);
  const esPrimera = idx === 0;
  const inicio = sesion.sesion_inicio;
  const inicioSiguiente =
    idx >= 0 && idx + 1 < hermanas.length ? hermanas[idx + 1].sesion_inicio : null;

  const rango = {};
  if (!esPrimera && inicio) rango.gte = inicio;
  if (inicioSiguiente) rango.lt = inicioSiguiente;

  const mensajes = await prisma.historial_mensajes.findMany({
    where: {
      cliente_id: sesion.cliente_id,
      ...(Object.keys(rango).length ? { created_at: rango } : {}),
    },
    orderBy: [{ created_at: "asc" }, { id: "asc" }],
    select: { id: true, direccion: true, mensaje: true, paso_nodo: true, created_at: true },
  });

  const ultimoEntrante = [...mensajes].reverse().find((m) => m.direccion === "entrante");

  return {
    sesionId: sesion.id,
    // Preguntas→respuestas identificadas desde lo que el bot guardó estructurado.
    respuestas: construirRespuestas(sesion, sesion.vehiculo_cliente ?? [], sesion.clientes),
    // El chat completo, en orden: cada mensaje con su `autor` (cliente | bot | humano).
    chat: mensajes.map(mapMensaje),
    // Solo los mensajes crudos del cliente (verbatim), con la pregunta que respondían.
    mensajes: mensajes.filter((m) => m.direccion === "entrante").map(mapMensaje),
    // ¿La tomó una persona? ¿Se puede enviar texto libre (ventana de 24 h abierta)?
    botPausado: Boolean(sesion.bot_pausado),
    ventanaAbierta: dentroDeVentana(ultimoEntrante?.created_at),
  };
}

// Marca/desmarca una consulta como ATENDIDA. Guarda cuándo y quién la marcó.
// Devuelve null si la sesión no existe o está fuera del alcance del usuario.
export async function marcarConsultaAtendida(sesionId, atendido, usuario, alcance = NINGUNA) {
  const id = Number(sesionId);
  const sesion = await prisma.chat_estado.findFirst({ where: { id, ...alcance } });
  if (!sesion) return null;

  // Se usa NOW() de MySQL (hora local de la agencia) para ser consistente con el
  // resto de las fechas guardadas por el bot.
  if (atendido) {
    await prisma.$executeRawUnsafe(
      "UPDATE sesiones SET atendido_at = NOW(), atendido_por = ? WHERE id = ?",
      usuario?.nombre ?? null,
      id
    );
  } else {
    await prisma.$executeRawUnsafe("UPDATE sesiones SET atendido_at = NULL, atendido_por = NULL WHERE id = ?", id);
  }

  const upd = await prisma.chat_estado.findUnique({ where: { id } });
  return {
    sesionId: upd.id,
    atendido: upd.atendido_at
      ? { at: new Date(upd.atendido_at).toISOString(), por: upd.atendido_por ?? null }
      : null,
  };
}

// Instancia por defecto para enviar por WhatsApp; en los tests se inyecta una falsa.
const envioWhatsapp = crearEnvioWhatsapp();

// La ventana de atención de WhatsApp está abierta si el cliente escribió hace menos de 24 h.
export async function ventanaAbierta(clienteId, ahora = new Date()) {
  const ultimo = await prisma.historial_mensajes.findFirst({
    where: { cliente_id: clienteId, direccion: "entrante" },
    orderBy: { created_at: "desc" },
    select: { created_at: true },
  });
  return dentroDeVentana(ultimo?.created_at, ahora);
}

// Responde al cliente desde el panel (intervención humana). En orden:
//   1. valida el texto;
//   2. busca la sesión y su teléfono (no_encontrada si no está);
//   3. revisa la ventana de 24 h (si está cerrada, no envía);
//   4. envía por WhatsApp — si Meta rechaza, corta sin guardar nada;
//   5. toma la conversación (bot_pausado), la marca atendida y guarda el saliente humano.
// Devuelve `{ ok, ... }` con un `codigo` cuando no se pudo, para que el controller elija el estado.
export async function responderComoHumano(sesionId, texto, usuario, { enviar = envioWhatsapp, ahora = new Date(), alcance = NINGUNA } = {}) {
  const id = Number(sesionId);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, codigo: "no_encontrada" };
  const limpio = String(texto ?? "").trim();
  if (!limpio || limpio.length > MAX_TEXTO) return { ok: false, codigo: "texto_invalido" };

  const sesion = await prisma.chat_estado.findFirst({
    where: { id, ...alcance },
    include: { clientes: { select: { id: true, telefono: true } } },
  });
  if (!sesion) return { ok: false, codigo: "no_encontrada" };
  // En la ficha van 10 dígitos; Meta lo necesita con el código de país.
  const telefono = telefonoWhatsApp(sesion.clientes?.telefono);
  if (!telefono) return { ok: false, codigo: "sin_telefono" };

  if (!(await ventanaAbierta(sesion.cliente_id, ahora))) return { ok: false, codigo: "ventana_cerrada" };

  // Se envía primero: si Meta lo rechaza, no queda un saliente fantasma en el historial.
  let wamid = null;
  try {
    ({ wamid } = await enviar.enviarTexto({ telefono, texto: limpio }));
  } catch (err) {
    console.error("[consultas] no se pudo enviar el mensaje por WhatsApp:", err?.message, err?.detalle ?? "");
    return { ok: false, codigo: "envio_fallido" };
  }

  const [mensaje] = await prisma.$transaction([
    prisma.historial_mensajes.create({
      data: { cliente_id: sesion.cliente_id, direccion: "saliente", mensaje: limpio, paso_nodo: PASO_HUMANO, created_at: ahora, wamid },
    }),
    // Tomar la conversación: el bot se calla y la consulta queda atendida por quien intervino.
    prisma.chat_estado.update({
      where: { id },
      data: { bot_pausado: true, ultimo_mensaje: ahora, atendido_at: ahora, atendido_por: usuario?.nombre ?? null },
    }),
  ]);
  return { ok: true, mensaje: mapMensaje(mensaje), botPausado: true };
}

// Devuelve la conversación al bot: vuelve a responder en la misma sesión.
export async function reanudarBot(sesionId, alcance = NINGUNA) {
  const id = Number(sesionId);
  if (!Number.isInteger(id) || id <= 0) return null;
  const sesion = await prisma.chat_estado.findFirst({ where: { id, ...alcance } });
  if (!sesion) return null;
  await prisma.chat_estado.update({ where: { id }, data: { bot_pausado: false } });
  return { sesionId: id, botPausado: false };
}
