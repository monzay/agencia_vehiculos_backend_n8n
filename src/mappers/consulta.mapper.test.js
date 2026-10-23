import { test } from "node:test";
import assert from "node:assert/strict";
import { construirRespuestas, mapConsultaResumen, mapConsultaVenta, mapMensaje, preguntaDePaso } from "./consulta.mapper.js";

const respuesta = (lista, pregunta) => lista.find((r) => r.pregunta === pregunta)?.respuesta;

test("muestra el usado completo que entrega: marca, modelo, año, km, estado y cuánto pide", () => {
  const r = construirRespuestas({ entrega_usado: 1 }, [
    { contexto: "trade_in", marca: "Volkswagen", modelo: "Gol Trend", anio: 2015, kms: "98000", detalles: "Service al día, un rayón", precio_pedido: "6000000" },
  ]);
  assert.equal(respuesta(r, "Marca del usado que entrega"), "Volkswagen");
  assert.equal(respuesta(r, "Kilómetros del usado"), "98000");
  assert.equal(respuesta(r, "Estado del usado"), "Service al día, un rayón");
  assert.equal(respuesta(r, "Cuánto pide por el usado"), "6000000");
});

test("si no sabe cuánto pedir por el usado, se muestra así", () => {
  const r = construirRespuestas({ entrega_usado: 1 }, [{ contexto: "trade_in", marca: "Fiat", precio_pedido: "No sabe" }]);
  assert.equal(respuesta(r, "Cuánto pide por el usado"), "No sabe");
});

test("muestra la visita propuesta al final, después de cuándo puede venir", () => {
  const r = construirRespuestas({ disponibilidad: "esta_semana", visita_propuesta: "sábado a la mañana" });
  const preguntas = r.map((x) => x.pregunta);
  assert.equal(respuesta(r, "Visita propuesta"), "sábado a la mañana");
  assert.ok(preguntas.indexOf("Visita propuesta") > preguntas.indexOf("¿Cuándo puede venir?"));
});

test("sin visita ni detalles, no agrega filas vacías", () => {
  const r = construirRespuestas({ entrega_usado: 1 }, [{ contexto: "trade_in", marca: "Fiat", detalles: "  " }]);
  assert.equal(respuesta(r, "Estado del usado"), undefined);
  assert.equal(respuesta(r, "Visita propuesta"), undefined);
});

// ── Aviso al vendedor en la lista de Consultas ──

test("la consulta trae el aviso al vendedor con su motivo y la visita propuesta", () => {
  const at = new Date("2026-10-11T15:00:00Z");
  const r = mapConsultaResumen(
    { id: 9, cliente_id: 1, requiere_vendedor: true, requiere_vendedor_motivo: "Visita propuesta: sábado a la mañana", requiere_vendedor_at: at, visita_propuesta: "sábado a la mañana" },
    { id: 1, nombre: "Ana" },
    null,
    null
  );
  assert.deepEqual(r.requiereVendedor, { motivo: "Visita propuesta: sábado a la mañana", at: at.toISOString() });
  assert.equal(r.visitaPropuesta, "sábado a la mañana");
});

test("sin aviso, no lo trae", () => {
  const r = mapConsultaResumen({ id: 9, cliente_id: 1, requiere_vendedor: false }, { id: 1 }, null, null);
  assert.equal(r.requiereVendedor, null);
  assert.equal(r.visitaPropuesta, null);
});

// ── Teléfono y provincia: salen del teléfono de la ficha, no de canal_id ──

const consulta = { id: 9, cliente_id: 1 };

test("la provincia y el teléfono para mostrar salen del teléfono de la ficha", () => {
  const r = mapConsultaResumen(consulta, { id: 1, telefono: "3884708347", canal: "whatsapp" }, null, null);
  assert.equal(r.provincia, "Jujuy");
  assert.equal(r.telefonoLocal, "388 470-8347");
  assert.equal(r.telefono, "3884708347", "el teléfono crudo se sigue exponiendo");
});

test("un teléfono guardado con el 54 y el 9 también se lee bien", () => {
  const r = mapConsultaResumen(consulta, { id: 1, telefono: "5491145678901" }, null, null);
  assert.equal(r.provincia, "CABA / GBA");
  assert.equal(r.telefonoLocal, "11 4567-8901");
});

test("si canal_id y teléfono no coinciden, manda el teléfono", () => {
  const r = mapConsultaResumen(consulta, { id: 1, telefono: "3884708347", canal_id: "5491145678901" }, null, null);
  assert.equal(r.provincia, "Jujuy");
  assert.equal(r.telefonoLocal, "388 470-8347");
});

test("sin teléfono no hay provincia ni número: canal_id ya no es un respaldo", () => {
  const r = mapConsultaResumen(consulta, { id: 1, telefono: null, canal_id: "5493884708347" }, null, null);
  assert.equal(r.provincia, null);
  assert.equal(r.telefonoLocal, "");
  assert.equal(r.telefono, "");
});

test("una consulta sin cliente se arma igual, sin teléfono ni provincia", () => {
  const r = mapConsultaResumen(consulta, null, null, null);
  assert.equal(r.clienteId, 1);
  assert.equal(r.provincia, null);
  assert.equal(r.telefonoLocal, "");
});

// ── Nombre: el de la ficha; el declarado en la consulta solo de respaldo ──

test("el nombre es el de la ficha y, si la ficha no tiene, el que declaró en la consulta", () => {
  const declarada = { ...consulta, nombre_declarado: "Joel Pérez" };
  assert.equal(mapConsultaResumen(declarada, { id: 1, nombre: "Joel ✨" }, null, null).nombre, "Joel ✨");
  assert.equal(mapConsultaResumen(declarada, { id: 1, nombre: null }, null, null).nombre, "Joel Pérez");
  assert.equal(mapConsultaResumen(declarada, null, null, null).nombre, "Joel Pérez");
  assert.equal(mapConsultaResumen(consulta, null, null, null).nombre, "");
});

// ── Canal: el de mensajería de la persona, no el de por dónde llegó primero la ficha ──

test("el canal de la consulta es el de mensajería de la persona, aunque la ficha diga web", () => {
  const r = mapConsultaResumen(consulta, { id: 1, canal: "web", canales: [{ canal: "whatsapp" }] }, null, null);
  assert.equal(r.canal, "whatsapp");
});

test("una ficha presencial con WhatsApp muestra la consulta como WhatsApp", () => {
  const r = mapConsultaResumen(consulta, { id: 1, canal: "presencial", canales: [{ canal: "whatsapp" }] }, null, null);
  assert.equal(r.canal, "whatsapp");
});

test("con más de un canal de mensajería toma el primero", () => {
  const canales = [{ canal: "instagram" }, { canal: "whatsapp" }];
  assert.equal(mapConsultaResumen(consulta, { id: 1, canal: "web", canales }, null, null).canal, "instagram");
});

test("sin canales de mensajería, el canal es el de la ficha", () => {
  assert.equal(mapConsultaResumen(consulta, { id: 1, canal: "web", canales: [] }, null, null).canal, "web");
  assert.equal(mapConsultaResumen(consulta, { id: 1, canal: "web" }, null, null).canal, "web", "sin pedir los canales a la base");
});

test("sin cliente, el canal queda vacío", () => {
  assert.equal(mapConsultaResumen(consulta, null, null, null).canal, "");
});

// ── Venta / consignación ──

test("la consulta de venta trae el vehículo que ofrece y a nombre de quién se registró", () => {
  const sesion = {
    id: 3,
    sesion_inicio: new Date("2026-10-12T15:00:00Z"),
    modalidad_venta: "consignacion",
    nombre_declarado: "Joel Pérez",
    vehiculo_cliente: [
      { contexto: "trade_in", marca: "Fiat" },
      { contexto: "venta", marca: "Anulada", deleted_at: new Date("2026-10-13T09:00:00Z") },
      { contexto: "venta", marca: "Ford", modelo: "Ka", anio: 2018, kms: "90000", precio_pedido: "8000000" },
    ],
  };

  const r = mapConsultaVenta(sesion, { id: 1, nombre: "Joel ✨", telefono: "3884708347" });

  const fecha = "2026-10-12T15:00:00.000Z";
  assert.deepEqual(r.venta, { modalidad: "consignacion", marca: "Ford", modelo: "Ka", anio: 2018, kms: "90000", precio: "8000000", fecha, inicio: fecha });
  assert.deepEqual([r.id, r.sesionId, r.nombre, r.nombreDeclarado, r.telefono, r.clasificacion], [3, 3, "Joel ✨", "Joel Pérez", "3884708347", null]);
});

test("una consulta de venta sin vehículo cargado ni cliente se arma igual, con todo vacío", () => {
  const r = mapConsultaVenta({ id: 3 }, null);

  assert.deepEqual(r.venta, { modalidad: null, marca: null, modelo: null, anio: null, kms: null, precio: null, fecha: null, inicio: null });
  assert.deepEqual([r.nombre, r.nombreDeclarado, r.telefono], ["", null, ""]);
});

// ── Mensajes del detalle ──

test("cada mensaje entrante trae la pregunta que el cliente estaba respondiendo", () => {
  const m = mapMensaje({ id: 9n, mensaje: "Contado", paso_nodo: "q_pago", created_at: new Date("2026-10-12T15:00:00Z") });

  assert.deepEqual(m, { id: 9, mensaje: "Contado", paso: "q_pago", pregunta: "¿Cómo va a pagar?", fecha: "2026-10-12T15:00:00.000Z" });
});

test("un mensaje sin paso (datos viejos) o con un paso desconocido se muestra igual", () => {
  assert.equal(preguntaDePaso("webhook"), "Mensaje del cliente");
  assert.equal(preguntaDePaso(null), "Mensaje del cliente");
  assert.equal(preguntaDePaso("paso_nuevo"), "paso_nuevo");
  assert.deepEqual(mapMensaje({ id: 1, mensaje: null, paso_nodo: null, created_at: null }), {
    id: 1,
    mensaje: "",
    paso: "",
    pregunta: "Mensaje del cliente",
    fecha: null,
  });
});

// ── Respuestas estructuradas ──

test("las respuestas de una compra salen de lo que el bot guardó en la sesión, en el orden del flujo", () => {
  const r = construirRespuestas({
    pago_tipo: "financiado",
    credito_ok: 1,
    anticipo: "2000000",
    entrega_usado: 0,
    decisor: "con_otro",
    decisor_con: "mi esposa",
    disponibilidad: "esta_semana",
    nombre_declarado: "Joel Pérez",
  });

  assert.deepEqual(r, [
    { pregunta: "¿Cómo va a pagar?", respuesta: "Financiado" },
    { pregunta: "¿Tiene recibo de sueldo / garante?", respuesta: "Sí" },
    { pregunta: "Anticipo", respuesta: "2000000" },
    { pregunta: "¿Entrega un usado?", respuesta: "No" },
    { pregunta: "¿Quién decide la compra?", respuesta: "Consulta con mi esposa" },
    { pregunta: "¿Cuándo puede venir?", respuesta: "Esta semana" },
    { pregunta: "¿A nombre de quién registramos la consulta?", respuesta: "Joel Pérez" },
  ]);
});

test("las variantes de pago contado y de quién decide tienen su respuesta", () => {
  assert.equal(respuesta(construirRespuestas({ decisor: "solo" }), "¿Quién decide la compra?"), "Decide solo/a");
  assert.equal(respuesta(construirRespuestas({ decisor: "con_otro" }), "¿Quién decide la compra?"), "Consulta con otra persona");
  assert.equal(respuesta(construirRespuestas({ pago_tipo: "contado", credito_ok: 0 }), "¿Cómo va a pagar?"), "Contado");
});

test("las respuestas de una venta o consignación traen la modalidad y el vehículo que ofrece", () => {
  const r = construirRespuestas({ tipo_lead: "venta", modalidad_venta: "consignacion" }, [
    { contexto: "venta", marca: "Ford", modelo: "Ka", anio: 2018, kms: "90000", precio_pedido: "8000000" },
  ]);

  assert.deepEqual(r.map((x) => x.respuesta), ["Consignación", "Ford", "Ka", "2018", "90000", "8000000"]);
  assert.equal(respuesta(construirRespuestas({ tipo_lead: "venta", modalidad_venta: "venta" }), "¿Venta directa o consignación?"), "Venta directa");
});
