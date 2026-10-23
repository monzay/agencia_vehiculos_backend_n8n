import { prisma } from "../lib/prisma.js";
import { telefonosParaBuscar } from "../lib/busqueda-telefono.js";
import { mapClienteToLead, mapClienteToLeadDetalle } from "../mappers/lead.mapper.js";

// Una ficha fusionada con otra de la misma persona queda archivada (deleted_at):
// no se lista, no se cuenta ni se abre.
const VIGENTE = { deleted_at: null };

// Resuelve, en una sola query, las filas `autos` para un conjunto de ids.
// El mapa queda keyeado por `id` (la sesión referencia el auto por auto_id).
async function cargarAutosPorIds(ids) {
  const unicos = [...new Set(ids.filter((v) => v != null))];
  if (unicos.length === 0) return {};
  const autos = await prisma.autos.findMany({
    where: { id: { in: unicos } },
  });
  return Object.fromEntries(autos.map((a) => [a.id, a]));
}

// Lista todos los clientes (leads) con su clasificacion y autos consultados.
export async function listarLeads() {
  const clientes = await prisma.clientes.findMany({
    where: VIGENTE,
    include: { chat_estado: { include: { vehiculo_cliente: true } } },
    orderBy: { created_at: "desc" },
  });

  const ids = clientes.flatMap((c) =>
    (c.chat_estado ?? []).map((s) => s.auto_id)
  );
  const autosMap = await cargarAutosPorIds(ids);

  const leads = clientes.map((c) => mapClienteToLead(c, autosMap));

  // Orden: mas "calientes" primero, luego por score y actividad reciente.
  // "En calificación" queda debajo de las que ya tienen temperatura y arriba de las generales.
  const peso = { CALIENTE: 3, TIBIO: 2, FRIO: 1, EN_CALIFICACION: 0.5 };
  leads.sort((a, b) => {
    const pc = (peso[b.clasificacion] ?? 0) - (peso[a.clasificacion] ?? 0);
    if (pc !== 0) return pc;
    if (b.score !== a.score) return b.score - a.score;
    return new Date(b.ultimaActividad ?? 0) - new Date(a.ultimaActividad ?? 0);
  });

  return leads;
}

// Versión PAGINADA con filtro/búsqueda/orden hechos en el server (para no mandar
// todos los leads al panel). Reusa `listarLeads` (mapeo + orden base) y aplica:
//   - tipo:   "compra" | "venta" (por defecto todos)
//   - clasif: CALIENTE | TIBIO | FRIO (o "TODOS")
//   - q:      busca en nombre / teléfono / autos consultados / vehículo a vender
//   - orden:  las compras muestran primero a quienes volvieron a consultar
// Devuelve { items, hayMas, total }.
export async function listarLeadsPaginado({ tipo, clasif, q, offset = 0, limite = 10 } = {}) {
  const off = Math.max(0, Number(offset) || 0);
  const lim = Math.max(1, Number(limite) || 10);

  let arr = await listarLeads();
  // Un cliente puede ser comprador Y vendedor: se filtra por la actividad real,
  // no de forma excluyente (así Clientes muestra a quien consultó autos aunque
  // además haya ofrecido vender el suyo).
  if (tipo === "venta") arr = arr.filter((l) => l.esVenta);
  else if (tipo === "compra") arr = arr.filter((l) => l.esCompra);

  // La clasificación visible en Clientes es la de la ÚLTIMA consulta, así que el
  // filtro se aplica sobre esa (cae a la global si no hubiera última consulta).
  if (clasif && clasif !== "TODOS")
    arr = arr.filter((l) => (l.ultimaConsulta?.clasificacion ?? l.clasificacion) === clasif);

  const ql = (q || "").trim().toLowerCase();
  if (ql) {
    // El teléfono se guarda con 10 dígitos, pero se busca pegándolo como venga (+54 9 388…).
    const telefonos = telefonosParaBuscar(ql);
    arr = arr.filter((l) => {
      const venta = l.venta ? [l.venta.marca, l.venta.modelo, l.venta.anio].filter(Boolean).join(" ") : "";
      return (
        (l.nombre || "").toLowerCase().includes(ql) ||
        telefonos.some((telefono) => (l.telefono || "").toLowerCase().includes(telefono)) ||
        (l.autosConsultados || []).some((a) => `${a.brand} ${a.model}`.toLowerCase().includes(ql)) ||
        venta.toLowerCase().includes(ql)
      );
    });
  }

  // Recurrentes primero (los que volvieron a consultar), orden estable que
  // conserva el orden base (caliente/score/actividad). Aplica a compras y ventas.
  const rec = (l) => ((l.totalSesiones ?? 1) > 1 ? 1 : 0);
  arr = [...arr].sort((a, b) => rec(b) - rec(a));

  const total = arr.length;
  return { items: arr.slice(off, off + lim), hayMas: off + lim < total, total };
}

// Detalle de un lead: incluye sesiones e historial de mensajes.
export async function obtenerLead(id) {
  const cliente = await prisma.clientes.findFirst({
    where: { id: Number(id), ...VIGENTE },
    include: {
      chat_estado: {
        orderBy: { updated_at: "desc" },
        include: { vehiculo_cliente: true },
      },
      historial_mensajes: { orderBy: { created_at: "asc" } },
    },
  });
  if (!cliente) return null;

  const ids = (cliente.chat_estado ?? []).map((s) => s.auto_id);
  const autosMap = await cargarAutosPorIds(ids);

  return mapClienteToLeadDetalle(cliente, autosMap);
}

// Resumen para las tarjetas KPI del dashboard.
export async function resumenLeads() {
  const leads = await listarLeads();
  const compras = leads.filter((l) => l.esCompra);

  // Top autos consultados (para el gráfico del Resumen).
  const conteo = new Map();
  for (const l of compras)
    for (const a of l.autosConsultados ?? []) {
      const k = `${a.brand} ${a.model}`;
      conteo.set(k, (conteo.get(k) ?? 0) + 1);
    }
  const topAutos = [...conteo.entries()]
    .map(([nombre, total]) => ({ nombre, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  // Últimos clientes por actividad (lista liviana para el Resumen).
  const recientes = [...leads]
    .sort((a, b) => new Date(b.ultimaActividad ?? 0) - new Date(a.ultimaActividad ?? 0))
    .slice(0, 6)
    .map((l) => ({
      id: l.id,
      nombre: l.nombre,
      telefono: l.telefono,
      esVenta: l.esVenta,
      clasificacion: l.clasificacion,
      ultimaActividad: l.ultimaActividad,
    }));

  return {
    total: leads.length,
    calientes: leads.filter((l) => l.clasificacion === "CALIENTE").length,
    tibios: leads.filter((l) => l.clasificacion === "TIBIO").length,
    frios: leads.filter((l) => l.clasificacion === "FRIO").length,
    ventas: leads.filter((l) => l.esVenta).length,
    topAutos,
    recientes,
  };
}
