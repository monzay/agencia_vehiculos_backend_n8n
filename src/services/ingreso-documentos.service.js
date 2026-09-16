import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { CATALOGO, TIPOS, validarDatosDocumento } from "../lib/documentos-catalogo.js";
import { mapDocumento } from "../mappers/ingreso.mapper.js";
import { validarPathnamesDeBlob } from "../lib/imagenes-blob.js";
import { firmarImagenes } from "../lib/blob-privado.js";
import { datosVehiculo, dominioLibre } from "./ingresos.service.js";

// Los papeles de un ingreso. Lo que cambia de un tipo a otro está declarado en
// el catálogo (lib/documentos-catalogo.js); acá solo se aplica.

const VIGENTE = { deleted_at: null };

// Qué pasó con el PAPEL, que no es lo mismo que haber subido la foto.
// `no_recibido` es el default porque cargar un escaneo no prueba tenencia.
const TENENCIAS = ["no_recibido", "copia", "original"];

function error(mensaje, status = 400) {
  const e = new Error(mensaje);
  e.status = status;
  return e;
}

const limpiar = (v, max) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : null);

// `Prisma.DbNull` deja la columna JSON en NULL de verdad; un `null` a secas
// guardaría el valor json `null`, que no es lo mismo.
function validarImagenes(valor) {
  const pathnames = validarPathnamesDeBlob(valor);
  return pathnames?.length ? pathnames : Prisma.DbNull;
}

// El catálogo decide si este tipo de papel lleva fecha de vencimiento.
function validarVencimiento(tipo, valor) {
  const regla = CATALOGO[tipo].vencimiento;

  if (valor === undefined || valor === null || valor === "") {
    if (regla === "requerido") throw error(`${CATALOGO[tipo].label} necesita una fecha de vencimiento.`);
    return null;
  }
  if (regla === "no") throw error(`${CATALOGO[tipo].label} no vence.`);

  const iso = String(valor).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || Number.isNaN(Date.parse(iso))) {
    throw error("La fecha de vencimiento no es válida.");
  }
  return new Date(`${iso}T00:00:00Z`);
}

// Lo usa también la extracción de datos, para no repetir la búsqueda.
export async function ingresoVigente(ingresoId, tx = prisma) {
  const n = Number(ingresoId);
  if (!Number.isInteger(n) || n <= 0) throw error("Ingreso inválido.", 404);
  const ingreso = await tx.consignacion_ingresos.findFirst({
    where: { id: n, ...VIGENTE },
    select: { id: true, dominio: true, marca: true, modelo: true, anio: true, motor: true, chasis: true, origen: true },
  });
  if (!ingreso) throw error("Ingreso no encontrado.", 404);
  return ingreso;
}

export async function listarDocumentos(ingresoId) {
  const ingreso = await ingresoVigente(ingresoId);
  const filas = await prisma.consignacion_documentos.findMany({
    where: { ingreso_id: ingreso.id, ...VIGENTE },
    include: { usuarios: { select: { id: true, nombre: true } } },
    orderBy: { id: "asc" },
  });
  return filas.map((d) => mapDocumento(d, ingreso));
}

// Convierte los pathnames guardados en URLs que el panel puede mostrar por un
// rato. Se pide al abrir un papel, no al listar el ingreso: firmar imágenes que
// nadie va a mirar es trabajo al pedo, y cada firma es un enlace más que existe.
//
// Sirve también para las imágenes recién subidas y todavía sin guardar, que es
// lo que necesita el formulario para mostrar la vista previa.
export async function firmarImagenesDocumento(ingresoId, imagenes) {
  await ingresoVigente(ingresoId);
  const pathnames = validarPathnamesDeBlob(imagenes);
  if (!pathnames?.length) return [];
  return firmarImagenes(pathnames);
}

// Guarda el papel de un tipo. Si ya hay uno vigente de ese tipo lo actualiza:
// un ingreso tiene un título, no cinco. Para reemplazarlo por uno nuevo (una
// VTV renovada, por ejemplo) se borra el anterior y se vuelve a cargar, y el
// viejo queda con `deleted_at` para auditoría.
//
// Si el papel es la fuente del vehículo (el título), en la misma transacción
// sus datos pasan al ingreso: o se guardan los dos, o ninguno.
export async function guardarDocumento(ingresoId, body = {}, usuarioId = null) {
  const tipo = body.tipo;
  if (!TIPOS.includes(tipo)) throw error(`El tipo de documento debe ser uno de: ${TIPOS.join(", ")}.`);

  const tenencia = body.tenencia ?? "no_recibido";
  if (!TENENCIAS.includes(tenencia)) throw error(`La tenencia debe ser una de: ${TENENCIAS.join(", ")}.`);

  // Si la agencia tiene el papel, tiene que poder decir dónde está. Un original
  // "en algún lado" es un original perdido el día que hay que transferir.
  const ubicacion = limpiar(body.ubicacionFisica, 120) || null;
  if (tenencia !== "no_recibido" && !ubicacion) {
    throw error("Si el papel quedó en la agencia, indicá dónde está guardado.");
  }

  const data = {
    tenencia,
    datos_json: validarDatosDocumento(tipo, body.datos ?? {}),
    fecha_vencimiento: validarVencimiento(tipo, body.fechaVencimiento),
    ubicacion_fisica: ubicacion,
    observaciones: typeof body.observaciones === "string" ? body.observaciones.trim() || null : null,
    imagenes_json: validarImagenes(body.imagenes),
    cargado_por: usuarioId,
  };

  return prisma.$transaction(async (tx) => {
    let ingreso = await ingresoVigente(ingresoId, tx);

    if (CATALOGO[tipo].fuenteDelVehiculo) {
      const vehiculo = datosVehiculo(data.datos_json);
      if (vehiculo.dominio !== ingreso.dominio) await dominioLibre(vehiculo.dominio, ingreso.id, tx);
      await tx.consignacion_ingresos.update({ where: { id: ingreso.id }, data: vehiculo });
      ingreso = { ...ingreso, ...vehiculo };
    }

    const existente = await tx.consignacion_documentos.findFirst({
      where: { ingreso_id: ingreso.id, tipo, ...VIGENTE },
      select: { id: true },
    });

    const guardado = existente
      ? await tx.consignacion_documentos.update({
          where: { id: existente.id },
          data: { ...data, fecha_carga: new Date() },
          include: { usuarios: { select: { id: true, nombre: true } } },
        })
      : await tx.consignacion_documentos.create({
          data: { ...data, ingreso_id: ingreso.id, tipo },
          include: { usuarios: { select: { id: true, nombre: true } } },
        });

    return mapDocumento(guardado, ingreso);
  });
}

export async function eliminarDocumento(ingresoId, documentoId) {
  const ingreso = await ingresoVigente(ingresoId);
  const n = Number(documentoId);
  if (!Number.isInteger(n) || n <= 0) return false;

  const existe = await prisma.consignacion_documentos.findFirst({
    where: { id: n, ingreso_id: ingreso.id, ...VIGENTE },
    select: { id: true },
  });
  if (!existe) return false;

  await prisma.consignacion_documentos.update({ where: { id: existe.id }, data: { deleted_at: new Date() } });
  return true;
}
