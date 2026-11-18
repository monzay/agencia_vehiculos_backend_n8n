// El nombre lo dice el cliente (ajustes-por-chats-reales): nunca se toma del perfil de WhatsApp.
// Se guarda en la consulta (`nombre_declarado`) y, si la ficha todavía no tiene nombre, también en la ficha.
// Corre con el usuario del backend: `agente_ia` no tiene UPDATE sobre `nombre_declarado` ni sobre `clientes`.

// Lo que dicta el cliente va a un prompt y al panel: solo letras, en una línea y hasta 40 caracteres,
// así no puede colar instrucciones.
export const nombreSeguro = (nombre) =>
  String(nombre ?? "")
    .replace(/[^\p{L}\p{M}' .-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);

const enBlanco = (v) => v === null || v === undefined || String(v).trim() === "";

// Nombre que dijo el cliente: el de la consulta en curso y, si no hay, el último de sus consultas anteriores.
export async function nombreDichoDelCliente({ db, clienteId, sesion }) {
  if (!enBlanco(sesion?.nombre_declarado)) return String(sesion.nombre_declarado).trim();
  if (clienteId == null) return null;
  // `not: ""` deja afuera también los NULL; se toman unas pocas por si alguna quedó en blanco.
  const anteriores = await db.chat_estado.findMany({
    where: { cliente_id: clienteId, nombre_declarado: { not: "" } },
    orderBy: [{ ultimo_mensaje: "desc" }, { id: "desc" }],
    take: 5,
    select: { nombre_declarado: true },
  });
  const hallada = anteriores.find((c) => !enBlanco(c.nombre_declarado));
  return hallada ? String(hallada.nombre_declarado).trim() : null;
}

// La consulta siempre queda con el nombre. La ficha solo se completa si no tenía nombre o si tenía el
// mismo que el cliente había dicho antes en esta consulta (se corrigió); un nombre distinto no se pisa.
export async function guardarNombreDicho({ db, clienteId, sesionId }, nombre) {
  const nuevo = String(nombre ?? "").trim();
  if (!nuevo) return;
  const consulta = await db.chat_estado.findUnique({ where: { id: sesionId }, select: { nombre_declarado: true } });
  const anterior = consulta?.nombre_declarado;
  if (anterior !== nuevo) await db.chat_estado.update({ where: { id: sesionId }, data: { nombre_declarado: nuevo } });
  const ficha = await db.clientes.findUnique({ where: { id: clienteId }, select: { nombre: true } });
  const vacia = enBlanco(ficha?.nombre);
  const eraElDeEstaConsulta = !enBlanco(anterior) && String(ficha?.nombre).trim() === String(anterior).trim();
  if ((vacia || eraElDeEstaConsulta) && String(ficha?.nombre ?? "").trim() !== nuevo) {
    await db.clientes.update({ where: { id: clienteId }, data: { nombre: nuevo } });
  }
}

// ¿El texto que salió al cliente le pide el nombre? Una pregunta que use alguna de estas formas
// (sin distinguir mayúsculas ni tildes). Solo así se marca `nombre_pedido_at`.
const sinTildes = (t) => String(t ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const FORMAS_DE_PEDIR_EL_NOMBRE = /tu nombre|como te llamas|cual es tu nombre|a nombre de quien/;
export const pideElNombre = (texto) => /[?¿]/.test(String(texto ?? "")) && FORMAS_DE_PEDIR_EL_NOMBRE.test(sinTildes(texto));
