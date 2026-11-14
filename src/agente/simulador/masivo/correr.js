// Corre un caso (varios turnos de un cliente) por el orquestador real y chequea lo esperado contra la base.
// No importa Prisma: recibe `root`, `dbAgente` y el doble de Claude por parámetro.
import { randomUUID } from "node:crypto";
import { atenderMensaje } from "../../atender.js";

// Un audio de relleno: lo que "dice" lo decide el guion de Groq falso, no estos bytes.
const AUDIO_DE_RELLENO = { media_type: "audio/ogg", data: Buffer.alloc(256, 1).toString("base64") };

export async function correrCaso(caso, deps) {
  const salidas = [];
  // El falso de Claude anota dónde empieza cada turno, para que chequear sepa qué llamadas son de cuál.
  const claude = deps.anthropic;
  if (claude && Array.isArray(claude.llamadas)) claude.inicioDeTurnos = [];
  for (const turno of caso.turnos) {
    if (claude?.inicioDeTurnos) claude.inicioDeTurnos.push(claude.llamadas.length);
    const entrada = {
      telefono: caso.telefono,
      wamid: `sim.${randomUUID()}`,
      nombre: turno.nombre ?? undefined,
      texto: turno.texto ?? undefined,
      ahora: turno.ahora ? new Date(turno.ahora) : undefined,
      ...(turno.audio && { audio: AUDIO_DE_RELLENO }),
    };
    salidas.push(await atenderMensaje(entrada, { esperaRafagaMs: 0, ...deps }));
  }
  return salidas;
}

async function clienteDe(root, telefono) {
  const canal = await root.cliente_canales.findFirst({ where: { canal: "whatsapp", identificador: String(telefono) }, select: { cliente_id: true } });
  if (canal) return canal.cliente_id;
  const cliente = await root.clientes.findFirst({ where: { telefono: { contains: String(telefono).slice(-8) } }, select: { id: true } });
  return cliente?.id ?? null;
}

export async function chequear(caso, { root, claude }) {
  const fallas = [];
  const esperado = caso.esperado ?? {};
  const clienteId = await clienteDe(root, caso.telefono);
  const consultas = clienteId == null ? [] : await root.chat_estado.findMany({ where: { cliente_id: clienteId }, orderBy: { id: "asc" } });

  if (esperado.consultas !== undefined && consultas.length !== esperado.consultas) {
    fallas.push(`consultas: se esperaban ${esperado.consultas} y hay ${consultas.length}`);
  }
  if (esperado.autoFinal !== undefined) {
    const ultima = consultas.at(-1);
    const auto = ultima?.auto_id == null ? null : await root.autos.findUnique({ where: { id: ultima.auto_id }, select: { ref: true } });
    if (auto?.ref !== esperado.autoFinal) fallas.push(`autoFinal: se esperaba ${esperado.autoFinal} y quedó ${auto?.ref ?? "ninguno"}`);
  }
  if (esperado.noLlegaAClaude?.length) {
    // Lo que no tiene que llegar es lo viejo: se miran las llamadas del último turno (todas si el caso tiene uno solo).
    const llamadas = claude?.llamadas ?? [];
    const inicios = claude?.inicioDeTurnos ?? [];
    const desde = inicios.length > 1 ? inicios.at(-1) : 0;
    const texto = JSON.stringify(llamadas.slice(desde).map((l) => l.messages));
    for (const marca of esperado.noLlegaAClaude) {
      if (texto.includes(JSON.stringify(marca).slice(1, -1))) fallas.push(`noLlegaAClaude: "${marca}" le llegó a Claude`);
    }
  }
  return { ok: fallas.length === 0, fallas };
}
