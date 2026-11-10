import { puntaje, clasificar } from "./calificacion.js";
import { asesorParaConsultaNueva, cambioDeAsesor } from "./reparto.js";

// Una consulta por auto (decisión del 31/10/2026): si un cliente que ya consulta
// por un auto se interesa en otro, ese auto va en su propia consulta. La abre o la
// retoma el backend con su usuario de base: el de la IA no puede crear consultas.
// El asesor de la nueva lo define `reparto.js`: el link, el que ya tenía o el turno.

const VIGENTE_MS = 24 * 3_600_000;
// Lo que es de la persona y no del auto: se lleva a la consulta del otro auto.
// La visita y el aviso al vendedor eran por el otro auto: no se copian.
const DE_LA_PERSONA = ["pago_tipo", "anticipo", "cuotas", "credito_ok", "entrega_usado", "decisor", "decisor_con", "disponibilidad"];
const DEL_USADO = ["marca", "modelo", "anio", "kms", "detalles", "precio_pedido"];

const definido = (v) => v !== null && v !== undefined;
const loQueFalta = (destino, origen) =>
  Object.fromEntries(DE_LA_PERSONA.filter((campo) => !definido(destino[campo]) && definido(origen[campo])).map((campo) => [campo, origen[campo]]));
const temperatura = (datos) => ({ score: puntaje(datos), clasificacion: clasificar(datos) });

async function retomar(db, consulta, actual, asesorLink) {
  const faltante = loQueFalta(consulta, actual);
  const completada = Object.keys(faltante).length ? { ...faltante, ...temperatura({ ...consulta, ...faltante }) } : {};
  const cambios = { ...completada, ...cambioDeAsesor(consulta, asesorLink) };
  if (Object.keys(cambios).length) await db.chat_estado.update({ where: { id: consulta.id }, data: cambios });
  return consulta.id;
}

async function abrir(db, { clienteId, actual, autoId, ahora, asesorLink }) {
  const datos = { ...loQueFalta({}, actual), auto_id: autoId };
  const asesor = await asesorParaConsultaNueva(db, { link: asesorLink, actual });
  const nueva = await db.chat_estado.create({
    data: {
      cliente_id: clienteId,
      origen: actual.origen,
      ...asesor,
      ultimo_mensaje: ahora,
      ...datos,
      ...temperatura(datos),
    },
  });
  return nueva.id;
}

// Hay una sola fila de usado por consulta (índice único, archivadas incluidas):
// se copia solo si la consulta de destino no tiene ninguna.
async function copiarUsado(db, desdeId, hastaId) {
  const [usado, yaTiene] = await Promise.all([
    db.vehiculo_cliente.findFirst({ where: { sesion_id: desdeId, contexto: "trade_in", deleted_at: null } }),
    db.vehiculo_cliente.findFirst({ where: { sesion_id: hastaId, contexto: "trade_in" } }),
  ]);
  if (!usado || yaTiene) return;
  const datos = Object.fromEntries(DEL_USADO.map((campo) => [campo, usado[campo] ?? null]));
  await db.vehiculo_cliente.create({ data: { sesion_id: hastaId, contexto: "trade_in", ...datos } });
}

// Devuelve el id de la consulta del auto: la vigente que ya existía o una nueva.
export async function consultaPorAuto({ db, clienteId, sesionId, ahora, asesorLink = null }, autoId) {
  const [actual, delAuto] = await Promise.all([
    db.chat_estado.findUnique({ where: { id: sesionId } }),
    db.chat_estado.findFirst({
      where: { cliente_id: clienteId, auto_id: autoId, ultimo_mensaje: { gte: new Date(ahora.getTime() - VIGENTE_MS) } },
      orderBy: { id: "desc" },
    }),
  ]);
  const id = delAuto ? await retomar(db, delAuto, actual, asesorLink) : await abrir(db, { clienteId, actual, autoId, ahora, asesorLink });
  await copiarUsado(db, sesionId, id);
  return id;
}
