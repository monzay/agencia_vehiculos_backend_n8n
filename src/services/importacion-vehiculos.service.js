import { prisma } from "../lib/prisma.js";
import { firmarImagenes } from "../lib/blob-privado.js";
import { leerDocumento } from "../lib/vision-claude.js";
import {
  CAMPOS,
  ESQUEMA_LISTA,
  INSTRUCCION_LISTA,
  MAX_FILAS,
  clasificarFilas,
  claveDeAuto,
  normalizarFilas,
  validarArchivosDeLista,
} from "../lib/lista-vehiculos.js";
import { datosDeAlta, siguienteRef } from "./vehiculos.service.js";

// Importar la lista de vehículos de la agencia, en dos pasos:
//   1. leerListaVehiculos: la IA lee los archivos y devuelve una propuesta, fila
//      por fila, comparada con el stock. No guarda nada.
//   2. importarVehiculos: una persona confirma las filas y se crean los autos,
//      sin publicar.
// Dos frenos contra los duplicados. La huella de cada archivo es única, así que
// el mismo archivo no se lee ni se importa dos veces. Y cada fila se compara con
// el stock, así que otra foto de la misma lista no vuelve a crear lo que ya está.

const STOCK_A_LA_VENTA = { deleted_at: null, vendido_at: null };
const DATOS_PARA_COMPARAR = { ref: true, marca: true, modelo: true, version: true, anio: true, kms: true };
const ZONA_AR = "America/Argentina/Buenos_Aires";

// READ COMMITTED: cada lectura ve lo confirmado en ese momento. Con el REPEATABLE
// READ por defecto, el stock y el próximo `ref` saldrían de una foto tomada al
// principio, y una carga hecha mientras tanto no se vería.
const TRANSACCION = { isolationLevel: "ReadCommitted", timeout: 15_000, maxWait: 5_000 };

function error(mensaje, status = 400) {
  const e = new Error(mensaje);
  e.status = status;
  return e;
}

const stockParaComparar = (tx = prisma) =>
  tx.autos.findMany({ where: STOCK_A_LA_VENTA, select: DATOS_PARA_COMPARAR });

function mensajeYaImportada({ created_at, creados }) {
  const fecha = new Date(created_at).toLocaleDateString("es-AR", { timeZone: ZONA_AR });
  const autos = creados === 1 ? "1 vehículo" : `${creados} vehículos`;
  return `Esta lista ya se importó el ${fecha} y se crearon ${autos}. Si falta alguno, cargalo a mano.`;
}

async function exigirHuellasNuevas(archivos, tx = prisma) {
  const usada = await tx.importaciones_vehiculos_archivos.findFirst({
    where: { huella: { in: archivos.map((a) => a.huella) } },
    select: { importacion: { select: { created_at: true, creados: true } } },
  });
  if (usada) throw error(mensajeYaImportada(usada.importacion), 409);
}

// `leer` y `firmar` se reciben para poder probar el flujo sin la IA ni el store.
export async function leerListaVehiculos({ archivos } = {}, { leer = leerDocumento, firmar = firmarImagenes } = {}) {
  const validos = validarArchivosDeLista(archivos);
  await exigirHuellasNuevas(validos);

  // El store es privado: la IA descarga los archivos con URLs firmadas que duran minutos.
  const urls = await firmar(validos.map((a) => a.pathname));
  const urlsDe = (tipo) => validos.flatMap((a, i) => (a.tipo === tipo ? [urls[i]] : []));
  const leido = await leer({
    imagenes: urlsDe("imagen"),
    pdfs: urlsDe("pdf"),
    instruccion: INSTRUCCION_LISTA,
    esquema: ESQUEMA_LISTA,
  });

  const filas = normalizarFilas(leido);
  if (!filas.length) {
    throw error("No encontramos vehículos en la lista. Probá con una foto más nítida o con el PDF.", 422);
  }
  // Filas sin modelo o pasado el tope: se avisan para cargarlas a mano.
  const leidas = Array.isArray(leido?.vehiculos) ? leido.vehiculos.length : filas.length;
  return { filas: clasificarFilas(filas, await stockParaComparar()), descartadas: leidas - filas.length };
}

// Solo los campos del formulario: lo demás que traiga la fila (estado, dudosos,
// o lo que mande el cliente, como `disponible` o `costo`) no llega al alta.
const camposDelFormulario = (fila) => Object.fromEntries(CAMPOS.filter((c) => c in fila).map((c) => [c, fila[c]]));

// El error nombra el vehículo y no su número: la persona tildó algunas filas de
// la lista y el número de la fila elegida no coincide con el de la tabla.
const nombreDeFila = (fila, indice) =>
  [fila.marca, fila.modelo, fila.anio].filter((v) => typeof v === "string" || typeof v === "number").join(" ") ||
  `La fila ${indice + 1}`;

function datosDeFila(fila, indice) {
  if (fila === null || typeof fila !== "object") throw error(`La fila ${indice + 1} no es un vehículo.`);
  const campos = camposDelFormulario(fila);
  try {
    // Sin precio en la lista entra en 0: queda sin publicar y el formulario pide uno para guardarlo.
    return datosDeAlta({ ...campos, precio: campos.precio ?? 0 });
  } catch (e) {
    throw error(`${nombreDeFila(fila, indice)}: ${e.message}`, e.status ?? 400);
  }
}

export async function importarVehiculos({ archivos, vehiculos } = {}, usuarioId = null) {
  const validos = validarArchivosDeLista(archivos);
  if (!Array.isArray(vehiculos) || !vehiculos.length) throw error("Elegí al menos un vehículo para importar.");
  if (vehiculos.length > MAX_FILAS) throw error(`Se pueden importar hasta ${MAX_FILAS} vehículos por lista.`);
  const datos = vehiculos.map(datosDeFila);

  return prisma.$transaction(async (tx) => {
    await exigirHuellasNuevas(validos, tx);
    // Se vuelve a comparar acá adentro: la propuesta pudo quedar vieja. Solo contra
    // el stock: dos filas iguales elegidas a propósito (dos unidades 0km) se crean.
    const enStock = new Set((await stockParaComparar(tx)).map(claveDeAuto).filter(Boolean));
    const aCrear = datos.filter((d) => !enStock.has(claveDeAuto(d)));
    const resultado = { creados: aCrear.length, omitidos: datos.length - aCrear.length };

    // Si otra pantalla registró la misma huella recién, el índice único corta acá y
    // la transacción no deja nada.
    const importacion = await tx.importaciones_vehiculos.create({
      data: {
        usuario_id: usuarioId,
        ...resultado,
        archivos: { create: validos.map(({ huella, pathname }) => ({ huella, pathname })) },
      },
      select: { id: true },
    });

    if (aCrear.length) {
      const primera = Number(await siguienteRef(tx));
      await tx.autos.createMany({
        data: aCrear.map((d, i) => ({ ...d, ref: String(primera + i), disponible: false, importacion_id: importacion.id })),
      });
    }
    return resultado;
  }, TRANSACCION);
}
