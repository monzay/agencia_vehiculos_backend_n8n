import { validarCuil, esCuilDelDni } from "./cuil.js";
import { semaforoCrediticio } from "./semaforo.js";
import { versionVigente } from "../services/terminos.service.js";
import { esAvisoDelCuil } from "../agente/temas-preguntados.js";

// Verificación crediticia del cliente que financia (Central de Deudores del BCRA).
//
// - Es SOLO INFORMATIVA: el semáforo queda para el asesor; no cambia el puntaje ni la
//   temperatura, y a la IA no le llega (no puede contárselo al cliente).
// - Siempre activa (decisión del dueño del 03/11/2026: no se puede apagar). Solo hace falta
//   que la agencia haya publicado sus términos, porque sin ellos no hay qué aceptar.
// - No hay un "sí" previo obligatorio: el bot le dice al cliente para qué es el CUIL (aviso) y
//   que el cliente lo mande es la autorización (Ley 25.326, art. 5 y 6). Ese "sí por mensaje" se
//   guarda recién cuando el CUIL es válido y es del cliente, con el wamid del mensaje que lo trae.
//   Un "no" lo guarda la herramienta cuando el cliente dice claramente que no quiere pasarlo.
// - Corre con el usuario de base del backend, como `cambiarAuto`: el del agente no
//   tiene permisos sobre estas tablas.

const FINALIDAD = "consulta_crediticia";
const VIGENCIA_MS = 30 * 24 * 3_600_000; // el dato del BCRA es mensual
// Un error (BCRA caído, límite) frena los reintentos solo un rato: después se puede volver a pedir.
const ESPERA_TRAS_ERROR_MS = 3_600_000;

export const SIN_VERIFICACION = "La verificación crediticia no está activa: seguí con la charla.";

const MOTIVOS = {
  sinTerminos: SIN_VERIFICACION,
  noCorresponde:
    "Solo se verifica si financia y ya dijo si tiene recibo o garante: seguí con el recorrido. Si después corresponde, decile para qué es el CUIL y pedile que te lo vuelva a mandar.",
  sinAviso:
    "Antes de consultar, decile para qué es (que con su CUIL el asesor puede consultar su situación en la Central de Deudores del BCRA) y pedile que te lo vuelva a mandar si está de acuerdo.",
  cuilInvalido: "El CUIL no es válido: pedíselo de nuevo (son 11 números).",
  cuilAjeno: "El CUIL no coincide con los datos del cliente: no lo consultes y ofrecé un vendedor.",
  bcraCaido: "No se pudo consultar ahora: seguí con la charla, el asesor lo ve después.",
};

const no = (motivo) => ({ consultado: false, motivo });
const financiaYDijoLoDelRecibo = (sesion) => sesion?.pago_tipo === "financiado" && sesion.credito_ok != null;

const ultimoConsentimiento = (db, clienteId) =>
  db.consentimientos.findFirst({ where: { cliente_id: clienteId, finalidad: FINALIDAD, deleted_at: null }, orderBy: { id: "desc" } });

const consultaDesde = (db, clienteId, estado, desde) =>
  db.consultas_crediticias.findFirst({
    where: { cliente_id: clienteId, estado, deleted_at: null, consultado_at: { gte: desde } },
    orderBy: { id: "desc" },
  });
const conResultadoVigente = (db, clienteId, ahora) => consultaDesde(db, clienteId, "ok", new Date(ahora.getTime() - VIGENCIA_MS));
const errorReciente = (db, clienteId, ahora) => consultaDesde(db, clienteId, "error", new Date(ahora.getTime() - ESPERA_TRAS_ERROR_MS));

// Guarda el sí o el no con la versión vigente de los términos. El último manda.
// `wamid` es el mensaje de WhatsApp en que lo dijo: la prueba del consentimiento.
async function guardarConsentimiento({ db, clienteId, ahora, wamid = null }, acepta) {
  const terminos = await versionVigente(db);
  if (!terminos) return { registrado: false, motivo: MOTIVOS.sinTerminos };
  // La misma respuesta con la misma versión ya está guardada: se conserva la primera (con el wamid del mensaje en que lo dijo).
  const anterior = await ultimoConsentimiento(db, clienteId);
  if (anterior && anterior.acepta === acepta && anterior.terminos_version_id === terminos.id) return { registrado: true, repetido: true };
  await db.consentimientos.create({
    data: { cliente_id: clienteId, terminos_version_id: terminos.id, finalidad: FINALIDAD, acepta, wamid, created_at: ahora },
  });
  return { registrado: true };
}

/**
 * Lo usa la herramienta para guardar el "no": el cliente dijo claramente que no quiere pasar el CUIL.
 * El "sí" no se guarda acá: es el CUIL que manda el cliente después del aviso (ver `verificarSituacion`).
 */
export async function registrarConsentimiento(ctx, acepta) {
  if (acepta) {
    return { registrado: false, motivo: "El sí no se registra aparte: es el CUIL que manda el cliente después de que le dijiste para qué es." };
  }
  return guardarConsentimiento(ctx, false);
}

// Solo el CUIL de quien escribe: válido, con el DNI de su ficha y de ninguna otra ficha.
async function cuilDelCliente({ db, clienteId, sesionId }, texto) {
  const cuil = validarCuil(texto);
  if (!cuil) return { motivo: MOTIVOS.cuilInvalido };
  // Queda en la consulta aunque no coincida: si lo corrige, el asesor ve cuál informó.
  await db.chat_estado.update({ where: { id: sesionId }, data: { cuil_informado: cuil } });
  const [cliente, otraFicha] = await Promise.all([
    db.clientes.findUnique({ where: { id: clienteId }, select: { dni: true, cuil: true } }),
    db.clientes.findFirst({ where: { cuil, id: { not: clienteId }, deleted_at: null }, select: { id: true } }),
  ]);
  const deOtro = otraFicha || (cliente?.cuil && cliente.cuil !== cuil) || (cliente?.dni && !esCuilDelDni(cuil, cliente.dni));
  if (deOtro) return { motivo: MOTIVOS.cuilAjeno };
  if (!cliente?.cuil) await db.clientes.update({ where: { id: clienteId }, data: { cuil } });
  return { cuil };
}

const MAX_NOMBRE_BCRA = 120;

// El nombre con que el BCRA tiene registrado el CUIL: el asesor lo compara en persona
// con quien escribió (decisión del dueño del 01/11/2026: se consulta aunque la ficha no
// tenga DNI contra qué comparar el CUIL).
const nombreDelBcra = ({ deudas, cheques }) => {
  const nombre = String(deudas?.denominacion ?? cheques?.denominacion ?? "").trim();
  return nombre.slice(0, MAX_NOMBRE_BCRA) || null;
};

function resumenDe(respuesta) {
  if (respuesta.estado !== "ok") return { estado: "error", semaforo: null, peor_situacion: null, periodo: null, nombre_bcra: null };
  const { semaforo, peorSituacion, periodo } = semaforoCrediticio(respuesta);
  return { estado: "ok", semaforo, peor_situacion: peorSituacion, periodo, nombre_bcra: nombreDelBcra(respuesta) };
}

const soloDigitos = (texto) => String(texto ?? "").replace(/\D/g, "");

// ¿El texto trae ese CUIL como número aparte? (puede tener espacios, puntos o guiones; un número más largo no cuenta).
const trae = (texto, digitos) => (String(texto ?? "").match(/\d[\d\s.-]*\d/g) ?? []).some((candidato) => soloDigitos(candidato) === digitos);

// ¿Se le dijo al cliente, en esta consulta y antes de este turno, para qué es el CUIL?
async function huboAviso({ db, clienteId, ahora }, sesion) {
  if (!sesion.sesion_inicio) return false;
  const filas = await db.historial_mensajes.findMany({
    where: {
      cliente_id: clienteId,
      direccion: "saliente",
      created_at: { gte: sesion.sesion_inicio, lt: ahora },
    },
    select: { mensaje: true },
  });
  return filas.some((fila) => esAvisoDelCuil(fila.mensaje));
}

/**
 * Consulta al BCRA y guarda solo el resumen. A la IA le devuelve si se hizo, nunca el semáforo.
 * La autorización es el CUIL mismo: si el cliente lo mandó (en un mensaje de este turno) después de
 * que se le dijo para qué es, alcanza; si no, sirve un "sí" vigente guardado antes.
 * `entrantes` son los mensajes del cliente en este turno: [{ texto, wamid }].
 * @returns {Promise<{ consultado: boolean, motivo?: string }>}
 */
export async function verificarSituacion({ db, clienteId, sesionId, ahora, bcra, entrantes = [] }, cuilTexto) {
  if (!(await versionVigente(db))) return no(MOTIVOS.sinTerminos);
  const sesion = await db.chat_estado.findUnique({ where: { id: sesionId }, select: { pago_tipo: true, credito_ok: true, sesion_inicio: true } });
  if (!financiaYDijoLoDelRecibo(sesion)) return no(MOTIVOS.noCorresponde);

  // Autorización: el CUIL en un mensaje del turno tras el aviso, o un "sí" vigente.
  const digitos = soloDigitos(cuilTexto);
  const conCuil = digitos.length === 11 ? entrantes.find((e) => trae(e.texto, digitos)) : undefined;
  const porMensaje = Boolean(conCuil) && (await huboAviso({ db, clienteId, ahora }, sesion));
  if (!porMensaje) {
    const previo = await ultimoConsentimiento(db, clienteId);
    if (!previo?.acepta) return no(MOTIVOS.sinAviso);
  }

  const { cuil, motivo } = await cuilDelCliente({ db, clienteId, sesionId }, cuilTexto);
  if (!cuil) return no(motivo);
  if (porMensaje) {
    const guardado = await guardarConsentimiento({ db, clienteId, ahora, wamid: conCuil.wamid ?? null }, true);
    if (!guardado.registrado) return no(guardado.motivo);
  }
  if (await conResultadoVigente(db, clienteId, ahora)) return { consultado: true };
  if (await errorReciente(db, clienteId, ahora)) return no(MOTIVOS.bcraCaido);

  const consentimiento = await ultimoConsentimiento(db, clienteId);
  const respuesta = await bcra.consultar(cuil);
  await db.consultas_crediticias.create({
    data: { cliente_id: clienteId, sesion_id: sesionId, consentimiento_id: consentimiento.id, ...resumenDe(respuesta), consultado_at: ahora },
  });
  return respuesta.estado === "ok" ? { consultado: true } : no(MOTIVOS.bcraCaido);
}

/**
 * Para ordenar lo que falta: si financia y todavía no dijo lo del recibo o garante, el CUIL va justo
 * después. NO habilita pedirlo ni consultar antes: eso sigue dependiendo de `estadoCredito`.
 * Con un "no" previo no se pide.
 * @returns {Promise<"pedir_cuil_tras_el_recibo"|null>}
 */
export async function permisoAnticipado({ db, clienteId, sesion, ahora }) {
  if (sesion?.pago_tipo !== "financiado" || (sesion.credito_ok !== null && sesion.credito_ok !== undefined)) return null;
  if (!(await versionVigente(db))) return null;
  if ((await conResultadoVigente(db, clienteId, ahora)) || (await errorReciente(db, clienteId, ahora))) return null;
  const consentimiento = await ultimoConsentimiento(db, clienteId);
  if (consentimiento && !consentimiento.acepta) return null;
  return "pedir_cuil_tras_el_recibo";
}

/**
 * En qué punto está la verificación para el contexto del agente: pedir el CUIL (diciendo para qué es) o nada
 * (sin términos, no financia, dijo que no, ya se consultó en los últimos 30 días o el BCRA falló hace menos de una hora).
 * @returns {Promise<"pedir_cuil"|null>}
 */
export async function estadoCredito({ db, clienteId, sesion, ahora }) {
  if (!financiaYDijoLoDelRecibo(sesion) || !(await versionVigente(db))) return null;
  if ((await conResultadoVigente(db, clienteId, ahora)) || (await errorReciente(db, clienteId, ahora))) return null;
  const consentimiento = await ultimoConsentimiento(db, clienteId);
  return consentimiento && !consentimiento.acepta ? null : "pedir_cuil";
}
