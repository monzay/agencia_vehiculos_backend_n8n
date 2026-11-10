// A quién se asigna una consulta nueva (decisión del dueño, 10/11/2026):
//   1. el link de un asesor gana siempre;
//   2. si no hay link, la consulta que se abre por otro auto sigue con su asesor mientras esté activo;
//   3. si no, le toca el turno: reparto en ronda entre los asesores habilitados.
// Solo se reparte al crear una consulta. Sin reparto o sin nadie habilitado, queda sin asignar.

const CLAVE_ULTIMO = "reparto_ultimo_vendedor";
const CLAVE_REPARTO = "reparticion_equitativa";
const SIN_ASESOR = { vendedor_id: null, atribuido: false };

// Un asesor que se puede dar de alta como dueño de una consulta: activo y no borrado.
const VIGENTE = { activo: true, deleted_at: null };

export async function asesorDelLink(db, slug) {
  if (!slug) return null;
  const asesor = await db.vendedores.findFirst({ where: { slug, ...VIGENTE }, select: { id: true } });
  return asesor ? { vendedor_id: asesor.id, atribuido: true } : null;
}

export async function heredarAsesor(db, actual) {
  if (!actual?.vendedor_id) return null;
  const asesor = await db.vendedores.findFirst({ where: { id: actual.vendedor_id, ...VIGENTE }, select: { id: true } });
  return asesor ? { vendedor_id: asesor.id, atribuido: Boolean(actual.atribuido) } : null;
}

// Con el link de un asesor, la consulta en la que sigue la charla pasa a ser suya; si ya lo era, no hay nada que cambiar.
export const cambioDeAsesor = (consulta, link) =>
  link && (consulta.vendedor_id !== link.vendedor_id || !consulta.atribuido) ? link : {};

async function repartoEncendido(tx) {
  const fila = await tx.configuracion.findUnique({ where: { clave: CLAVE_REPARTO } });
  return !fila || fila.valor === "1" || fila.valor === "true";
}

// Los administradores atienden desde su cuenta: aunque tengan ficha de asesor, no entran al turno.
async function idsDelTurno(tx) {
  const [asesores, admins] = await Promise.all([
    tx.vendedores.findMany({ where: { ...VIGENTE, recibe_consultas: true }, orderBy: { id: "asc" }, select: { id: true } }),
    tx.usuarios.findMany({ where: { rol: "admin", activo: true, deleted_at: null, vendedor_id: { not: null } }, select: { vendedor_id: true } }),
  ]);
  const excluidos = new Set(admins.map((a) => a.vendedor_id));
  return asesores.map((a) => a.id).filter((id) => !excluidos.has(id));
}

const siguienteDelTurno = (ids, ultimo) => ids.find((id) => id > ultimo) ?? ids[0];

// READ COMMITTED: con el REPEATABLE READ por defecto, si la fila del puntero no existe el
// `FOR UPDATE` toma un bloqueo de hueco y dos turnos simultáneos se traban en el INSERT del upsert.
const TRANSACCION = { isolationLevel: "ReadCommitted", timeout: 10_000, maxWait: 5_000 };
const DEADLOCK = "P2034";

// El `FOR UPDATE` sobre el puntero hace que dos consultas simultáneas no reciban el mismo turno.
const turnoEnTransaccion = (db) =>
  db.$transaction(async (tx) => {
    const [puntero] = await tx.$queryRaw`SELECT valor FROM configuracion WHERE clave = ${CLAVE_ULTIMO} FOR UPDATE`;
    if (!(await repartoEncendido(tx))) return SIN_ASESOR;
    const ids = await idsDelTurno(tx);
    if (!ids.length) return SIN_ASESOR;
    const elegido = siguienteDelTurno(ids, Number(puntero?.valor) || 0);
    const valor = String(elegido);
    await tx.configuracion.upsert({ where: { clave: CLAVE_ULTIMO }, update: { valor }, create: { clave: CLAVE_ULTIMO, valor } });
    return { vendedor_id: elegido, atribuido: false };
  }, TRANSACCION);

// El turno se consume antes de crear la consulta: si el `create` falla, ese turno se pierde (se acepta).
// Un fallo del turno no frena la atención: el mensaje se atiende y la consulta queda sin asignar.
// Solo el deadlock se reintenta, una vez.
export async function asesorPorTurno(db) {
  try {
    return await turnoEnTransaccion(db).catch((err) => {
      if (err?.code !== DEADLOCK) throw err;
      return turnoEnTransaccion(db);
    });
  } catch (err) {
    console.error("[reparto] no se pudo asignar el turno, la consulta queda sin asignar:", err?.code ?? "", err?.message);
    return SIN_ASESOR;
  }
}

export async function asesorParaConsultaNueva(db, { link = null, actual = null } = {}) {
  return link ?? (await heredarAsesor(db, actual)) ?? (await asesorPorTurno(db));
}
