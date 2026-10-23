import { mapFinanciacion } from "../mappers/financiacion.mapper.js";

// Recordatorios de cuotas por WhatsApp. El backend decide a quién avisar y
// arma el mensaje; n8n solo lo manda y devuelve el resultado.
//
// Se avisa cada cuota impaga 3 días antes, 1 día antes y el mismo día. Una cuota
// que el admin ya marcó como paga no se avisa: el seguimiento sigue con la del
// mes siguiente.

export const PLANTILLA_CUOTA = "recordatorio_cuota";
// Texto que se le pide aprobar a Meta (scripts/crear-plantilla-cuota.js). Si
// cambia, hay que crear otra plantilla: Meta no deja editar una aprobada a gusto.
export const TEXTO_PLANTILLA_CUOTA = [
  "Hola {{1}}, te recordamos que la cuota {{2}} de {{3}} de tu financiación vence {{4}} ({{5}}). Importe: ${{6}}.",
  "Respondé este mensaje para avisarnos si la vas a pagar en la agencia o por transferencia. Si ya la pagaste, ignorá este aviso.",
  "Para no recibir más recordatorios, respondé BAJA.",
].join("\n\n");
export const DIAS_DE_AVISO = [3, 1, 0];
export const HORAS_RESPUESTA_AVISO = 72;
export const BAJA_CONFIRMADA =
  "Listo, no vas a recibir más recordatorios de cuotas por WhatsApp. Si necesitás algo, escribinos por acá.";

const DESFASE_AR_MS = 3 * 3_600_000;
const UN_DIA_MS = 24 * 3_600_000;
const LARGO_TELEFONO_AR = 10;
const MAX_ERROR = 200;
const CUANDO = { 3: "en 3 días", 1: "mañana", 0: "hoy" };

const formatoImporte = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });

// "YYYY-MM-DD" de Argentina (UTC-3 todo el año).
export const fechaAR = (ahora) => new Date(ahora.getTime() - DESFASE_AR_MS).toISOString().slice(0, 10);

const diasEntre = (desde, hasta) => Math.round((Date.parse(hasta) - Date.parse(desde)) / UN_DIA_MS);

// 54 + característica + número (10 dígitos), sin el 9: así lo acepta la API de
// WhatsApp y así responde el cartero. null si no es un celular argentino.
export function telefonoWhatsApp(valor) {
  const digitos = String(valor ?? "").replace(/\D/g, "");
  const nacional = digitos.replace(/^549?/, "").replace(/^0/, "");
  return nacional.length === LARGO_TELEFONO_AR ? `54${nacional}` : null;
}

// Las cuotas impagas que hoy tienen aviso (vencen en 3 días, mañana u hoy).
export function cuotasParaAvisar(financiacion, hoy) {
  return financiacion.cronograma
    .filter((c) => !c.pagado)
    .map((c) => ({ numero: c.numero, vencimiento: c.vencimiento.slice(0, 10) }))
    .map((c) => ({ ...c, diasAntes: diasEntre(hoy, c.vencimiento) }))
    .filter((c) => DIAS_DE_AVISO.includes(c.diasAntes));
}

// Panel: la cuota impaga que está dentro de la ventana de avisos (vence en 3
// días o menos, sin haber vencido). null si no hay ninguna.
const VENTANA_AVISO_DIAS = Math.max(...DIAS_DE_AVISO);

export function proximoAviso(financiacion, hoy) {
  const cuota = financiacion.cronograma
    .filter((c) => !c.pagado)
    .map((c) => ({ numero: c.numero, vencimiento: c.vencimiento.slice(0, 10) }))
    .map((c) => ({ ...c, dias: diasEntre(hoy, c.vencimiento) }))
    .find((c) => c.dias >= 0 && c.dias <= VENTANA_AVISO_DIAS);
  return cuota ?? null;
}

// Las que están en aviso primero (la que vence antes arriba); el resto, en su orden.
export function conAvisosPrimero(financiaciones) {
  const enAviso = financiaciones.filter((f) => f.proximoAviso).sort((a, b) => a.proximoAviso.dias - b.proximoAviso.dias);
  return [...enAviso, ...financiaciones.filter((f) => !f.proximoAviso)];
}

const texto = (valor) => ({ type: "text", text: String(valor) });
const diaMes = (fecha) => `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}`;
const primerNombre = (nombre) => String(nombre ?? "").trim().split(/\s+/)[0] || "cliente";

// Mensaje de plantilla (categoría UTILITY) listo para la API de WhatsApp.
export function plantillaDeAviso({ telefono, nombre, numero, cuotasTotal, vencimiento, diasAntes, importe }) {
  return {
    messaging_product: "whatsapp",
    to: telefono,
    type: "template",
    template: {
      name: PLANTILLA_CUOTA,
      language: { code: "es_AR" },
      components: [
        {
          type: "body",
          parameters: [
            texto(primerNombre(nombre)),
            texto(numero),
            texto(cuotasTotal),
            texto(CUANDO[diasAntes]),
            texto(diaMes(vencimiento)),
            texto(formatoImporte.format(importe)),
          ],
        },
      ],
    },
  };
}

export const esDuplicado = (err) => err?.code === "P2002";

// Un aviso registrado que n8n no llegó a informar (se cortó la corrida) se
// vuelve a entregar en la próxima corrida; uno recién creado puede estar saliendo.
const REENVIO_PENDIENTE_MS = 10 * 60_000;
// Entregado o en camino: sirve para reconocer la respuesta y la BAJA aunque n8n
// no haya informado el envío.
const ESTADOS_SALIDOS = ["enviado", "pendiente"];

const claveAviso = (financiacionId, cuota) => ({ financiacion_id: financiacionId, numero: cuota.numero, dias_antes: cuota.diasAntes });

// Registra el aviso antes de mandarlo: la clave única (financiación, cuota, día)
// hace que una segunda corrida del mismo día no lo vuelva a mandar.
async function avisoParaEnviar(db, { financiacionId, cuota, telefono, ahora }) {
  try {
    return await db.financiacion_avisos.create({
      data: {
        ...claveAviso(financiacionId, cuota),
        vencimiento: new Date(`${cuota.vencimiento}T00:00:00Z`),
        telefono,
        estado: telefono ? "pendiente" : "sin_aviso",
        created_at: ahora,
      },
    });
  } catch (err) {
    if (!esDuplicado(err)) throw err;
    const previo = await db.financiacion_avisos.findUnique({ where: { financiacion_id_numero_dias_antes: claveAviso(financiacionId, cuota) } });
    const trabado = previo?.estado === "pendiente" && ahora - new Date(previo.created_at) >= REENVIO_PENDIENTE_MS;
    return trabado ? previo : null;
  }
}

// Los mensajes que n8n tiene que mandar hoy, cada uno con el id de su aviso.
// No se le escribe a un número que alguien marcó como equivocado mientras el
// admin no lo atienda. `ids` limita a esas financiaciones (lo usa el simulador).
export async function prepararAvisosDelDia({ db, ahora = new Date(), ids }) {
  const hoy = fechaAR(ahora);
  const filas = await db.financiaciones.findMany({
    where: {
      ...(ids && { id: { in: ids } }),
      activo: true,
      deleted_at: null,
      avisos_baja_at: null,
      NOT: { alertas: { some: { tipo: "numero_equivocado", atendida_at: null } } },
    },
    // Solo los pagos vigentes: con uno anulado la cuota sigue impaga y se avisa.
    include: { clientes: true, pagos: { where: { deleted_at: null }, select: { numero: true } } },
  });
  const envios = [];
  for (const f of filas.map(mapFinanciacion)) {
    const telefono = telefonoWhatsApp(f.telefonoAlt || f.telefono);
    for (const cuota of cuotasParaAvisar(f, hoy)) {
      const aviso = await avisoParaEnviar(db, { financiacionId: f.id, cuota, telefono, ahora });
      if (!aviso || !telefono) continue;
      const cuerpo = plantillaDeAviso({ telefono, nombre: f.nombre, numero: cuota.numero, cuotasTotal: f.cantidadCuotas, vencimiento: cuota.vencimiento, diasAntes: cuota.diasAntes, importe: f.precioCuota });
      envios.push({ avisoId: aviso.id, cuerpo });
    }
  }
  return envios;
}

// Lo que respondió WhatsApp al mandarlo. Solo cambia un aviso pendiente: un
// segundo resultado del mismo aviso no pisa el primero.
export async function registrarResultado({ db, avisoId, ok, wamid = null, error = null, ahora = new Date() }) {
  const data = ok
    ? { estado: "enviado", wamid, enviado_at: ahora }
    : { estado: "fallo", error: String(error ?? "Error desconocido").slice(0, MAX_ERROR) };
  const { count } = await db.financiacion_avisos.updateMany({ where: { id: avisoId, estado: "pendiente" }, data });
  return count > 0;
}

const comoSeEnvia = (telefono) => telefonoWhatsApp(String(telefono ?? "").replace(/\D/g, "").slice(-LARGO_TELEFONO_AR));

// El recordatorio que recibió este número en las últimas 72 h: si el cliente
// escribe, Agustina sabe por qué cuota es.
export async function avisoReciente({ db, telefono, ahora = new Date() }) {
  const numero = comoSeEnvia(telefono);
  if (!numero) return null;
  const aviso = await db.financiacion_avisos.findFirst({
    where: { telefono: numero, estado: { in: ESTADOS_SALIDOS }, created_at: { gte: new Date(ahora.getTime() - HORAS_RESPUESTA_AVISO * 3_600_000) } },
    orderBy: { id: "desc" },
    include: { financiaciones: { select: { cantidad_cuotas: true, precio_cuota: true } } },
  });
  if (!aviso) return null;
  return {
    avisoId: aviso.id,
    financiacionId: aviso.financiacion_id,
    numero: aviso.numero,
    cuotasTotal: aviso.financiaciones.cantidad_cuotas,
    vencimiento: new Date(aviso.vencimiento).toISOString().slice(0, 10),
    importe: Number(aviso.financiaciones.precio_cuota),
  };
}

// "BAJA" y las formas comunes de pedirla, con o sin "gracias" / "por favor".
const PEDIDO_DE_BAJA =
  /^(?:baja|stop|(?:quiero )?dar(?:me)? de baja|quiero la baja|no (?:quiero|me (?:manden|envien|escriban)) mas(?: (?:avisos|mensajes|recordatorios))?)(?: (?:gracias|por favor))?$/;

export function esBaja(mensaje) {
  const texto = String(mensaje ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return PEDIDO_DE_BAJA.test(texto);
}

// BAJA: se resuelve sin IA. Apaga los avisos de las financiaciones que le
// escribieron a este número y le deja una alerta al admin (una sola vez). null
// si este número nunca recibió un recordatorio (entonces lo atiende Agustina).
export async function darDeBaja({ db, telefono, ahora = new Date() }) {
  const numero = comoSeEnvia(telefono);
  if (!numero) return null;
  const avisos = await db.financiacion_avisos.findMany({
    where: { telefono: numero, estado: { in: ESTADOS_SALIDOS } },
    select: { financiacion_id: true },
  });
  const ids = [...new Set(avisos.map((a) => a.financiacion_id))];
  if (!ids.length) return null;
  return db.$transaction(async (tx) => {
    const vigentes = await tx.financiaciones.findMany({ where: { id: { in: ids }, avisos_baja_at: null }, select: { id: true } });
    const nuevas = vigentes.map((f) => f.id);
    if (!nuevas.length) return { financiaciones: 0 };
    await tx.financiaciones.updateMany({ where: { id: { in: nuevas }, avisos_baja_at: null }, data: { avisos_baja_at: ahora } });
    await tx.financiacion_alertas.createMany({
      data: nuevas.map((id) => ({ financiacion_id: id, tipo: "baja", detalle: "Pidió no recibir más recordatorios de cuota.", created_at: ahora })),
    });
    return { financiaciones: nuevas.length };
  });
}
