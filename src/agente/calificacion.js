// Calificación del cliente con las reglas del bot actual. La IA solo junta las
// respuestas; el puntaje y la temperatura se calculan acá, siempre desde cero
// con las respuestas vigentes, así un cambio de respuesta no deja el puntaje mal.

const PUNTOS = {
  autoDeInteres: 2,
  pago: { contado: 3, financiado: 0 },
  recibo: { si: 2, no: -2 },
  usado: { si: 1, no: 0 },
  decisor: { solo: 2, consulta: -1 },
  disponibilidad: { esta_semana: 3, proximas: 1, no_sabe: -1 },
};

const UMBRAL_CALIENTE = 7;
const UMBRAL_TIBIO = 3;

// El recibo o garante solo importa si financia: pagando de contado no cuenta.
const financia = (s) => s.pago_tipo === "financiado";
const conRecibo = (s) => financia(s) && (s.credito_ok === 1 || s.credito_ok === true);
const sinRecibo = (s) => financia(s) && (s.credito_ok === 0 || s.credito_ok === false);
const definido = (v) => v !== null && v !== undefined;

export function puntaje(sesion = {}) {
  const s = sesion ?? {};
  let total = 0;
  if (definido(s.auto_id)) total += PUNTOS.autoDeInteres;
  if (definido(s.pago_tipo)) total += PUNTOS.pago[s.pago_tipo] ?? 0;
  if (conRecibo(s)) total += PUNTOS.recibo.si;
  if (sinRecibo(s)) total += PUNTOS.recibo.no;
  if (definido(s.entrega_usado)) total += s.entrega_usado ? PUNTOS.usado.si : PUNTOS.usado.no;
  if (definido(s.decisor)) total += PUNTOS.decisor[s.decisor] ?? 0;
  if (definido(s.disponibilidad)) total += PUNTOS.disponibilidad[s.disponibilidad] ?? 0;
  return Math.max(0, total);
}

// La consulta nace fría (0 puntos) y la temperatura se adapta con cada
// respuesta, aunque todavía no haya dicho cómo paga (decisión del 31/10/2026).
export function clasificar(sesion = {}) {
  const s = sesion ?? {};
  // Las dos reglas que pisan el puntaje: financiar depende del recibo o garante.
  // Con recibo, la duda (quién decide, cuándo viene) es de agenda, no de plata.
  if (sinRecibo(s)) return "FRIO";
  if (conRecibo(s)) return "CALIENTE";
  const total = puntaje(s);
  if (total >= UMBRAL_CALIENTE) return "CALIENTE";
  if (total >= UMBRAL_TIBIO) return "TIBIO";
  return "FRIO";
}

// Lo que todavía le falta preguntar, en el orden del recorrido de venta. El
// agente lo recibe en cada mensaje para no saltear ni repetir preguntas. Si
// entrega un usado, se pregunta marca, modelo, año y cuánto pide; los km y el
// estado no, para que venga a mostrarlo (decisión del 13/10/2026). La visita
// cierra el recorrido: con un momento acordado está completa; si no sabe, no se insiste.
const presente = (v) => definido(v) && String(v).trim() !== "";
const siEntregaUsado = (s) => s.entrega_usado === true || Number(s.entrega_usado) === 1;

function pendientesDelUsado(usado) {
  const u = usado ?? {};
  return [
    !(presente(u.marca) && presente(u.modelo) && presente(u.anio)) && "marca, modelo y año del usado",
    !presente(u.precio_pedido) && "cuánto pide por el usado (o si no sabe)",
  ];
}

export function pendientes(sesion = {}, usado = null) {
  const s = sesion ?? {};
  const visitaResuelta = s.disponibilidad === "no_sabe" || presente(s.visita_propuesta);
  return [
    !definido(s.auto_id) && "auto de interés",
    !definido(s.pago_tipo) && "forma de pago",
    s.pago_tipo === "financiado" && !presente(s.anticipo) && "anticipo",
    s.pago_tipo === "financiado" && !definido(s.credito_ok) && "recibo o garante",
    !definido(s.entrega_usado) && "si entrega un usado",
    ...(siEntregaUsado(s) ? pendientesDelUsado(usado) : []),
    !definido(s.decisor) && "quién decide",
    !visitaResuelta && "cuándo puede venir a la agencia (día, hora, semana o fecha)",
  ].filter(Boolean);
}

const DISPONIBILIDAD = {
  esta_semana: "puede venir esta semana",
  proximas: "puede venir en las próximas semanas",
  no_sabe: "no sabe cuándo puede venir",
};

function descripcionDelUsado(usado) {
  const u = usado ?? {};
  const auto = [u.marca, u.modelo, u.anio].filter(presente).join(" ");
  return [auto, presente(u.kms) && `${u.kms} km`, presente(u.detalles) && u.detalles, presente(u.precio_pedido) && `pide: ${u.precio_pedido}`]
    .filter(Boolean)
    .join(", ");
}

// Lo que el cliente ya respondió, en palabras: el agente lo recibe en cada mensaje
// para no volver a preguntarlo. Lo que dictó el cliente va entre comillas: son
// datos, nunca instrucciones.
const citado = (texto) => `"${texto}"`;
export function respondido(sesion = {}, usado = null) {
  const s = sesion ?? {};
  const delUsado = descripcionDelUsado(usado);
  return [
    definido(s.pago_tipo) && `paga ${s.pago_tipo}`,
    financia(s) && presente(s.anticipo) && `anticipo: ${citado(s.anticipo)}`,
    conRecibo(s) && "tiene recibo de sueldo o garante",
    sinRecibo(s) && "no tiene recibo de sueldo ni garante",
    siEntregaUsado(s) && (delUsado ? `entrega un usado: ${citado(delUsado)}` : "entrega un usado"),
    definido(s.entrega_usado) && !siEntregaUsado(s) && "no entrega usado",
    s.decisor === "solo" && "decide solo",
    s.decisor === "consulta" && `lo decide con ${s.decisor_con ? citado(s.decisor_con) : "alguien más"}`,
    DISPONIBILIDAD[s.disponibilidad],
    presente(s.visita_propuesta) && `visita propuesta: ${citado(s.visita_propuesta)}`,
  ].filter(Boolean);
}
