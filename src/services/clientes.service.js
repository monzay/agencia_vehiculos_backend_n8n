import { prisma } from "../lib/prisma.js";
import { claveDni } from "../lib/dni.js";
import { telefonoNacional } from "../lib/provincias.js";

// Una persona = una ficha de `clientes` (migración 073). `resolverCliente` es la
// única puerta de alta: el bot de WhatsApp, la financiación web y el trámite
// presencial pasan por acá y reconocen a la persona en vez de duplicarla.
// Fusionar es archivar: nunca se borra una fila. El origen queda con `deleted_at`
// y `fusionado_en_id`, y cada fusión se anota en `cliente_fusiones`.
//
// `db` es el cliente de Prisma o el `tx` de una transacción. Con el cliente, lo que
// escribe en varias tablas (crear la ficha con su canal, completarla y vincularle un
// canal, fusionar) va en una transacción propia; con un `tx` se usa tal cual, dentro
// de la de quien llama.

export const VIGENTE_CLIENTE = { deleted_at: null };

// Los canales con identificador propio (wa_id, id de página): los que van a `cliente_canales`.
export const CANALES_MENSAJERIA = Object.freeze(["whatsapp", "facebook", "instagram"]);
const CANALES = [...CANALES_MENSAJERIA, "web", "presencial"];
const MOTIVOS = ["mismo_dni", "mismo_telefono", "manual"];

// Lo que el plan de unificación acepta como DNI y como teléfono. Una ficha con otro tipo de documento
// (un pasaporte, "S/D") no se une por nada: dos "S/D" no son la misma persona.
const DNI_VALIDO = /^\d{7,9}$/;
const TELEFONO_NACIONAL = /^\d{10}$/; // área + abonado, como los deja normalizarTelefonos
const MOTIVO_DNI_NO_VALIDO = "dni_no_valido";

// Largo de las columnas de `clientes` y `cliente_canales`.
const MAX_NOMBRE = 120;
const MAX_EMAIL = 180;
const MAX_DNI = 20;
const MAX_TELEFONO = 30;
const MAX_IDENTIFICADOR = 120;

// La fusión toca una docena de tablas: con la base lejos pasa de los 5 s por defecto.
const TIMEOUT_FUSION_MS = 30_000;

// Lo que se completa de la ficha, campo por campo.
const GRUPOS_FICHA = [["nombre"], ["telefono"], ["dni"], ["cuil"], ["email"]];
// Del perfil, lo que va junto se completa junto: un CBU con el alias de otra cuenta, o un
// teléfono alternativo sin su vínculo (lo prohíbe un CHECK), serían datos mezclados.
const GRUPOS_PERFIL = [
  ["apellido"],
  ["cuit"],
  ["domicilio", "localidad", "provincia"],
  ["cbu", "alias_cbu", "banco_cbu"],
  ["contacto_alt_telefono", "contacto_alt_vinculo"],
];

// Tablas con una columna que apunta a la ficha: la fusión pasa sus filas al destino. `clave` es como se
// anotan en el registro. Una tabla nueva con `cliente_id` tiene que entrar acá (lo cuida clientes.hijas.test.js).
// Fuera de la lista quedan `cliente_perfiles` (la une `unirPerfiles`) y `cliente_fusiones` (es el registro).
const hija = (modelo, campo = "cliente_id") => Object.freeze({ clave: campo === "cliente_id" ? modelo : `${modelo}.${campo}`, modelo, campo });
export const FILAS_HIJAS = Object.freeze([
  hija("chat_estado"),
  hija("historial_mensajes"),
  hija("ia_consumos"),
  hija("verificacion_intentos"),
  hija("alertas_stock"),
  hija("entregas"),
  hija("senas"),
  hija("financiaciones"),
  hija("consignacion_ingresos"),
  hija("consignacion_ingresos", "conyuge_cliente_id"),
  hija("cliente_canales"),
  hija("consentimientos"),
  hija("consultas_crediticias"),
  hija("clientes", "fusionado_en_id"),
]);

// Tablas de la lista con `updated_at ... ON UPDATE CURRENT_TIMESTAMP`: cambiarles el `cliente_id` lo pisaría con
// la hora de la fusión, y la "última actividad" de una consulta sale de `chat_estado.updated_at`. Se mueven fila
// por fila escribiendo `updated_at` con el valor que ya tenía: MySQL no lo pisa si el UPDATE lo asigna.
// (`cliente_perfiles`, la otra con ON UPDATE, se mueve en `unirPerfiles`.)
const CONSERVAN_FECHA = new Set(["chat_estado", "consignacion_ingresos"]);

function error(mensaje, status = 400) {
  const e = new Error(mensaje);
  e.status = status;
  return e;
}

const soloDigitos = (valor) => String(valor ?? "").replace(/\D/g, "");
const vacio = (valor) => valor == null || String(valor).trim() === "";
// Saca los caracteres de control y de formato (el override RTL, el espacio de ancho cero, el NUL): los que
// hacen de espacio (salto de línea, tab) pasan a espacio. Un nombre con eso se vería distinto de lo que dice.
const sinInvisibles = (texto) => texto.replace(/[\p{Cc}\p{Cf}]/gu, (caracter) => (/\s/.test(caracter) ? " " : ""));
const limpiar = (valor, max) => (typeof valor === "string" ? sinInvisibles(valor).replace(/\s+/g, " ").trim().slice(0, max) : "") || null;
// El cliente de Prisma abre transacciones; el `tx` que recibe una función dentro de una no.
const esClienteRaiz = (db) => typeof db.$transaction === "function";
const enTransaccion = (db, tarea, opciones) => (esClienteRaiz(db) ? db.$transaction(tarea, opciones) : tarea(db));

// Solo huecos: de cada grupo se pasa lo del origen si el destino no tiene nada en él.
function huecos(destino, origen, grupos) {
  return Object.fromEntries(
    grupos
      .filter((grupo) => grupo.every((campo) => vacio(destino[campo])) && grupo.some((campo) => !vacio(origen[campo])))
      .flatMap((grupo) => grupo.map((campo) => [campo, origen[campo]]))
  );
}

// En WhatsApp el wa_id siempre trae el código de país: solo el que empieza con 54 es argentino. Sin ese
// chequeo, el 93704123456 de Afganistán se leería como el 9 de móvil más el área 3704 de Formosa.
const nacionalDeWhatsapp = (digitos) => (digitos.startsWith("54") ? telefonoNacional(digitos) : null);
// Un teléfono de una ficha de WhatsApp guardado con más de 10 dígitos y sin el 54 es de otro país.
const esDeOtroPais = (digitos) => digitos.length > 10 && !digitos.startsWith("54");

// Los 10 dígitos nacionales de la ficha, o null si no tiene teléfono o no se puede normalizar. Los de
// WhatsApp sin teléfono tenían el número solo en el identificador del canal. En web y presencial lo tipea
// una persona ("0388 15 470-8347"), así que vale el formato que sea.
function telefonoDeFicha(telefono, canal, identificadorWhatsapp) {
  const esWhatsapp = canal === "whatsapp";
  if (vacio(telefono)) return esWhatsapp ? nacionalDeWhatsapp(soloDigitos(identificadorWhatsapp)) : null;
  if (esWhatsapp && esDeOtroPais(soloDigitos(telefono))) return null;
  return telefonoNacional(telefono);
}

// ── Alta: resolverCliente ──

function identificadorDe(canal, valor) {
  const texto = canal === "whatsapp" ? soloDigitos(valor) : String(valor ?? "").trim();
  if (texto.length > MAX_IDENTIFICADOR) throw error("El identificador del canal es demasiado largo.");
  return texto || null;
}

// Un teléfono que no se puede normalizar (extranjero, incompleto) se guarda como dígitos.
const digitosGuardables = (digitos) => (digitos && digitos.length <= MAX_TELEFONO ? digitos : null);

// El DNI llega de formularios y de JSON: solo texto o número. `claveDni` convierte cualquier cosa en texto,
// y un objeto terminaría guardado como "[OBJECTOBJECT]".
function dniDeLaEntrada(valor) {
  if (valor == null) return null;
  const esTexto = typeof valor === "string";
  const esNumero = typeof valor === "number" && Number.isSafeInteger(valor) && valor > 0;
  if (!esTexto && !esNumero) throw error("El DNI no es válido.");
  const dni = claveDni(valor);
  if (dni && dni.length > MAX_DNI) throw error("El DNI no es válido.");
  return dni;
}

function prepararEntrada(datos) {
  if (!datos || typeof datos !== "object") throw error("Faltan los datos del cliente.");
  const { canal } = datos;
  if (!CANALES.includes(canal)) throw error(`El canal debe ser uno de: ${CANALES.join(", ")}.`);

  // El identificador solo existe en los canales de mensajería. El de WhatsApp es un
  // teléfono; el de Facebook o Instagram no.
  const identificador = CANALES_MENSAJERIA.includes(canal) ? identificadorDe(canal, datos.identificador) : null;
  const dni = dniDeLaEntrada(datos.dni);

  const digitos = soloDigitos(datos.telefono) || (canal === "whatsapp" ? soloDigitos(identificador) : "");
  const nacional = canal === "whatsapp" ? nacionalDeWhatsapp(digitos) : telefonoNacional(digitos);

  return {
    canal,
    identificador,
    nombre: limpiar(datos.nombre, MAX_NOMBRE),
    email: limpiar(datos.email, MAX_EMAIL),
    dni,
    nacional,
    telefono: nacional ?? digitosGuardables(digitos),
  };
}

// La ficha vigente a la que lleva `id`: la misma, o el final de su cadena de fusiones.
async function fichaVigente(id, db) {
  const vistos = new Set();
  let actual = id;
  while (actual != null && !vistos.has(actual)) {
    vistos.add(actual);
    const ficha = await db.clientes.findUnique({ where: { id: actual } });
    if (ficha && !ficha.deleted_at) return ficha;
    actual = ficha?.fusionado_en_id;
  }
  // Archivada a mano (sin fusionar) o cadena en ciclo: no hay a quién devolver y crear otra
  // chocaría con el identificador. Que lo resuelva una persona.
  throw error(`La ficha ${id} está archivada y no tiene una vigente a la que seguir.`, 409);
}

// Por canal, después por DNI y después por teléfono. `porCanal` dice si ya estaba vinculada.
async function buscar({ canal, identificador, dni, nacional }, db) {
  if (identificador) {
    const vinculo = await db.cliente_canales.findUnique({
      where: { canal_identificador: { canal, identificador } },
      select: { cliente_id: true },
    });
    if (vinculo) return { cliente: await fichaVigente(vinculo.cliente_id, db), porCanal: true };
  }

  if (dni) {
    const cliente = await db.clientes.findFirst({ where: { ...VIGENTE_CLIENTE, dni }, orderBy: { id: "asc" } });
    if (cliente) return { cliente, porCanal: false };
  }

  if (nacional) {
    const candidatas = await db.clientes.findMany({ where: { ...VIGENTE_CLIENTE, telefono: nacional }, orderBy: { id: "asc" } });
    // Una familia puede compartir número: con más de una ficha, o con otro DNI, no se adivina.
    const [unica] = candidatas;
    if (candidatas.length === 1 && (!dni || vacio(unica.dni))) return { cliente: unica, porCanal: false };
  }

  return null;
}

async function dniEnOtraFicha(dni, id, db) {
  const otra = await db.clientes.findFirst({ where: { ...VIGENTE_CLIENTE, dni, id: { not: id } }, select: { id: true } });
  return Boolean(otra);
}

// El nombre de perfil de un chat es lo que cada uno se puso. Mientras la ficha vino de un chat y no tiene DNI,
// el que tipea el personal (web o presencial) lo reemplaza; con DNI, o desde otros canales, solo se llenan huecos.
const nombreTipeadoGana = (cliente, entrada) =>
  entrada.nombre != null &&
  entrada.nombre !== cliente.nombre &&
  !CANALES_MENSAJERIA.includes(entrada.canal) &&
  CANALES_MENSAJERIA.includes(cliente.canal) &&
  vacio(cliente.dni);

// Sobre la ficha encontrada se completan huecos (y el nombre de perfil, ver arriba), y se vincula el
// identificador si le faltaba. Lo que escribe va en una sola transacción; si no hay nada que escribir no abre ninguna.
async function completar({ cliente, porCanal }, entrada, db) {
  const nombre = nombreTipeadoGana(cliente, entrada) ? { nombre: entrada.nombre } : {};
  // Si otra ficha vigente ya tiene ese DNI no se copia (el índice único de la 074): son dos
  // fichas de la misma persona y eso se resuelve fusionando, no acá.
  const { dni, ...sinDni } = { ...huecos(cliente, entrada, GRUPOS_FICHA), ...nombre };
  const parche = dni && !(await dniEnOtraFicha(dni, cliente.id, db)) ? { ...sinDni, dni } : sinDni;
  const vincular = Boolean(entrada.identificador) && !porCanal;
  if (!vincular && !Object.keys(parche).length) return cliente;

  return enTransaccion(db, async (tx) => {
    const completada = Object.keys(parche).length ? await tx.clientes.update({ where: { id: cliente.id }, data: parche }) : cliente;
    if (vincular) await tx.cliente_canales.create({ data: { cliente_id: cliente.id, canal: entrada.canal, identificador: entrada.identificador } });
    return completada;
  });
}

function crear({ canal, identificador, nombre, telefono, dni, email }, db) {
  return enTransaccion(db, async (tx) => {
    const cliente = await tx.clientes.create({ data: { canal, nombre, telefono, dni, email } });
    if (identificador) await tx.cliente_canales.create({ data: { cliente_id: cliente.id, canal, identificador } });
    return cliente;
  });
}

/**
 * La única puerta de alta de clientes: devuelve la ficha de la persona, creándola
 * solo si no existe. `datos = { canal, identificador?, telefono?, dni?, nombre?, email? }`.
 * `canal` es el de origen (whatsapp, facebook, instagram, web, presencial) e
 * `identificador` el wa_id u otro id de mensajería. Devuelve `{ cliente, creado }`.
 * Si otro pedido carga a la misma persona al mismo tiempo, con el cliente de Prisma busca una vez más y
 * devuelve esa ficha; con un `tx` lanza 409, porque su transacción no vería la ficha del otro pedido.
 */
export async function resolverCliente(datos, db = prisma) {
  const entrada = prepararEntrada(datos);
  try {
    const encontrada = await buscar(entrada, db);
    if (encontrada) return { cliente: await completar(encontrada, entrada, db), creado: false };
    return { cliente: await crear(entrada, db), creado: true };
  } catch (e) {
    if (e?.code !== "P2002") throw e;
    // Otro pedido ganó la carrera (mismo número o mismo DNI). Dentro de la transacción de quien llama (REPEATABLE
    // READ) la búsqueda correría en el snapshot de esa transacción y no vería su ficha: que vuelva a intentar.
    if (!esClienteRaiz(db)) throw error("Esa persona se acaba de cargar desde otro pedido. Volvé a intentar.", 409);
    const ganadora = await buscar(entrada, db);
    if (!ganadora) throw e;
    return { cliente: await completar(ganadora, entrada, db), creado: false };
  }
}

// ── Fusión: fusionarClientes ──

async function fichaParaFusionar(id, tx) {
  const ficha = await tx.clientes.findUnique({ where: { id } });
  if (!ficha) throw error(`El cliente ${id} no existe.`, 404);
  if (ficha.deleted_at) throw error(`El cliente ${id} ya está archivado.`, 409);
  return ficha;
}

// Un CHECK impide que alguien sea su propio cónyuge en un ingreso. Si las dos fichas son
// titular y cónyuge de uno, el dato se contradice y lo resuelve una persona.
async function verificarConyuges(origenId, destinoId, tx) {
  const cruzado = await tx.consignacion_ingresos.findFirst({
    where: {
      OR: [
        { cliente_id: origenId, conyuge_cliente_id: destinoId },
        { cliente_id: destinoId, conyuge_cliente_id: origenId },
      ],
    },
    select: { id: true },
  });
  if (cruzado) throw error(`Las fichas son titular y cónyuge del mismo ingreso (${cruzado.id}): revisalo a mano antes de fusionar.`, 409);
}

// Pasa al destino las filas del origen. Los ids se anotan antes: con ellos se audita o se deshace.
// Las de CONSERVAN_FECHA se mueven de a una, escribiendo el `updated_at` que ya tenían.
async function moverFilas({ modelo, campo }, origenId, destinoId, tx) {
  const conservaFecha = CONSERVAN_FECHA.has(modelo);
  const filas = await tx[modelo].findMany({ where: { [campo]: origenId }, select: conservaFecha ? { id: true, updated_at: true } : { id: true } });
  if (conservaFecha) {
    for (const { id, updated_at } of filas) await tx[modelo].update({ where: { id }, data: { [campo]: destinoId, updated_at } });
  } else if (filas.length) {
    await tx[modelo].updateMany({ where: { [campo]: origenId }, data: { [campo]: destinoId } });
  }
  return filas.map(({ id }) => Number(id)); // los ids BigInt no entran en un JSON
}

// El perfil es 1 a 1: el del origen pasa si el destino no tiene (conservando su `updated_at`, como en
// CONSERVAN_FECHA); si los dos tienen, se completa el del destino (un cambio de datos: ahí `updated_at`
// sí se actualiza) y el del origen queda con el origen archivado.
async function unirPerfiles(origenId, destinoId, tx) {
  const perfiles = await tx.cliente_perfiles.findMany({ where: { cliente_id: { in: [origenId, destinoId] } } });
  const delOrigen = perfiles.find((p) => p.cliente_id === origenId);
  const delDestino = perfiles.find((p) => p.cliente_id === destinoId);

  if (!delOrigen) return { accion: "sin_perfil" };
  if (!delDestino) {
    await tx.cliente_perfiles.update({ where: { id: delOrigen.id }, data: { cliente_id: destinoId, updated_at: delOrigen.updated_at } });
    return { accion: "movido", perfilId: delOrigen.id };
  }
  const campos = huecos(delDestino, delOrigen, GRUPOS_PERFIL);
  if (Object.keys(campos).length) await tx.cliente_perfiles.update({ where: { id: delDestino.id }, data: campos });
  return { accion: "completado", perfilOrigenId: delOrigen.id, perfilDestinoId: delDestino.id, campos };
}

const cantidades = (movidos) => Object.fromEntries(Object.entries(movidos).map(([clave, ids]) => [clave, ids.length]));

async function fusionar({ origenId, destinoId, motivo }, tx) {
  const origen = await fichaParaFusionar(origenId, tx);
  const destino = await fichaParaFusionar(destinoId, tx);
  const dniOrigen = claveDni(origen.dni);
  const dniDestino = claveDni(destino.dni);
  if (dniOrigen && dniDestino && dniOrigen !== dniDestino) {
    throw error("Las fichas tienen DNI distintos: no son la misma persona.", 409);
  }
  if (origen.cuil && destino.cuil && origen.cuil !== destino.cuil) {
    throw error("Las fichas tienen CUIL distintos: no son la misma persona.", 409);
  }
  await verificarConyuges(origenId, destinoId, tx);

  // El origen se archiva antes de completar el DNI del destino: el índice único de DNI vale entre vigentes.
  await tx.clientes.update({ where: { id: origenId }, data: { deleted_at: new Date(), fusionado_en_id: destinoId } });

  const movidos = {};
  for (const tabla of FILAS_HIJAS) movidos[tabla.clave] = await moverFilas(tabla, origenId, destinoId, tx);
  const perfil = await unirPerfiles(origenId, destinoId, tx);

  const completados = huecos(destino, { ...origen, telefono: telefonoDeFicha(origen.telefono, origen.canal) ?? origen.telefono }, GRUPOS_FICHA);
  if (Object.keys(completados).length) await tx.clientes.update({ where: { id: destinoId }, data: completados });

  const fotoDelOrigen = JSON.parse(JSON.stringify(origen)); // tal como estaba antes de archivarlo
  const detalle = { movidos, completados, perfil, origen: fotoDelOrigen };
  const { id: fusionId } = await tx.cliente_fusiones.create({
    data: { origen_id: origenId, destino_id: destinoId, motivo, detalle },
    select: { id: true },
  });
  return { fusionId, origenId, destinoId, motivo, movidos: cantidades(movidos), completados, perfil: perfil.accion };
}

/**
 * Fusiona la ficha `origenId` en la `destinoId`: las filas hijas pasan al destino, se le
 * completan los huecos, el origen se archiva y queda el registro en `cliente_fusiones`.
 * Nunca fusiona fichas con DNI distinto (409). Todo en una transacción.
 */
export async function fusionarClientes({ origenId, destinoId, motivo = "manual" } = {}, db = prisma) {
  const ids = { origenId: Number(origenId), destinoId: Number(destinoId) };
  if (![ids.origenId, ids.destinoId].every((id) => Number.isInteger(id) && id > 0)) throw error("Indicá la ficha de origen y la de destino.");
  if (ids.origenId === ids.destinoId) throw error("No se puede fusionar una ficha consigo misma.");
  if (!MOTIVOS.includes(motivo)) throw error(`El motivo debe ser uno de: ${MOTIVOS.join(", ")}.`);

  return enTransaccion(db, (tx) => fusionar({ ...ids, motivo }, tx), { timeout: TIMEOUT_FUSION_MS });
}

// ── Plan: planDeUnificacion ──

function agruparPor(items, clave) {
  const grupos = new Map();
  for (const item of items) {
    const k = clave(item);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(item);
  }
  return grupos;
}

// Lo que el plan compara de cada ficha: la clave del DNI y el teléfono, que solo cuenta si ya es nacional.
const fichaDelPlan = (c) => ({
  id: c.id,
  nombre: c.nombre ?? null,
  canal: c.canal,
  dniOriginal: c.dni ?? null,
  dni: claveDni(c.dni),
  telefono: TELEFONO_NACIONAL.test(c.telefono ?? "") ? c.telefono : null,
});

const tieneDniNoValido = (ficha) => ficha.dni !== null && !DNI_VALIDO.test(ficha.dni);

// Une las fichas del mismo DNI y, por teléfono, las que no se contradicen. `raiz(id)` dice a qué grupo
// pertenece cada ficha y `dudosos` los teléfonos que no se pudieron usar.
function unirPorDniYTelefono(fichas) {
  const padre = new Map(fichas.map((f) => [f.id, f.id]));
  const raiz = (id) => {
    let actual = id;
    while (padre.get(actual) !== actual) actual = padre.get(actual);
    return actual;
  };
  const unirTodas = ([primera, ...resto]) => resto.forEach((f) => padre.set(raiz(f.id), raiz(primera.id)));

  agruparPor(fichas.filter((f) => f.dni), (f) => f.dni).forEach(unirTodas);

  const dudosos = [];
  for (const [telefono, delTelefono] of agruparPor(fichas.filter((f) => f.telefono), (f) => f.telefono)) {
    const dnis = new Set(delTelefono.map((f) => f.dni).filter(Boolean));
    if (dnis.size > 1) {
      dudosos.push({ telefono, fichas: delTelefono.map((f) => ({ id: f.id, dni: f.dniOriginal, canal: f.canal, nombre: f.nombre })) });
    } else {
      unirTodas(delTelefono);
    }
  }
  return { raiz, dudosos };
}

/**
 * Decide qué fichas vigentes son la misma persona. Pura: no toca la base.
 * Recibe las fichas como las lee Prisma, `[{ id, nombre, canal, telefono, dni }]`, con el `telefono` que dejó
 * `normalizarTelefonos` (los 10 dígitos nacionales): no lee `canal_id` ni vuelve a normalizar, y un teléfono
 * que no sea de 10 dígitos no cruza con nada.
 * 1) mismo DNI → misma persona. 2) por cada teléfono, si sus fichas (contando lo ya unido por DNI) tienen a lo
 * sumo un DNI distinto, se unen; con dos o más el teléfono es dudoso y no se une nada por él.
 * Una ficha cuyo DNI no es de 7 a 9 dígitos (un pasaporte, "S/D") no se une por nada, ni por DNI ni por
 * teléfono: dos "S/D" no son la misma persona. Va aparte, para que la revise una persona.
 * Devuelve `{ grupos: [{ destinoId, origenes: [{ id, motivo }] }], dudosos: [{ telefono, fichas }],
 * revisar: [{ id, motivo }] }`.
 */
export function planDeUnificacion(clientes) {
  const todas = [...clientes].sort((a, b) => a.id - b.id).map(fichaDelPlan);
  const revisar = todas.filter(tieneDniNoValido).map(({ id }) => ({ id, motivo: MOTIVO_DNI_NO_VALIDO }));
  const fichas = todas.filter((ficha) => !tieneDniNoValido(ficha));

  const { raiz, dudosos } = unirPorDniYTelefono(fichas);

  const grupos = [...agruparPor(fichas, (f) => raiz(f.id)).values()]
    .filter((miembros) => miembros.length > 1)
    .map((miembros) => {
      const destino = miembros.find((f) => f.dni) ?? miembros[0];
      const origenes = miembros
        .filter((f) => f !== destino)
        .map((f) => ({ id: f.id, motivo: f.dni && f.dni === destino.dni ? "mismo_dni" : "mismo_telefono" }));
      return { destinoId: destino.id, origenes };
    })
    .sort((a, b) => a.destinoId - b.destinoId);

  return { grupos, dudosos, revisar };
}

// ── Teléfonos: normalizarTelefonos ──

/**
 * A cada ficha vigente le deja `telefono` con los 10 dígitos nacionales. Las de WhatsApp
 * sin teléfono lo toman de su `cliente_canales`. Solo actualiza si cambia y no toca las
 * que no se pueden normalizar, entre ellas las de un número de WhatsApp de otro país (sin el 54).
 * Devuelve `[{ id, antes, despues }]`.
 */
export async function normalizarTelefonos(db = prisma) {
  const fichas = await db.clientes.findMany({
    where: VIGENTE_CLIENTE,
    select: { id: true, canal: true, telefono: true },
    orderBy: { id: "asc" },
  });
  const canales = await db.cliente_canales.findMany({
    where: { canal: "whatsapp" },
    select: { cliente_id: true, identificador: true },
    orderBy: { id: "asc" },
  });
  const whatsappDe = new Map();
  for (const { cliente_id, identificador } of canales) {
    if (!whatsappDe.has(cliente_id)) whatsappDe.set(cliente_id, identificador);
  }

  const cambios = [];
  for (const { id, canal, telefono } of fichas) {
    const despues = telefonoDeFicha(telefono, canal, whatsappDe.get(id));
    if (!despues || despues === telefono) continue;
    await db.clientes.update({ where: { id }, data: { telefono: despues } });
    cambios.push({ id, antes: telefono ?? null, despues });
  }
  return cambios;
}

// ── DNIs: normalizarDnis ──

/**
 * A cada ficha vigente le deja `dni` en su forma de comparar (`claveDni`): sin puntos, espacios ni guiones
 * y en mayúsculas ("30.125.678" → "30125678"), que es como lo comparan resolverCliente, planDeUnificacion y
 * fusionarClientes. Un documento con letras las conserva ("AB123456" no se vuelve "123456"). Solo actualiza si
 * cambia y no toca los vacíos. Si el índice único de DNI (074) ya existe y dos fichas coinciden recién al
 * normalizar, el error del índice corta: esas se fusionan antes.
 * Devuelve `[{ id, antes, despues }]`.
 */
export async function normalizarDnis(db = prisma) {
  const fichas = await db.clientes.findMany({
    where: VIGENTE_CLIENTE,
    select: { id: true, dni: true },
    orderBy: { id: "asc" },
  });

  const cambios = [];
  for (const { id, dni } of fichas) {
    const despues = claveDni(dni);
    if (!despues || despues === dni) continue;
    await db.clientes.update({ where: { id }, data: { dni: despues } });
    cambios.push({ id, antes: dni, despues });
  }
  return cambios;
}
