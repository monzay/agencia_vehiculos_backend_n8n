import { prisma } from "../lib/prisma.js";
import { mapIngreso } from "../mappers/ingreso.mapper.js";
import { mapPersona } from "./personas.service.js";
import { marcarVendido, deshacerVenta } from "./vehiculos.service.js";

// Sacar un auto en consignación a la venta, y volver a guardarlo.
//
// Publicar no es marcar un campo: es crear la ficha que ve cualquiera que entre
// al sitio. Por eso vive en su propio archivo y no en el CRUD del ingreso —
// mueve tres tablas a la vez y cada una tiene su regla.
//
// El estado del ingreso y lo que se ve en la web tienen que ir siempre juntos.
// Un ingreso "retirado" cuyo auto sigue publicado es alguien consultando por un
// auto que ya no está. Por eso este archivo es la ÚNICA puerta al estado: cada
// transición hace su efecto sobre el catálogo en la misma transacción.

const VIGENTE = { deleted_at: null };
// Los estados que se eligen desde Documentos. "vendido" no está: lo pone la
// venta, y se deshace con Deshacer venta, en el legajo.
const ESTADOS = ["recepcion", "publicado", "retirado"];

function error(mensaje, status = 400) {
  const e = new Error(mensaje);
  e.status = status;
  return e;
}

const PARA_DETALLE = {
  titular: { include: { cliente_perfiles: true } },
  usuarios: { select: { id: true, nombre: true } },
  consignacion_contratos: true,
  consignacion_documentos: { where: VIGENTE, orderBy: { id: "asc" }, include: { usuarios: { select: { id: true, nombre: true } } } },
};

async function consignacionVigente(ingresoId, tx = prisma) {
  const n = Number(ingresoId);
  if (!Number.isInteger(n) || n <= 0) throw error("Ingreso no encontrado.", 404);
  const ingreso = await tx.consignacion_ingresos.findFirst({ where: { id: n, ...VIGENTE }, include: PARA_DETALLE });
  if (!ingreso) throw error("Ingreso no encontrado.", 404);
  // Publicar y retirar mueven la fila de `consignaciones`, que es la venta por
  // cuenta de un tercero. Un auto comprado o permutado ya es de la agencia.
  if (ingreso.modalidad !== "consignacion") throw error("Publicar o retirar desde acá es solo para consignaciones.", 409);
  return ingreso;
}

// Publicar, retirar o vender: un auto vendido primero tiene que deshacer la venta.
async function ingresoVigente(ingresoId, tx = prisma) {
  const ingreso = await consignacionVigente(ingresoId, tx);
  if (ingreso.estado === "vendido") throw error("Este auto figura vendido. Para cambiarlo, deshacé la venta desde el legajo.", 409);
  return ingreso;
}

// El `ref` es el identificador público del catálogo y se numera solo. Se calcula
// dentro de la transacción para que dos publicaciones simultáneas no choquen.
export async function siguienteRef(tx) {
  const r = await tx.$queryRawUnsafe("SELECT COALESCE(MAX(CAST(ref AS UNSIGNED)),0)+1 AS next FROM autos");
  return String(Number(r[0].next));
}

// La tabla de ventas guarda la comisión SOLO como porcentaje. Si el contrato la
// pactó como monto fijo, se guarda su equivalente sobre el precio de
// publicación: es lo más fiel que entra en esa columna. La cifra que vale sigue
// siendo la del contrato, que es lo que el cliente firmó.
function comisionPorcentaje(contrato, precio) {
  const valor = Number(contrato.comision_valor);
  if (contrato.comision_tipo === "porcentaje") return valor;
  if (!precio) return 0;
  return Math.min(999.99, Math.round((valor / precio) * 10000) / 100);
}

// El apellido no vive en `clientes` sino en su perfil, así que se arma con el
// mapper que ya junta las dos tablas en vez de leer la relación a mano.
function nombreDelDuenio(titular) {
  const p = mapPersona(titular);
  return [p?.nombre, p?.apellido].filter(Boolean).join(" ") || "Sin nombre";
}

// Las fotos del vehículo se cargan en el ingreso; los escaneos de papeles son
// privados y nunca salen en la web. La primera es la principal.
const tieneFotos = (fotos) => Array.isArray(fotos) && fotos.length > 0;
const SIN_FOTO_PRINCIPAL = "Subí la foto principal del vehículo para publicar: es la portada del auto en la web.";

// `publicado_at` aparte de `estado_at`: este último se pisa al vender o
// retirar, y la fecha de publicación se tiene que poder ver igual.
function publicadoAhora() {
  const ahora = new Date();
  return { estado: "publicado", estado_at: ahora, publicado_at: ahora };
}

export async function publicarIngreso(ingresoId) {
  return prisma.$transaction(async (tx) => {
    const ingreso = await ingresoVigente(ingresoId, tx);
    const contrato = ingreso.consignacion_contratos;

    if (!ingreso.dominio) throw error("Cargá el título del automotor antes de publicar: de ahí salen los datos del vehículo.", 409);
    if (!contrato) throw error("Cargá las condiciones del contrato antes de publicar.", 409);
    // Publicar es ofrecer el auto a un precio. Sin contrato firmado no hay
    // autorización escrita del dueño sobre ese precio, y es justo lo que se
    // discute cuando aparece una oferta.
    if (!contrato.firmado_at) throw error("Firmá el contrato antes de publicar: es la autorización del dueño sobre el precio.", 409);

    if (!tieneFotos(ingreso.fotos_json)) throw error(SIN_FOTO_PRINCIPAL, 409);

    const precio = Number(contrato.precio_publicacion);

    // Ya estuvo publicado y se despublicó: se reusa su ficha en vez de crear una
    // segunda. Si no, el catálogo juntaría un auto duplicado por cada vez que
    // alguien lo saca y lo vuelve a poner.
    if (ingreso.consignacion_id) {
      const consignacion = await tx.consignaciones.findFirst({ where: { id: ingreso.consignacion_id }, include: { autos: true } });
      if (consignacion) {
        await tx.consignaciones.update({
          where: { id: consignacion.id },
          data: { estado: "en_venta", precio_pactado: precio, comision: comisionPorcentaje(contrato, precio), updated_at: new Date() },
        });
        // Las fotos del ingreso solo completan una ficha que no tiene: si ya se
        // editaron desde Vehículos, mandan esas.
        const fotos = tieneFotos(consignacion.autos.fotos_json) ? consignacion.autos.fotos_json : ingreso.fotos_json;
        await tx.autos.update({
          where: { id: consignacion.auto_id },
          data: { disponible: true, precio, fotos_json: fotos, updated_at: new Date() },
        });
        const listo = await tx.consignacion_ingresos.update({
          where: { id: ingreso.id },
          data: publicadoAhora(),
          include: PARA_DETALLE,
        });
        return { ingreso: mapIngreso(listo, { conDetalle: true }), avisos: [], ref: consignacion.autos.ref };
      }
    }

    const auto = await tx.autos.create({
      data: {
        ref: await siguienteRef(tx),
        marca: ingreso.marca,
        modelo: ingreso.modelo,
        anio: ingreso.anio,
        // Una consignación es siempre un usado: nadie deja un 0km a consignar.
        tipo: "usado",
        precio,
        kms: ingreso.km_recepcion ?? 0,
        fotos_json: ingreso.fotos_json,
        disponible: true,
      },
    });

    const consignacion = await tx.consignaciones.create({
      data: {
        auto_id: auto.id,
        patente: ingreso.dominio,
        duenio_nombre: nombreDelDuenio(ingreso.titular),
        duenio_telefono: ingreso.titular?.telefono ?? null,
        precio_pactado: precio,
        comision: comisionPorcentaje(contrato, precio),
        estado: "en_venta",
      },
    });

    const listo = await tx.consignacion_ingresos.update({
      where: { id: ingreso.id },
      data: { consignacion_id: consignacion.id, ...publicadoAhora() },
      include: PARA_DETALLE,
    });
    return { ingreso: mapIngreso(listo, { conDetalle: true }), avisos: [], ref: auto.ref };
  });
}

// Cambia el estado del ingreso y deja el catálogo en consecuencia. Es la única
// puerta: si mañana se agrega un estado, el efecto sobre la web se decide acá.
export async function cambiarEstadoIngreso(ingresoId, estado) {
  if (!ESTADOS.includes(estado)) throw error(`El estado debe ser uno de: ${ESTADOS.join(", ")}.`);
  if (estado === "publicado") return publicarIngreso(ingresoId);

  return prisma.$transaction(async (tx) => {
    const ingreso = await ingresoVigente(ingresoId, tx);

    // El vínculo con la ficha NO se corta: así, si el auto se vuelve a publicar,
    // conserva sus fotos, su descripción y las visitas que ya tuvo.
    if (ingreso.consignacion_id) {
      const consignacion = await tx.consignaciones.findFirst({ where: { id: ingreso.consignacion_id } });
      if (consignacion) {
        // "recepcion" es sacarlo de la vidriera un rato; "retirado" es que el
        // dueño se lo llevó, y ahí la consignación se cierra.
        await tx.consignaciones.update({
          where: { id: consignacion.id },
          data: { estado: estado === "retirado" ? "retirado" : "en_venta", updated_at: new Date() },
        });
        await tx.autos.update({ where: { id: consignacion.auto_id }, data: { disponible: false, updated_at: new Date() } });
      }
    }

    const listo = await tx.consignacion_ingresos.update({ where: { id: ingreso.id }, data: { estado, estado_at: new Date() }, include: PARA_DETALLE });
    return { ingreso: mapIngreso(listo, { conDetalle: true }), avisos: [], ref: null };
  });
}

// Vender desde Documentos. No es una venta aparte: es la misma de Vehículos
// sobre la ficha que creó la publicación, así el auto, la consignación y el
// ingreso quedan vendidos juntos y se deshace desde un solo lugar.
export async function venderIngreso(ingresoId, { precioVenta, vendidoAt } = {}) {
  const ingreso = await ingresoVigente(ingresoId);
  if (ingreso.estado !== "publicado") throw error("Solo se puede marcar vendido un auto publicado.", 409);

  const consignacion = await prisma.consignaciones.findFirst({
    where: { id: ingreso.consignacion_id ?? -1 },
    select: { autos: { select: { ref: true } } },
  });
  if (!consignacion) throw error("Este ingreso no tiene ficha en el catálogo.", 409);

  await marcarVendido(consignacion.autos.ref, { precio_venta: precioVenta, vendido_at: vendidoAt });
  const listo = await prisma.consignacion_ingresos.findFirst({ where: { id: ingreso.id }, include: PARA_DETALLE });
  return { ingreso: mapIngreso(listo, { conDetalle: true }), avisos: [], ref: consignacion.autos.ref };
}

// Se marcó vendido por error: el auto vuelve a estar publicado. Es la salida
// de la venta de una consignación, ahora que Vehículos ya no muestra vendidos.
export async function deshacerVentaIngreso(ingresoId) {
  const ingreso = await consignacionVigente(ingresoId);
  if (ingreso.estado !== "vendido") throw error("Este ingreso no figura como vendido.", 409);

  const consignacion = await prisma.consignaciones.findFirst({
    where: { id: ingreso.consignacion_id ?? -1 },
    select: { autos: { select: { ref: true } } },
  });
  if (!consignacion) throw error("Este ingreso no tiene ficha en el catálogo.", 409);

  await deshacerVenta(consignacion.autos.ref);
  const listo = await prisma.consignacion_ingresos.findFirst({ where: { id: ingreso.id }, include: PARA_DETALLE });
  return { ingreso: mapIngreso(listo, { conDetalle: true }), avisos: [], ref: consignacion.autos.ref };
}
