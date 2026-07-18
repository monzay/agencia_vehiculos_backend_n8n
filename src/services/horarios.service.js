import { prisma } from "../lib/prisma.js";

// Horarios de atención: una fila por día (0=Domingo … 6=Sábado, getDay()). El
// admin los edita desde Configuración y el bot los usa para responder si la
// agencia está abierta. `apertura`/`cierre` son "HH:MM" (24 h); NULL si cierra.

const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DIAS = [0, 1, 2, 3, 4, 5, 6];
const NOMBRE = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

class DatosInvalidos extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = "DatosInvalidos";
    this.status = 400;
  }
}

const mapear = (h) => ({
  dia: h.dia,
  abierto: !!h.abierto,
  apertura: h.apertura ?? null,
  cierre: h.cierre ?? null,
});

// Normaliza y valida un día. Cerrado ⇒ sin horas; abierto ⇒ ambas en HH:MM y
// apertura anterior al cierre (el compare de strings alcanza: HH:MM con cero a
// la izquierda ordena igual que la hora).
function validarDia(item) {
  const dia = Number(item?.dia);
  if (!DIAS.includes(dia)) throw new DatosInvalidos("Día inválido.");

  const abierto = item?.abierto === true || item?.abierto === 1 || item?.abierto === "1";
  if (!abierto) return { dia, abierto: false, apertura: null, cierre: null };

  const apertura = String(item?.apertura ?? "").trim();
  const cierre = String(item?.cierre ?? "").trim();
  if (!HORA_RE.test(apertura) || !HORA_RE.test(cierre)) {
    throw new DatosInvalidos(`El horario del ${NOMBRE[dia]} debe ser HH:MM (24 h).`);
  }
  if (apertura >= cierre) {
    throw new DatosInvalidos(`El ${NOMBRE[dia]} la apertura debe ser anterior al cierre.`);
  }
  return { dia, abierto: true, apertura, cierre };
}

export async function obtenerHorarios() {
  const filas = await prisma.horarios_atencion.findMany({ orderBy: { dia: "asc" } });
  return filas.map(mapear);
}

// Reemplaza los días recibidos (uno o varios). Valida todo antes de tocar la
// base y aplica los upserts en una transacción: o entran todos, o ninguno.
export async function guardarHorarios(dias) {
  if (!Array.isArray(dias) || dias.length === 0) {
    throw new DatosInvalidos("Enviá los horarios a guardar.");
  }
  const validos = dias.map(validarDia);
  if (new Set(validos.map((d) => d.dia)).size !== validos.length) {
    throw new DatosInvalidos("Hay días repetidos.");
  }

  await prisma.$transaction(
    validos.map((d) =>
      prisma.horarios_atencion.upsert({
        where: { dia: d.dia },
        update: { abierto: d.abierto, apertura: d.apertura, cierre: d.cierre },
        create: d,
      })
    )
  );
  return obtenerHorarios();
}
