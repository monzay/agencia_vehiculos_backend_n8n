// Controles automáticos de un chat simulado: se aplican a lo que dijo el bot y a
// lo que quedó guardado, sin IA. Cada uno devuelve { control, ok, detalle }.

import { temasPreguntados, CUOTAS_CON_NUMEROS } from "../evaluar.js";

// Sin mayúsculas ni tildes, para que "Perdón" y "perdon" sean lo mismo.
const normalizar = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const presente = (v) => v !== null && v !== undefined && String(v).trim() !== "";
const comoBooleano = (v) => v === true || v === 1 || v === "1" || v === "true";
const TIENE_VALOR = new Set(["anticipo", "visita", "cuil"]);
const PULGAR_SUELTO = /^👍[\u{1F3FB}-\u{1F3FF}]?️?$/u;

// Un texto que empieza con un número no vale si en el mensaje va pegado a otro
// número, punto o coma ("0 km" no está en "148.000 km", sí en "tiene 0 km").
function contiene(mensaje, buscado) {
  const heno = normalizar(mensaje);
  const aguja = normalizar(buscado);
  if (!aguja) return false;
  const empiezaConDigito = /^\d/.test(aguja);
  for (let i = heno.indexOf(aguja); i !== -1; i = heno.indexOf(aguja, i + 1)) {
    if (!(empiezaConDigito && i > 0 && /[\d.,]/.test(heno[i - 1]))) return true;
  }
  return false;
}

const resultado = (control, ok, detalle) => ({ control, ok, detalle: ok ? null : detalle });
const textos = (t) => t.mensajesBot.map((m) => m.texto);

function controlGuardado(control, { guardado }) {
  const { dato, valor } = control;
  const obtenido = guardado?.[dato];
  const mostrar = presente(obtenido) ? String(obtenido) : "vacío";
  let ok;
  if (valor === "vacío") ok = !presente(obtenido);
  else if (valor === "sí" || valor === "no") {
    const afirmativo = TIENE_VALOR.has(dato) ? presente(obtenido) : comoBooleano(obtenido);
    // "no" también exige que el dato esté anotado, salvo en los que se miden por tener valor.
    ok = valor === "sí" ? afirmativo : TIENE_VALOR.has(dato) ? !afirmativo : presente(obtenido) && !afirmativo;
  } else if (/^\d+$/.test(valor) && presente(obtenido) && !isNaN(Number(obtenido))) ok = Number(obtenido) === Number(valor);
  else ok = presente(obtenido) && String(obtenido).trim().toLowerCase() === valor.toLowerCase();
  return resultado(control, ok, `${dato}: se esperaba ${valor} y quedó ${mostrar}`);
}

function controlRepitePregunta(control, transcripcion) {
  const normales = transcripcion.mensajesBot.filter((m) => !m.recordatorio);
  for (let i = 1; i < normales.length; i++) {
    const anteriores = temasPreguntados(normales[i - 1].texto);
    const repetido = temasPreguntados(normales[i].texto).find((tema) => anteriores.includes(tema));
    if (repetido) return resultado(control, false, `repite la pregunta de "${repetido}" en dos respuestas seguidas`);
  }
  return resultado(control, true);
}

const PRESENTACION = /\bsoy\s+[^,.!?\n]+,\s*asesor de ventas/;
// Pedirle fotos al cliente ("pasame unas fotos", "¿me mandás las fotos?", "podés enviarme fotos"); ofrecer
// las del catálogo ("te paso las fotos del Vento") no cuenta.
const PEDIDO_DE_FOTOS = /\b(?:(?:pasa|manda|envia|subi|adjunta)(?:r(?:me|nos)?|me|nos)?|mandas|pasas|envias|compartis|compartime|compartir(?:me|nos)?)\b[^.?!\n]*\bfotos?\b/;
const PIDE_NOMBRE = /\btu nombre\b|\bcomo te llamas\b|\bcual es tu nombre\b/;
const pedidoDeFotos = (texto) => PEDIDO_DE_FOTOS.test(normalizar(texto));
const pideNombre = (texto) => {
  const t = normalizar(texto);
  return PIDE_NOMBRE.test(t) && t.includes("?");
};

const CONTROLES = {
  prohibido: (c, t) => {
    const hallado = textos(t).some((x) => contiene(x, c.texto));
    return resultado(c, !hallado, `algún mensaje contiene "${c.texto}"`);
  },
  obligatorio: (c, t) => {
    const hallado = textos(t).some((x) => contiene(x, c.texto));
    return resultado(c, hallado, `ningún mensaje contiene "${c.texto}"`);
  },
  guardado: controlGuardado,
  fotos: (c, t) => {
    const n = t.mensajesBot.filter((m) => m.fotos > 0).length;
    return resultado(c, n === c.cantidad, `salieron ${n} mensajes con fotos y se esperaban ${c.cantidad}`);
  },
  recordatorios: (c, t) => {
    const n = t.mensajesBot.filter((m) => m.recordatorio).length;
    return resultado(c, n === c.cantidad, `salieron ${n} recordatorios y se esperaban ${c.cantidad}`);
  },
  repite_pregunta: controlRepitePregunta,
  presentacion_repetida: (c, t) => {
    const n = textos(t).filter((x) => PRESENTACION.test(normalizar(x))).length;
    return resultado(c, n <= 1, `${n} mensajes se presentan ("soy ..., asesor de ventas")`);
  },
  nombre_del_perfil: (c, t, chat) => {
    const perfil = normalizar(chat?.perfil).trim();
    const hallado = perfil !== "" && textos(t).some((x) => normalizar(x).includes(perfil));
    return resultado(c, !hallado, `algún mensaje nombra al cliente con su perfil de WhatsApp "${chat?.perfil}"`);
  },
  fotos_con_pregunta: (c, t) => resultado(c, textos(t).some((x) => pedidoDeFotos(x) && String(x).includes("?")), "ningún mensaje pide fotos y hace la pregunta en el mismo mensaje"),
  pedidos_de_fotos: (c, t) => {
    const n = textos(t).filter(pedidoDeFotos).length;
    return resultado(c, n === c.cantidad, `se pidieron fotos en ${n} mensajes y se esperaban ${c.cantidad}`);
  },
  pedidos_de_nombre: (c, t) => {
    const n = textos(t).filter(pideNombre).length;
    return resultado(c, n === c.cantidad, `se pidió el nombre en ${n} mensajes y se esperaban ${c.cantidad}`);
  },
  cuotas_con_numeros: (c, t) => resultado(c, !textos(t).some((x) => CUOTAS_CON_NUMEROS.test(x)), "algún mensaje nombra cuotas con números"),
  termina_con_pulgar: (c, t) => {
    const falla = textos(t).some((x) => {
      const lineas = String(x).trim().split(/\r?\n/);
      return lineas.length > 1 && PULGAR_SUELTO.test(lineas.at(-1).trim());
    });
    return resultado(c, !falla, "algún mensaje con texto termina con un 👍 suelto");
  },
};

export function aplicarControles(chat, transcripcion) {
  return chat.controles.map((control) => CONTROLES[control.tipo](control, transcripcion, chat));
}
