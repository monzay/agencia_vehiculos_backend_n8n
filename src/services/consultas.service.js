import { prisma } from "../lib/prisma.js";
import { SESION_UTIL } from "../lib/consultas-utiles.js";
import { mapConsultaResumen, mapConsultaVenta, mapMensaje, construirRespuestas } from "../mappers/consulta.mapper.js";

const CANALES = ["whatsapp", "facebook", "instagram", "web"];

const CLASIFICACIONES = ["CALIENTE", "TIBIO", "FRIO"];

// Las consultas de venta/consignación tienen su propia sección ("Vender /
// Consignación"), así que acá se listan solo las de compra. `tipo_lead` es NULL
// en la mayoría de las consultas, y en SQL `<> 'venta'` no matchea NULL, por eso
// el NULL se contempla explícitamente.
const SIN_VENTA = { OR: [{ tipo_lead: null }, { tipo_lead: { not: "venta" } }] };

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

  const OR = [
    { clientes: { nombre: { contains: termino } } },
    { clientes: { telefono: { contains: termino } } },
  ];
  if (canales.length) OR.push({ clientes: { canal: { in: canales } } });
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
export async function listarConsultas({ limite = 20, offset = 0, q = "", clasif = "" } = {}) {
  const take = Math.max(1, Number(limite) || 20);
  const skip = Math.max(0, Number(offset) || 0);
  const termino = String(q || "").trim();

  // Las consultas vacías nunca se listan ni suman al total.
  const filtros = [SESION_UTIL, SIN_VENTA];
  if (termino) filtros.push(await construirFiltroBusqueda(termino));
  if (CLASIFICACIONES.includes(clasif)) filtros.push({ clasificacion: clasif });
  const where = { AND: filtros };

  // Se pide 1 de más para saber si quedan más páginas sin otra query.
  const [sesiones, total] = await Promise.all([
    prisma.chat_estado.findMany({
      where,
      include: { clientes: true },
      orderBy: { sesion_inicio: "desc" }, // consultas más recientes primero
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
      { clientes: { telefono: { contains: termino } } },
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
export async function listarConsultasVenta({ limite = 10, offset = 0, q = "" } = {}) {
  const take = Math.max(1, Number(limite) || 10);
  const skip = Math.max(0, Number(offset) || 0);
  const termino = String(q || "").trim();

  const filtros = [{ tipo_lead: "venta", paso_actual: "handoff" }];
  if (termino) filtros.push(filtroBusquedaVenta(termino));
  const where = { AND: filtros };

  const [sesiones, total] = await Promise.all([
    prisma.chat_estado.findMany({
      where,
      include: { clientes: true, vehiculo_cliente: true },
      orderBy: { sesion_inicio: "desc" },
      skip,
      take: take + 1,
    }),
    prisma.chat_estado.count({ where }),
  ]);
  const hayMas = sesiones.length > take;
  const pagina = hayMas ? sesiones.slice(0, take) : sesiones;
  return { items: pagina.map((s) => mapConsultaVenta(s, s.clientes)), hayMas, total };
}

// DETALLE: los mensajes entrantes (respuestas del cliente) de UNA consulta.
// Como `historial_mensajes` guarda por cliente, se acota a la ventana de tiempo
// de esa sesión: desde su inicio hasta el inicio de la sesión siguiente del
// mismo cliente (la primera sesión toma también lo anterior a ella).
export async function obtenerConsulta(sesionId) {
  // `sesionId` viene de la URL: un id no numérico debe dar 404, no reventar Prisma.
  const id = Number(sesionId);
  if (!Number.isInteger(id) || id <= 0) return null;

  const sesion = await prisma.chat_estado.findUnique({
    where: { id },
    include: { vehiculo_cliente: true },
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
      direccion: "entrante",
      cliente_id: sesion.cliente_id,
      ...(Object.keys(rango).length ? { created_at: rango } : {}),
    },
    orderBy: { created_at: "asc" },
    select: { id: true, mensaje: true, paso_nodo: true, created_at: true },
  });

  return {
    sesionId: sesion.id,
    // Preguntas→respuestas identificadas desde lo que el bot guardó estructurado.
    respuestas: construirRespuestas(sesion, sesion.vehiculo_cliente ?? []),
    // Mensajes crudos del cliente (verbatim), por si se quieren leer.
    mensajes: mensajes.map(mapMensaje),
  };
}

// Marca/desmarca una consulta como ATENDIDA. Guarda cuándo y quién la marcó.
// Devuelve null si la sesión no existe.
export async function marcarConsultaAtendida(sesionId, atendido, usuario) {
  const id = Number(sesionId);
  const sesion = await prisma.chat_estado.findUnique({ where: { id } });
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
