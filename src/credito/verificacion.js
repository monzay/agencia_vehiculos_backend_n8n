import { validarCuil, esCuilDelDni } from "./cuil.js";
import { semaforoCrediticio } from "./semaforo.js";
import { versionVigente } from "../services/terminos.service.js";

// Verificación crediticia del cliente que financia (Central de Deudores del BCRA).
//
// - Es SOLO INFORMATIVA: el semáforo queda para el asesor; no cambia el puntaje ni la
//   temperatura, y a la IA no le llega (no puede contárselo al cliente).
// - Siempre activa (decisión del dueño del 03/11/2026: no se puede apagar). Solo hace falta
//   que la agencia haya publicado sus términos, porque sin ellos no hay qué aceptar, y un
//   "sí" vigente del cliente (Ley 25.326, art. 5 y 6).
// - Corre con el usuario de base del backend, como `cambiarAuto`: el del agente no
//   tiene permisos sobre estas tablas.

const FINALIDAD = "consulta_crediticia";
const VIGENCIA_MS = 30 * 24 * 3_600_000; // el dato del BCRA es mensual
// Un error (BCRA caído, límite) frena los reintentos solo un rato: después se puede volver a pedir.
const ESPERA_TRAS_ERROR_MS = 3_600_000;

export const SIN_VERIFICACION = "La verificación crediticia no está activa: seguí con la charla.";

const MOTIVOS = {
  sinTerminos: SIN_VERIFICACION,
  noCorresponde: "Solo se verifica si financia y ya dijo si tiene recibo o garante.",
  sinPermiso: "El cliente no autorizó la consulta: no la hagas sin su sí.",
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

/**
 * Guarda el sí o el no del cliente con la versión vigente de los términos. El último manda.
 * `wamid` es el mensaje de WhatsApp en que respondió: la prueba del consentimiento.
 */
export async function registrarConsentimiento({ db, clienteId, ahora, wamid = null }, acepta) {
  const terminos = await versionVigente(db);
  if (!terminos) return { registrado: false, motivo: MOTIVOS.sinTerminos };
  // La misma respuesta con la misma versión ya está guardada: se conserva la primera (con el wamid del mensaje en que lo dijo).
  const anterior = await ultimoConsentimiento(db, clienteId);
  if (anterior && anterior.acepta === acepta && anterior.terminos_version_id === terminos.id) return { registrado: true };
  await db.consentimientos.create({
    data: { cliente_id: clienteId, terminos_version_id: terminos.id, finalidad: FINALIDAD, acepta, wamid, created_at: ahora },
  });
  return { registrado: true };
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

/**
 * Consulta al BCRA y guarda solo el resumen. A la IA le devuelve si se hizo, nunca el semáforo.
 * @returns {Promise<{ consultado: boolean, motivo?: string }>}
 */
export async function verificarSituacion({ db, clienteId, sesionId, ahora, bcra }, cuilTexto) {
  if (!(await versionVigente(db))) return no(MOTIVOS.sinTerminos);
  const sesion = await db.chat_estado.findUnique({ where: { id: sesionId }, select: { pago_tipo: true, credito_ok: true } });
  if (!financiaYDijoLoDelRecibo(sesion)) return no(MOTIVOS.noCorresponde);
  const consentimiento = await ultimoConsentimiento(db, clienteId);
  if (!consentimiento?.acepta) return no(MOTIVOS.sinPermiso);
  const { cuil, motivo } = await cuilDelCliente({ db, clienteId, sesionId }, cuilTexto);
  if (!cuil) return no(motivo);
  if (await conResultadoVigente(db, clienteId, ahora)) return { consultado: true };
  if (await errorReciente(db, clienteId, ahora)) return no(MOTIVOS.bcraCaido);

  const respuesta = await bcra.consultar(cuil);
  await db.consultas_crediticias.create({
    data: { cliente_id: clienteId, sesion_id: sesionId, consentimiento_id: consentimiento.id, ...resumenDe(respuesta), consultado_at: ahora },
  });
  return respuesta.estado === "ok" ? { consultado: true } : no(MOTIVOS.bcraCaido);
}

/**
 * En qué punto está la verificación para el contexto del agente: pedir el permiso, pedir el
 * CUIL o nada (sin términos, no financia, dijo que no, ya se consultó en los últimos 30 días o el
 * BCRA falló hace menos de una hora).
 * @returns {Promise<"pedir_consentimiento"|"pedir_cuil"|null>}
 */
export async function estadoCredito({ db, clienteId, sesion, ahora }) {
  if (!financiaYDijoLoDelRecibo(sesion) || !(await versionVigente(db))) return null;
  if ((await conResultadoVigente(db, clienteId, ahora)) || (await errorReciente(db, clienteId, ahora))) return null;
  const consentimiento = await ultimoConsentimiento(db, clienteId);
  if (!consentimiento) return "pedir_consentimiento";
  return consentimiento.acepta ? "pedir_cuil" : null;
}
