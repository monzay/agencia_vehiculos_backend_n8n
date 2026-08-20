// Una "consulta" = una SESIÓN de conversación (fila `sesiones`/chat_estado), con
// su propio vehículo de interés. Un cliente puede tener varias consultas.
//
// La LISTA es liviana (sin mensajes): vehículo, cliente, teléfono y hora.
// El DETALLE (al hacer click) trae las respuestas del cliente de esa sesión.

import { provinciaDeTelefono, telefonoLocal } from "../lib/provincias.js";

const PREGUNTA_NOMBRE = "¿A nombre de quién registramos la consulta?";

// De qué provincia escribe el cliente, según el código de área. Se prioriza
// `canal_id` (el id de WhatsApp, que siempre viene completo con el código de
// país) sobre `telefono`, que en filas viejas puede estar en formato local o
// vacío. `null` = no se pudo determinar; el panel lo muestra como "—".
const provinciaDe = (cliente) =>
  provinciaDeTelefono(cliente?.canal_id)?.provincia ??
  provinciaDeTelefono(cliente?.telefono)?.provincia ??
  null;

// El teléfono como se marca dentro del país (área + abonado, sin el 54 ni el 9
// de móvil). Es solo para mostrar: `telefono` se sigue exponiendo crudo, que es
// contra lo que corre la búsqueda y lo que sirve para armar un link de WhatsApp.
const telefonoVisibleDe = (cliente) =>
  telefonoLocal(cliente?.canal_id) ?? telefonoLocal(cliente?.telefono) ?? "";

// Nombre a mostrar: el del perfil de WhatsApp (`clientes.nombre`, que el bot
// refresca en cada mensaje entrante) identifica a quien realmente escribe. El
// declarado en la consulta queda de respaldo para los canales sin perfil (web).
// El declarado igual se ve completo en el detalle, entre las respuestas.
const nombreDe = (sesion, cliente) => cliente?.nombre || sesion.nombre_declarado || "";

// Resumen para la lista (sin cargar mensajes).
export function mapConsultaResumen(sesion, cliente, auto, vendedor) {
  return {
    sesionId: sesion.id,
    clienteId: cliente?.id ?? sesion.cliente_id,
    nombre: nombreDe(sesion, cliente),
    telefono: cliente?.telefono ?? "",
    telefonoLocal: telefonoVisibleDe(cliente),
    canal: cliente?.canal ?? "",
    provincia: provinciaDe(cliente),
    vehiculo: auto
      ? { ref: auto.ref, marca: auto.marca, modelo: auto.modelo, anio: auto.anio }
      : null,
    tipoLead: sesion.tipo_lead ?? null,
    clasificacion: sesion.clasificacion ?? null,
    // Asesor que tiene que atender la consulta (null = sin asignar todavía).
    asesor: vendedor?.nombre ?? null,
    // Marca de atendida: cuándo y quién la marcó (null = no atendida).
    atendido: sesion.atendido_at
      ? { at: new Date(sesion.atendido_at).toISOString(), por: sesion.atendido_por ?? null }
      : null,
    // Hora en que se realizó la consulta (inicio de la sesión).
    hora: sesion.sesion_inicio ? new Date(sesion.sesion_inicio).toISOString() : null,
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

// Un mensaje entrante (respuesta del cliente) para el detalle, con la pregunta
// que estaba respondiendo (según el paso que guardó el bot).
export function mapMensaje(m) {
  return {
    id: Number(m.id), // BigInt → Number
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
export function construirRespuestas(sesion, vehiculosCliente = []) {
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
  }
  if (sesion.decisor) {
    r.push({
      pregunta: "¿Quién decide la compra?",
      respuesta: sesion.decisor === "solo" ? "Decide solo/a" : `Consulta${sesion.decisor_con ? " con " + sesion.decisor_con : " con otra persona"}`,
    });
  }
  if (sesion.disponibilidad) {
    r.push({ pregunta: "¿Cuándo puede venir?", respuesta: DISPONIBILIDAD[sesion.disponibilidad] ?? sesion.disponibilidad });
  }
  // El bot lo pregunta al final del flujo, así que cierra la lista.
  if (sesion.nombre_declarado) r.push({ pregunta: PREGUNTA_NOMBRE, respuesta: sesion.nombre_declarado });
  return r;
}
