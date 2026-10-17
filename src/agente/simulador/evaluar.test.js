import { test } from "node:test";
import assert from "node:assert/strict";
import { temasPreguntados, evaluarConversacion } from "./evaluar.js";

// ── Qué preguntó el agente en cada mensaje ──

test("detecta los temas de las preguntas, no de las afirmaciones", () => {
  assert.deepEqual(temasPreguntados("Tenemos una Amarok. ¿La pagarías de contado o financiada?"), ["pago"]);
  assert.deepEqual(temasPreguntados("Perfecto, de contado entonces. ¿Entregarías algún usado como parte de pago?"), ["usado"]);
  assert.deepEqual(temasPreguntados("¿Decidís vos solo o lo consultás con alguien?"), ["decisor"]);
  assert.deepEqual(temasPreguntados("¿Cuándo podrías pegarte una vuelta por la agencia?"), ["visita"]);
  assert.deepEqual(temasPreguntados("¿Tenés recibo de sueldo o un garante? ¿Y cuánto tendrías de anticipo?"), ["recibo", "anticipo"]);
  assert.deepEqual(temasPreguntados("¿Cuántos kilómetros tiene y cuánto pedís por él?"), ["usado_kms", "usado_precio"]);
  assert.deepEqual(temasPreguntados("La Amarok está a $45.000.000."), []);
});

// ── Evaluación de una conversación completa ──

const agente = (texto) => ({ de: "agente", texto });
const cliente = (texto) => ({ de: "cliente", texto });

const esperado = {
  pago_tipo: "contado",
  entrega_usado: true,
  usado: { marca: "Volkswagen", modelo: "Gol", anio: 2015, kms: true, precio_pedido: true },
  decisor: "solo",
  disponibilidad: "esta_semana",
  clasificacion: "CALIENTE",
};

const sesionCompleta = {
  pago_tipo: "contado",
  entrega_usado: 1,
  decisor: "solo",
  disponibilidad: "esta_semana",
  clasificacion: "CALIENTE",
};
const usadoCompleto = { marca: "Volkswagen", modelo: "Gol Trend", anio: 2015, kms: "98000", precio_pedido: "6000000" };

test("conversación ideal: datos completos, sin repetir y cierra con visita y día", () => {
  const turnos = [
    cliente("Hola, me interesa la Amarok"),
    agente("¡Hola! Buena elección. ¿La pagarías de contado o financiada?"),
    cliente("Contado"),
    agente("Genial. ¿Entregarías un usado?"),
    cliente("Sí, un Gol 2015"),
    agente("¿Cuántos kilómetros tiene y cuánto pedís por él?"),
    cliente("98 mil, pido 6 millones"),
    agente("¿Decidís vos solo?"),
    cliente("Sí"),
    agente("¡Buenísimo! ¿Te viene bien pasar el sábado a la mañana a verla?"),
    cliente("Dale, el sábado"),
  ];
  const r = evaluarConversacion({ turnos, sesion: sesionCompleta, usado: usadoCompleto, esperado });
  assert.equal(r.datosOk, r.datosTotal);
  assert.equal(r.repeticiones, 0);
  assert.equal(r.invitaVisita, true);
  assert.equal(r.proponeDia, true);
  assert.equal(r.clasificacionOk, true);
});

test("marca los datos que faltan o no coinciden", () => {
  const r = evaluarConversacion({
    turnos: [agente("¿Contado o financiado?")],
    sesion: { ...sesionCompleta, decisor: null, clasificacion: "TIBIO" },
    usado: { marca: "Volkswagen", modelo: "Gol", anio: 2015, kms: null, precio_pedido: null },
    esperado,
  });
  const fallidos = r.detalle.filter((d) => !d.ok).map((d) => d.campo);
  assert.deepEqual(fallidos, ["usado.kms", "usado.precio_pedido", "decisor", "clasificacion"]);
  assert.equal(r.clasificacionOk, false);
});

test("cuenta una pregunta repetida sobre el mismo tema", () => {
  const turnos = [agente("¿Contado o financiado?"), cliente("Contado"), agente("Bárbaro. ¿Cómo lo pagarías, contado o financiado?")];
  const r = evaluarConversacion({ turnos, sesion: sesionCompleta, usado: usadoCompleto, esperado });
  assert.equal(r.repeticiones, 1);
});

test("si no invita a la agencia al final, el cierre no cuenta", () => {
  const turnos = [agente("¿Contado o financiado?"), cliente("Contado"), agente("Perfecto, cualquier cosa me escribís.")];
  const r = evaluarConversacion({ turnos, sesion: sesionCompleta, usado: usadoCompleto, esperado });
  assert.equal(r.invitaVisita, false);
  assert.equal(r.proponeDia, false);
});

test("sin usado esperado, no pide los datos del usado", () => {
  const r = evaluarConversacion({
    turnos: [],
    sesion: { ...sesionCompleta, entrega_usado: 0 },
    usado: null,
    esperado: { ...esperado, entrega_usado: false, usado: null },
  });
  assert.equal(r.detalle.some((d) => d.campo.startsWith("usado.")), false);
  assert.equal(r.datosOk, r.datosTotal);
});

test("cuenta las preguntas prohibidas: km y estado del usado se ven en la agencia", () => {
  const turnos = [agente("¿De qué año es el Gol?"), cliente("2015"), agente("¿Cuántos kilómetros tiene?"), agente("¿Y en qué estado está?")];
  const r = evaluarConversacion({ turnos, sesion: sesionCompleta, usado: usadoCompleto, esperado });
  assert.equal(r.preguntasProhibidas, 2);
});

test("detecta si habló de cuotas con números", () => {
  const evaluar = (texto) => evaluarConversacion({ turnos: [agente(texto)], sesion: sesionCompleta, usado: usadoCompleto, esperado }).hablaDeCuotas;
  assert.equal(evaluar("Te quedarían 12 cuotas de $300.000."), true);
  assert.equal(evaluar("La cuota sería de $250.000 por mes."), true);
  assert.equal(evaluar("La financiación la armamos en la agencia a tu medida."), false);
});

test("detecta si mandó la dirección o el mapa", () => {
  const evaluar = (texto) => evaluarConversacion({ turnos: [agente(texto)], sesion: sesionCompleta, usado: usadoCompleto, esperado }).mandaUbicacion;
  assert.equal(evaluar("Te dejo la dirección: Av. Siempreviva 742 https://maps.app.goo.gl/abc"), true);
  assert.equal(evaluar("La agencia queda en Av. Alto Comedero."), true);
  assert.equal(evaluar("¡Te esperamos el sábado!"), false);
});

test("una semana acordada también cuenta como momento de visita", () => {
  const turnos = [agente("¡Perfecto! Los vamos a estar esperando la semana que viene.")];
  const r = evaluarConversacion({ turnos, sesion: sesionCompleta, usado: usadoCompleto, esperado });
  assert.equal(r.proponeDia, true);
});

test("suma los mensajes de WhatsApp que se cobran y cuenta las reacciones aparte", () => {
  const turnos = [
    cliente("hola"),
    { de: "agente", texto: "¡Hola! ¿Contado o financiado?", mensajesWA: 2 },
    cliente("contado"),
    { de: "agente", texto: "Te paso las fotos", mensajesWA: 1 },
    cliente("gracias!"),
    { de: "reaccion", texto: "👍" },
  ];
  const r = evaluarConversacion({ turnos, sesion: sesionCompleta, usado: usadoCompleto, esperado });
  assert.equal(r.mensajesWhatsApp, 3);
  assert.equal(r.reacciones, 1);
});

test("reconoce como invitación decirle que lo esperan en la agencia", () => {
  const turnos = [agente("¡Joya! Quedó anotado el jueves de 14 a 18. Un vendedor te va a estar esperando en la agencia.")];
  const r = evaluarConversacion({ turnos, sesion: sesionCompleta, usado: usadoCompleto, esperado });
  assert.equal(r.invitaVisita, true);
  assert.equal(r.proponeDia, true);
});
