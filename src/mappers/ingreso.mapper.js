// Un ingreso es la toma de un vehículo: el auto entró al playón en
// consignación, comprado o en permuta. Acá se arma la forma que consume el panel.

import { CATALOGO, TIPOS, cruzarConIngreso } from "../lib/documentos-catalogo.js";
import { mapPersona } from "../services/personas.service.js";
import { mapCompraventa, senaDelIngreso } from "./compraventa.mapper.js";
import { mapFinanciacion } from "./financiacion.mapper.js";
import { conUsado, vendeLaAgencia } from "../lib/modalidades.js";
import { aplicarDescuento } from "./descuento.mapper.js";
import { mapPromosDeAuto } from "./promocion.mapper.js";
import { requisitosContrato } from "../lib/requisitos-contrato.js";

const iso = (d) => (d ? new Date(d).toISOString() : null);
// Los vencimientos son fecha sin hora: se recortan para que no se corran de día
// al cruzar husos horarios.
const soloFecha = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);
const aNumero = (d) => (d != null ? Number(d) : null);

const hoy = () => new Date().toISOString().slice(0, 10);

// Los datos del vehículo que declara el sistema. Son la referencia contra la
// que se comparan los papeles.
const datosVehiculo = (i) => ({
  dominio: i.dominio,
  marca: i.marca,
  modelo: i.modelo,
  anio: i.anio,
  motor: i.motor ?? null,
  chasis: i.chasis ?? null,
  origen: i.origen ?? null,
});

export function mapDocumento(d, vehiculo = null) {
  const spec = CATALOGO[d.tipo];
  const vence = soloFecha(d.fecha_vencimiento);
  const datos = d.datos_json ?? {};

  return {
    id: d.id,
    tipo: d.tipo,
    label: spec?.label ?? d.tipo,
    // Qué pasó con el papel físico: no_recibido | copia | original.
    // Es un hecho aparte de que exista la imagen.
    tenencia: d.tenencia,
    imagenes: Array.isArray(d.imagenes_json) ? d.imagenes_json : [],
    fechaCarga: iso(d.fecha_carga),
    cargadoPor: d.usuarios ? { id: d.usuarios.id, nombre: d.usuarios.nombre } : null,
    ubicacionFisica: d.ubicacion_fisica ?? null,
    fechaVencimiento: vence,
    vencido: Boolean(vence && vence < hoy()),
    datos,
    observaciones: d.observaciones ?? null,
    // Lo que el papel dice distinto de lo que tiene cargado el sistema.
    // Se informa, nunca se corrige solo.
    diferencias: vehiculo ? cruzarConIngreso(d.tipo, datos, vehiculo) : [],
  };
}

export function mapContrato(c) {
  if (!c) return null;
  return {
    id: c.id,
    precioMinimo: aNumero(c.precio_minimo),
    // El de publicación sale en el aviso; el mínimo es el piso para cerrar.
    precioPublicacion: aNumero(c.precio_publicacion),
    comision: {
      tipo: c.comision_tipo,
      valor: aNumero(c.comision_valor),
      // true = sale del precio; false = se suma por encima.
      incluida: c.comision_incluida,
    },
    plazoDias: c.plazo_dias,
    gastos: {
      verificacion: c.gastos_verificacion,
      libreDeuda: c.gastos_libre_deuda,
      lavado: c.gastos_lavado,
      publicacion: c.gastos_publicacion,
    },
    retiroAnticipado: {
      avisoDias: c.retiro_aviso_dias,
      costo: aNumero(c.retiro_costo),
      // Lo pactado en palabras. Los contratos firmados antes de la migración 049
      // no lo traen en su copia congelada: ahí queda null.
      condiciones: c.retiro_condiciones ?? null,
    },
    estadoUnidad: c.estado_unidad ?? null,
    pruebaManejo: { permitida: c.prueba_manejo, responsable: c.prueba_responsable ?? null },
    seguroACargo: c.seguro_a_cargo,
    liquidacion: { dias: c.liquidacion_dias, forma: c.liquidacion_forma },
    firmado: iso(c.firmado_at),
    // Copia congelada de lo que se imprimió. Solo existe si está firmado.
    snapshot: c.contrato_json ?? null,
  };
}

// El contrato que corresponde a la modalidad: la consignación firma sus
// condiciones; la compra y la permuta, un boleto.
const contratoDe = (i) =>
  i.modalidad === "consignacion" ? mapContrato(i.consignacion_contratos) : mapCompraventa(i.compraventa_contratos, senaDelIngreso(i));

// Descuento y promociones vigentes del auto que compra el cliente. Null si no
// tiene ninguno. Mismas
// reglas que el catálogo, así el cliente ve acá lo mismo que vio en la web.
function beneficiosDe(i) {
  if (!vendeLaAgencia(i.modalidad)) return null;
  const auto = i.auto_interes;
  if (!auto) return null;
  const { descuento, precio_final, ahorro } = aplicarDescuento(auto.precio, auto.descuentos);
  const promociones = mapPromosDeAuto(auto.auto_promociones);
  if (!descuento && !promociones.length) return null;
  return {
    auto: { ref: auto.ref, marca: auto.marca, modelo: auto.modelo },
    precio: aNumero(auto.precio),
    descuento,
    precioFinal: precio_final,
    ahorro,
    promociones,
  };
}

// El auto que compra el cliente (parte de pago o venta al contado).
const autoInteresDe = (a) =>
  a
    ? {
        ref: a.ref,
        marca: a.marca,
        modelo: a.modelo,
        anio: a.anio,
        dominio: a.dominio ?? null,
        motor: a.motor ?? null,
        chasis: a.chasis ?? null,
        precio: aNumero(a.precio),
      }
    : null;

// La seña de la que nació el trámite: el boleto es por ese auto y la descuenta.
function senaDe(i) {
  const s = i.sena;
  if (!s || s.deleted_at) return null;
  return {
    id: s.id,
    monto: Number(s.monto),
    senado: iso(s.senado_at),
    auto: s.autos ? { ref: s.autos.ref, marca: s.autos.marca, modelo: s.autos.modelo, anio: s.autos.anio, precio: aNumero(s.autos.precio) } : null,
  };
}

const firmaDe = (i) =>
  i.modalidad === "consignacion" ? i.consignacion_contratos?.firmado_at : i.compraventa_contratos?.firmado_at;

export function mapIngreso(i, { conDetalle = false } = {}) {
  const vehiculo = datosVehiculo(i);
  const documentos = (i.consignacion_documentos ?? []).map((d) => mapDocumento(d, vehiculo));
  const cargados = new Set(documentos.map((d) => d.tipo));
  const porTipo = new Map(documentos.map((d) => [d.tipo, d]));

  const base = {
    id: i.id,
    modalidad: i.modalidad, // consignacion | compra | permuta | contado
    // Si el trámite recibe un vehículo del cliente: sin usado no hay papeles ni recibos.
    conUsado: conUsado(i),
    // El auto que compra el cliente (parte de pago o venta al contado).
    autoInteres: autoInteresDe(i.auto_interes),
    vehiculo: { ...vehiculo, kmRecepcion: i.km_recepcion ?? null },
    // Fotos públicas del auto: la primera es la principal.
    fotos: Array.isArray(i.fotos_json) ? i.fotos_json : [],
    titular: mapPersona(i.titular),
    estado: i.estado, // recepcion | publicado | retirado
    // Cuándo entró al estado actual. Null en los anteriores a la migración 054.
    estadoDesde: iso(i.estado_at),
    // La última publicación: sobrevive a la venta y al retiro (migración 058).
    publicado: iso(i.publicado_at),
    // Cuando el auto se publica, la venta la maneja `consignaciones`.
    consignacionId: i.consignacion_id ?? null,
    recibidoPor: i.usuarios ? { id: i.usuarios.id, nombre: i.usuarios.nombre } : null,
    recibido: iso(i.recibido_at),
    notas: i.notas ?? null,
    // Solo la parte de pago: el usado como se lo nombró al tomarlo, en cuánto
    // se lo toma y el efectivo que entrega el cliente además del usado.
    parteDePago:
      i.modalidad === "permuta"
        ? {
            vehiculo: i.parte_pago_vehiculo ?? null,
            valor: aNumero(i.parte_pago_valor),
            efectivo: aNumero(i.parte_pago_efectivo),
          }
        : null,
    papeles: {
      cargados: documentos.length,
      faltantes: TIPOS.filter((t) => !cargados.has(t)),
      vencidos: documentos.filter((d) => d.vencido).map((d) => d.tipo),
      conDiferencias: documentos.filter((d) => d.diferencias.length).map((d) => d.tipo),
      // Los originales que la agencia tiene de verdad, y los que deberían estar
      // acá y no están: un papel escaneado cuyo original nunca llegó frena la
      // transferencia igual que uno que falta del todo.
      originales: documentos.filter((d) => d.tenencia === "original").map((d) => d.tipo),
      sinOriginal: TIPOS.filter(
        (t) => CATALOGO[t].destino === "agencia" && porTipo.get(t)?.tenencia !== "original"
      ),
    },
    contratoFirmado: Boolean(firmaDe(i)),
    creado: iso(i.created_at),
    actualizado: iso(i.updated_at),
  };

  if (!conDetalle) return base;
  const contrato = contratoDe(i);
  const financiacion = i.financiaciones?.[0] ? mapFinanciacion(i.financiaciones[0]) : null;
  const detalle = {
    ...base,
    documentos,
    contrato,
    financiacion,
    sena: senaDe(i),
    beneficios: beneficiosDe(i),
  };
  // Solo la consignación tiene este requisito: compra y permuta firman un boleto.
  if (i.modalidad !== "consignacion") return detalle;
  return { ...detalle, requisitosContrato: requisitosContrato(detalle) };
}
