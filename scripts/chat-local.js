// Chat por terminal con el bot (herramienta de desarrollo, NO corre en producción).
//
// Vos hacés de cliente: cada línea que escribís le llega al bot por el camino real
// (orquestador + Claude + base local), como si fuera un WhatsApp. Después de cada
// respuesta muestra el estado: calificación, permiso, CUIL y semáforo del BCRA.
//
// El BCRA es SIMULADO por defecto (nunca se consulta a nadie de verdad): elegí el
// resultado con --semaforo. Con --bcra-real consulta la API real: usalo solo con TU CUIL.
//
// Uso (desde web/backend):
//   node scripts/chat-local.js [--semaforo verde|amarillo|rojo|sin_datos|error] [--bcra-real]
//   node scripts/chat-local.js --limpiar     (borra el cliente de prueba para empezar de cero)
// Escribí /salir para terminar. Gasta centavos de Claude (suman al tope del mes).

import readline from "node:readline/promises";
import { randomUUID } from "node:crypto";
import { baseAutorizada, destinoDeLaBase } from "../src/lib/base-local.js";

process.loadEnvFile(".env");

const basesNoLocales = ["DATABASE_URL", "AGENTE_DATABASE_URL"].filter((nombre) => !baseAutorizada(process.env[nombre]));
if (process.env.NODE_ENV === "production" || basesNoLocales.length) {
  for (const nombre of basesNoLocales) console.error(`${nombre} apunta a ${destinoDeLaBase(process.env[nombre])}, que no es una base local.`);
  console.error("El chat de prueba corre solo contra la base local y fuera de producción.");
  process.exit(1);
}

// El mismo cliente que el backend (agrega el workspace de la API key).
const { crearClienteAnthropic } = await import("../src/lib/anthropic.js");
const { prisma } = await import("../src/lib/prisma.js");
const { dbAgente } = await import("../src/agente/db.js");
const { atenderMensaje } = await import("../src/agente/atender.js");
const { estadoCredito } = await import("../src/credito/verificacion.js");
const { crearClienteBcra } = await import("../src/credito/bcra.js");
const { crearBcraSimulado } = await import("../src/agente/simulador/bcra-simulado.js");

// Número reservado para las pruebas: no existe en WhatsApp.
const TELEFONO_PRUEBA = "5490000000999";
const NOMBRE_PRUEBA = "Prueba Local";

const argumento = (nombre, porDefecto = null) => {
  const i = process.argv.indexOf(`--${nombre}`);
  return i > 0 ? process.argv[i + 1] : porDefecto;
};

async function clienteDePrueba() {
  const canal = await prisma.cliente_canales.findUnique({
    where: { canal_identificador: { canal: "whatsapp", identificador: TELEFONO_PRUEBA } },
    select: { cliente_id: true },
  });
  return canal?.cliente_id ?? null;
}

// Borra solo lo que generó el número de prueba, en una transacción (si algo más
// apunta a esa ficha, la clave foránea lo frena y no se borra nada).
async function limpiar() {
  const clienteId = await clienteDePrueba();
  if (!clienteId) return console.log("No hay cliente de prueba: nada para borrar.");
  const sesiones = (await prisma.chat_estado.findMany({ where: { cliente_id: clienteId }, select: { id: true } })).map((s) => s.id);
  const delCliente = { where: { cliente_id: clienteId } };
  const borrados = await prisma.$transaction(async (tx) => ({
    usados: (await tx.vehiculo_cliente.deleteMany({ where: { sesion_id: { in: sesiones } } })).count,
    consultasCrediticias: (await tx.consultas_crediticias.deleteMany(delCliente)).count,
    consentimientos: (await tx.consentimientos.deleteMany(delCliente)).count,
    consumosIa: (await tx.ia_consumos.deleteMany(delCliente)).count,
    mensajes: (await tx.historial_mensajes.deleteMany(delCliente)).count,
    verificaciones: (await tx.verificacion_intentos.deleteMany(delCliente)).count,
    sesiones: (await tx.chat_estado.deleteMany(delCliente)).count,
    canales: (await tx.cliente_canales.deleteMany(delCliente)).count,
    cliente: (await tx.clientes.deleteMany({ where: { id: clienteId } })).count,
  }));
  console.log(`Cliente de prueba #${clienteId} borrado:`, borrados);
}

async function mostrarEstado(ahora) {
  const clienteId = await clienteDePrueba();
  if (!clienteId) return;
  const [cliente, sesion, consentimiento, consulta] = await Promise.all([
    prisma.clientes.findUnique({ where: { id: clienteId }, select: { cuil: true } }),
    prisma.chat_estado.findFirst({ where: { cliente_id: clienteId }, orderBy: [{ ultimo_mensaje: "desc" }, { id: "desc" }] }),
    prisma.consentimientos.findFirst({ where: { cliente_id: clienteId }, orderBy: { id: "desc" }, select: { acepta: true } }),
    prisma.consultas_crediticias.findFirst({ where: { cliente_id: clienteId }, orderBy: { id: "desc" } }),
  ]);
  const paso = sesion ? await estadoCredito({ db: prisma, clienteId, sesion, ahora }) : null;
  console.log(
    [
      `   ── calificación: ${sesion?.clasificacion ?? "—"} (${sesion?.score ?? 0} pts) · pago: ${sesion?.pago_tipo ?? "—"} · recibo: ${sesion?.credito_ok ?? "—"}`,
      `   ── permiso: ${consentimiento ? (consentimiento.acepta ? "SÍ" : "NO") : "—"} · CUIL: ${cliente?.cuil ?? "—"} · próximo paso del bot: ${paso ?? "nada"}`,
      `   ── BCRA: ${consulta ? `${consulta.estado} · ${consulta.semaforo ?? "sin verificar"} · a nombre de ${consulta.nombre_bcra ?? "—"}` : "sin consultar"}`,
    ].join("\n")
  );
}

async function conversar() {
  const semaforo = argumento("semaforo", "verde");
  const bcraReal = process.argv.includes("--bcra-real");
  const deps = {
    root: prisma,
    dbAgente: dbAgente(),
    anthropic: crearClienteAnthropic(),
    esperaRafagaMs: 0,
    bcra: bcraReal ? crearClienteBcra() : crearBcraSimulado(semaforo),
  };
  console.log(`Chat con el bot · BCRA ${bcraReal ? "REAL (usá solo TU CUIL)" : `simulado: ${semaforo}`} · /salir para terminar\n`);

  // Línea por línea: sirve escribiendo a mano o pasándole un archivo de mensajes (< mensajes.txt).
  const terminal = readline.createInterface({ input: process.stdin });
  const conEco = !process.stdin.isTTY;
  process.stdout.write("vos > ");
  for await (const linea of terminal) {
    const texto = linea.trim();
    if (conEco) console.log(texto);
    if (texto === "/salir") break;
    if (texto) {
      const r = await atenderMensaje({ telefono: TELEFONO_PRUEBA, nombre: NOMBRE_PRUEBA, wamid: `local.${randomUUID()}`, texto }, deps);
      console.log(`bot > ${r.texto ?? (r.envios?.length ? "(reaccionó con 👍)" : "(sin respuesta)")}`);
      if (r.fotos?.length) console.log(`      (+ ${r.fotos.length} fotos)`);
      await mostrarEstado(new Date());
    }
    process.stdout.write("vos > ");
  }
  terminal.close();
}

try {
  if (process.argv.includes("--limpiar")) await limpiar();
  else await conversar();
} finally {
  await prisma.$disconnect();
}
