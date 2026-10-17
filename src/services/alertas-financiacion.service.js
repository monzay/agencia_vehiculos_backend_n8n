// Avisos para el administrador cuando un cliente responde un recordatorio de
// cuota (los deja Agustina) o pide la BAJA. Solo los ve el admin, en Financiación.

const MAX_ALERTAS = 100;
const MAX_NOMBRE_USUARIO = 120;

const mapAlerta = (a) => ({
  id: a.id,
  financiacionId: a.financiacion_id,
  tipo: a.tipo,
  detalle: a.detalle ?? null,
  creada: new Date(a.created_at).toISOString(),
  nombre: a.financiaciones?.clientes?.nombre ?? "",
  telefono: a.aviso?.telefono ?? a.financiaciones?.clientes?.telefono ?? "",
  cuota: a.aviso?.numero ?? null,
});

export async function listarAlertasPendientes({ db }) {
  const filas = await db.financiacion_alertas.findMany({
    where: { atendida_at: null },
    orderBy: { id: "desc" },
    take: MAX_ALERTAS,
    include: {
      financiaciones: { select: { clientes: { select: { nombre: true, telefono: true } } } },
      aviso: { select: { numero: true, telefono: true } },
    },
  });
  return filas.map(mapAlerta);
}

export async function marcarAlertaAtendida({ db, id, usuario, ahora = new Date() }) {
  const { count } = await db.financiacion_alertas.updateMany({
    where: { id, atendida_at: null },
    data: { atendida_at: ahora, atendida_por: usuario ? String(usuario).slice(0, MAX_NOMBRE_USUARIO) : null },
  });
  return count > 0;
}
