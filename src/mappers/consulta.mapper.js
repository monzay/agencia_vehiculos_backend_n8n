// Una "consulta" = una SESIÓN de conversación (fila `sesiones`/chat_estado), con
// su propio vehículo de interés. Un cliente puede tener varias consultas.
//
// La LISTA es liviana (sin mensajes): vehículo, cliente, teléfono y hora.
// El DETALLE (al hacer click) trae las respuestas del cliente de esa sesión.

import { provinciaDeTelefono, telefonoLocal } from "../lib/provincias.js";
import { creditoDelCliente } from "./lead.mapper.js";
import { avanceDeConsulta } from "../services/consulta-avance.service.js";
import { PASO_HUMANO } from "../agente/pasos.js";
import { formatearCuil } from "../credito/cuil.js";

const PREGUNTA_NOMBRE = "¿A nombre de quién registramos la consulta?";

// De qué provincia escribe el cliente, según el código de área de su teléfono.
// `null` = no se pudo determinar; el panel lo muestra como "—".
const provinciaDe = (cliente) => provinciaDeTelefono(cliente?.telefono)?.provincia ?? null;

// El teléfono como se marca dentro del país (área + abonado, sin el 54 ni el 9
// de móvil). Es solo para mostrar: `telefono` se sigue exponiendo crudo, que es
// contra lo que corre la búsqueda y lo que sirve para armar un link de WhatsApp.
const telefonoVisibleDe = (cliente) => telefonoLocal(cliente?.telefono) ?? "";

// Canal por el que escribe la persona. La consulta es una conversación del bot, así
// que es uno de mensajería (`cliente_canales`). `clientes.canal` queda de respaldo:
// en una ficha fusionada dice por dónde llegó primero (web, presencial), no el de la charla.
const canalDe = (cliente) => cliente?.canales?.[0]?.canal ?? cliente?.canal ?? "";

// Nombre a mostrar: el de la ficha (`clientes.nombre`). Si la persona escribió primero
// por WhatsApp es el de su perfil, pero el bot ya no lo refresca en cada mensaje:
// `resolverCliente` solo completa huecos. La excepción es una carga web o presencial,
// que lo reemplaza mientras la ficha no tiene DNI. El declarado en la consulta queda de
// respaldo si la ficha no tiene nombre, y se ve completo en el detalle, entre las respuestas.
const nombreDe = (sesion, cliente) => cliente?.nombre || sesion.nombre_declarado || "";

// Resumen para la lista (sin cargar mensajes).
export function mapConsultaResumen(sesion, cliente, auto, vendedor) {
  return {
    sesionId: sesion.id,
    clienteId: cliente?.id ?? sesion.cliente_id,
    nombre: nombreDe(sesion, cliente),
    telefono: cliente?.telefono ?? "",
    telefonoLocal: telefonoVisibleDe(cliente),
    canal: canalDe(cliente),
    provincia: provinciaDe(cliente),
    vehiculo: auto
      ? { ref: auto.ref, marca: auto.marca, modelo: auto.modelo, anio: auto.anio }
      : null,
    tipoLead: sesion.tipo_lead ?? null,
    clasificacion: sesion.clasificacion ?? null,
    // Último resultado del BCRA del cliente: solo informativo, no entra en la clasificación.
    credito: cliente ? creditoDelCliente(cliente) : null,
    // Asesor que tiene que atender la consulta (null = sin asignar todavía).
    asesor: vendedor?.nombre ?? null,
    // Marca de atendida: cuándo y quién la marcó (null = no atendida).
    atendido: sesion.atendido_at
      ? { at: new Date(sesion.atendido_at).toISOString(), por: sesion.atendido_por ?? null }
      : null,
    // Hora en que se realizó la consulta (inicio de la sesión).
    hora: sesion.sesion_inicio ? new Date(sesion.sesion_inicio).toISOString() : null,
    // Aviso del agente con IA: lo derivó a un vendedor o acordó una visita.
    requiereVendedor: sesion.requiere_vendedor
      ? {
          motivo: sesion.requiere_vendedor_motivo ?? null,
          at: sesion.requiere_vendedor_at ? new Date(sesion.requiere_vendedor_at).toISOString() : null,
        }
      : null,
    visitaPropuesta: sesion.visita_propuesta ?? null,
    // Si ya pasó a un trámite o una seña (null = todavía se puede avanzar).
    avance: avanceDeConsulta(sesion),
  };
}

// Resumen de una consulta de VENTA/CONSIGNACIÓN (una por sesión) para la sección
// "Vender / Consignación". El vehículo que ofrece el cliente vive en
// `vehiculo_cliente` (contexto 'venta'), no en `autos`.
export function mapConsultaVenta(sesion, cliente) {
  const venta = (sesion.vehiculo_cliente ?? []).find((v) => v.contexto === "venta" && !v.deleted_at) ?? null;
  const fecha = sesion.sesion_inicio ? new Date(sesion.sesion_inicio).toISOString() : null;
  return {
    id: sesion.id,
    sesionId: sesion.id,
    nombre: nombreDe(sesion, cliente),
    // A nombre de quién el cliente pidió registrar la consulta (paso vender_nombre).
    // Es el dato declarado por el cliente, no el perfil de WhatsApp.
    nombreDeclarado: sesion.nombre_declarado ?? null,
    telefono: cliente?.telefono ?? "",
    // Venta/consignación no se califica (no es lead de compra frío/tibio/caliente).
    clasificacion: null,
    venta: {
      modalidad: sesion.modalidad_venta ?? null, // 'venta' | 'consignacion' | null
      marca: venta?.marca ?? null,
      modelo: venta?.modelo ?? null,
      anio: venta?.anio ?? null,
      kms: venta?.kms ?? null,
      precio: venta?.precio_pedido ?? null,
      fecha,
      inicio: fecha,
    },
  };
}

// Traduce el paso del bot (paso_nodo, que el cliente estaba respondiendo) a la
// pregunta legible. Los mensajes viejos tienen paso_nodo='webhook' (sin paso).
const PASO_PREGUNTA = {
  inicio: "Consulta inicial",
  inicio_wa: "Consulta inicial",
  gw_router: "Consulta inicial",
  q_pago: "¿Cómo va a pagar?",
  q_financiacion: "Financiación",
  q_anticipo: "¿Cuánto de anticipo?",
  q_usado: "¿Entrega un usado?",
  q_usado_marca: "Marca del usado que entrega",
  q_usado_modelo: "Modelo del usado",
  q_usado_anio: "Año del usado",
  q_decisor: "¿Quién decide la compra?",
  q_decisor_con: "¿Con quién lo consulta?",
  q_agenda: "¿Cuándo puede venir?",
  q_nombre: "¿Cuál es su nombre?",
  vender_modalidad: "¿Venta directa o consignación?",
  vender_marca: "Marca del vehículo que quiere vender",
  vender_modelo: "Modelo que quiere vender",
  vender_anio: "Año del vehículo a vender",
  vender_km: "Kilómetros del vehículo a vender",
  vender_precio: "¿Qué precio pide?",
  vender_nombre: "¿Cuál es su nombre?",
  ag_cal: "Elección de turno",
  ag_confirm: "Confirmación de turno",
};

export function preguntaDePaso(paso) {
  if (PASO_PREGUNTA[paso]) return PASO_PREGUNTA[paso];
  // Sin paso registrado (datos viejos) o paso desconocido.
  return !paso || paso === "webhook" ? "Mensaje del cliente" : paso;
}

// Quién escribió el mensaje, para pintar la burbuja en el chat:
// - entrante            → "cliente"
// - saliente + "humano" → "humano" (lo escribió una persona desde el panel)
// - saliente (resto)    → "bot"    (el agente de IA o una reacción)
export function autorDeMensaje(m) {
  if (m.direccion === "entrante") return "cliente";
  return m.paso_nodo === PASO_HUMANO ? "humano" : "bot";
}

// Un mensaje del chat para el detalle. Para los entrantes (respuestas del cliente)
// trae además la pregunta que estaba respondiendo, según el paso que guardó el bot.
export function mapMensaje(m) {
  return {
    id: Number(m.id), // BigInt → Number
    autor: autorDeMensaje(m),
    mensaje: m.mensaje ?? "",
    paso: m.paso_nodo ?? "",
    pregunta: preguntaDePaso(m.paso_nodo),
    fecha: m.created_at ? new Date(m.created_at).toISOString() : null,
  };
}

// Etiquetas legibles de las respuestas estructuradas.
const DISPONIBILIDAD = { esta_semana: "Esta semana", proximas: "Próximas semanas", no_sabe: "No sabe todavía" };

// Deriva las preguntas→respuestas de la consulta a partir de lo que el bot ya
// guardó estructurado en la sesión (`sesiones`) y en `vehiculo_cliente`.
// Así se identifica qué contestó el cliente a cada pregunta, sin adivinar.
export function construirRespuestas(sesion, vehiculosCliente = [], cliente = null) {
  const r = [];
  const usado = vehiculosCliente.find((v) => v.contexto === "trade_in");
  const venta = vehiculosCliente.find((v) => v.contexto === "venta");

  if (sesion.tipo_lead === "venta" || venta) {
    // La modalidad es lo primero que pregunta el bot en el flujo vender.
    if (sesion.modalidad_venta)
      r.push({
        pregunta: "¿Venta directa o consignación?",
        respuesta: sesion.modalidad_venta === "consignacion" ? "Consignación" : "Venta directa",
      });
    if (venta?.marca) r.push({ pregunta: "Marca del vehículo que vende", respuesta: venta.marca });
    if (venta?.modelo) r.push({ pregunta: "Modelo que vende", respuesta: venta.modelo });
    if (venta?.anio) r.push({ pregunta: "Año del vehículo que vende", respuesta: String(venta.anio) });
    // kms es texto libre (lo que declaró el cliente): se muestra tal cual.
    if (venta?.kms != null && String(venta.kms).trim() !== "")
      r.push({ pregunta: "Kilómetros del vehículo que vende", respuesta: String(venta.kms) });
    if (venta?.precio_pedido) r.push({ pregunta: "Precio que pide", respuesta: venta.precio_pedido });
  }
  if (sesion.pago_tipo) {
    r.push({ pregunta: "¿Cómo va a pagar?", respuesta: sesion.pago_tipo === "contado" ? "Contado" : "Financiado" });
  }
  if (sesion.credito_ok != null) {
    r.push({ pregunta: "¿Tiene recibo de sueldo / garante?", respuesta: sesion.credito_ok ? "Sí" : "No" });
  }
  if (sesion.anticipo != null && String(sesion.anticipo).trim() !== "") {
    // El anticipo se guarda como texto libre (lo que declaró el cliente): se
    // muestra tal cual, sin forzarlo a número.
    r.push({ pregunta: "Anticipo", respuesta: String(sesion.anticipo) });
  }
  if (sesion.entrega_usado != null) {
    r.push({ pregunta: "¿Entrega un usado?", respuesta: sesion.entrega_usado ? "Sí" : "No" });
  }
  if (usado) {
    if (usado.marca) r.push({ pregunta: "Marca del usado que entrega", respuesta: usado.marca });
    if (usado.modelo) r.push({ pregunta: "Modelo del usado", respuesta: usado.modelo });
    if (usado.anio) r.push({ pregunta: "Año del usado", respuesta: String(usado.anio) });
    if (usado.kms != null && String(usado.kms).trim() !== "")
      r.push({ pregunta: "Kilómetros del usado", respuesta: String(usado.kms) });
    if (usado.detalles?.trim()) r.push({ pregunta: "Estado del usado", respuesta: usado.detalles.trim() });
    if (usado.precio_pedido?.trim()) r.push({ pregunta: "Cuánto pide por el usado", respuesta: usado.precio_pedido.trim() });
  }
  if (sesion.cuil_informado) r.push({ pregunta: "CUIL informado", respuesta: formatearCuil(sesion.cuil_informado) });
  if (cliente?.cuil && cliente.cuil !== sesion.cuil_informado) r.push({ pregunta: "CUIL en la ficha", respuesta: formatearCuil(cliente.cuil) });
  if (sesion.decisor) {
    r.push({
      pregunta: "¿Quién decide la compra?",
      respuesta: sesion.decisor === "solo" ? "Decide solo/a" : `Consulta${sesion.decisor_con ? " con " + sesion.decisor_con : " con otra persona"}`,
    });
  }
  if (sesion.disponibilidad) {
    r.push({ pregunta: "¿Cuándo puede venir?", respuesta: DISPONIBILIDAD[sesion.disponibilidad] ?? sesion.disponibilidad });
  }
  // Día y franja que acordó con el agente para ver el auto (no es un turno confirmado).
  if (sesion.visita_propuesta?.trim()) r.push({ pregunta: "Visita propuesta", respuesta: sesion.visita_propuesta.trim() });
  // El bot lo pregunta al final del flujo, así que cierra la lista.
  if (sesion.nombre_declarado) r.push({ pregunta: PREGUNTA_NOMBRE, respuesta: sesion.nombre_declarado });
  return r;
}
