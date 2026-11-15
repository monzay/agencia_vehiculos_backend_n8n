// Lector del documento de chats simulados: lo convierte en chats con sus pasos,
// su "Debe", su "No debe" y sus controles automáticos. Lo que no se entiende
// falla con el número de línea, para que un documento mal escrito no corra a medias.

const DATOS_GUARDADO = new Set(["pago_tipo", "anticipo", "entrega_usado", "auto", "visita", "requiere_vendedor", "permisos", "cuil"]);
const CONTROLES_SI_NO = {
  "repite pregunta seguida: no": "repite_pregunta",
  "cuotas con números: no": "cuotas_con_numeros",
  "termina con 👍: no": "termina_con_pulgar",
};

const TITULO_CHAT = /^##\s+([A-Z]\d+)\s+·\s+(.+)$/;
const OTRO_ENCABEZADO = /^#{1,2}\s/;
const ESPERA = /^\(pasan (\d+) (minutos?|d[ií]as?)\)$/i;
const EMPIEZA = /^(?:\S+\s+)?(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/;

const falla = (linea, motivo) => new Error(`línea ${linea}: ${motivo}`);

// La hora del documento es de Argentina (UTC-3, sin horario de verano).
function fechaArgentina(texto, linea) {
  const m = EMPIEZA.exec(texto);
  if (!m) throw falla(linea, `no se entiende "Empieza: ${texto}" (se espera "día d/m/aaaa hh:mm")`);
  const [dia, mes, anio, hora, minuto] = m.slice(1).map(Number);
  return new Date(Date.UTC(anio, mes - 1, dia, hora + 3, minuto));
}

function leerControl(texto, linea) {
  const comillas = /^(prohibido|obligatorio):\s*"(.*)"$/.exec(texto);
  if (comillas) return { tipo: comillas[1], texto: comillas[2] };
  const guardado = /^guardado:\s*(\S+)\s*=\s*(.+)$/.exec(texto);
  if (guardado) {
    if (!DATOS_GUARDADO.has(guardado[1])) throw falla(linea, `dato de guardado desconocido "${guardado[1]}"`);
    return { tipo: "guardado", dato: guardado[1], valor: guardado[2].trim() };
  }
  const cantidad = /^(fotos|recordatorios):\s*(\d+)$/.exec(texto);
  if (cantidad) return { tipo: cantidad[1], cantidad: Number(cantidad[2]) };
  if (CONTROLES_SI_NO[texto]) return { tipo: CONTROLES_SI_NO[texto] };
  throw falla(linea, `control desconocido "${texto}"`);
}

function leerPaso(texto) {
  const espera = ESPERA.exec(texto);
  if (espera) return { tipo: "espera", minutos: Number(espera[1]) * (/^m/i.test(espera[2]) ? 1 : 1440) };
  const cliente = /^Cliente(?: \((seguido|audio)\))?:\s*(.+)$/.exec(texto);
  if (!cliente) return null;
  if (cliente[1] === "audio") return { tipo: "audio", texto: cliente[2] };
  if (cliente[1] === "seguido") return { tipo: "mensaje", texto: cliente[2], seguido: true };
  return { tipo: "mensaje", texto: cliente[2] };
}

const nuevoChat = (codigo, nombre, linea) => ({
  codigo, nombre, linea, empieza: null, reglas: "", pasos: [], debe: [], noDebe: [], controles: [],
});

export function leerChats(texto) {
  const chats = [];
  let actual = null;
  let lista = null; // a dónde van las viñetas: "debe", "noDebe" o "controles"

  const cerrar = () => {
    if (actual && actual.pasos.length === 0) throw falla(actual.linea, `el chat ${actual.codigo} no tiene ningún paso`);
    if (actual) delete actual.linea;
    actual = null;
    lista = null;
  };

  String(texto).split(/\r?\n/).forEach((cruda, i) => {
    const numero = i + 1;
    const linea = cruda.trim();
    if (!linea || linea === "---") return;

    const titulo = TITULO_CHAT.exec(linea);
    if (titulo) {
      cerrar();
      if (chats.some((c) => c.codigo === titulo[1])) throw falla(numero, `el código ${titulo[1]} está repetido`);
      actual = nuevoChat(titulo[1], titulo[2].trim(), numero);
      chats.push(actual);
      return;
    }
    if (OTRO_ENCABEZADO.test(linea)) return cerrar();
    if (!actual) return; // lo anterior al primer chat no se lee

    if (linea === "Debe:") return void (lista = "debe");
    if (linea === "No debe:") return void (lista = "noDebe");
    if (linea === "Control automático:") return void (lista = "controles");

    if (linea.startsWith("- ")) {
      const item = linea.slice(2).trim();
      if (!lista) throw falla(numero, "viñeta fuera de Debe, No debe o Control automático");
      if (lista === "controles") actual.controles.push(leerControl(item, numero));
      else actual[lista].push(item);
      return;
    }

    lista = null;
    if (linea.startsWith("Empieza:")) {
      actual.empieza = fechaArgentina(linea.slice(8).trim(), numero);
      return;
    }
    if (linea.startsWith("Regla:")) {
      actual.reglas = linea.slice(6).trim();
      return;
    }
    const paso = leerPaso(linea);
    if (!paso) throw falla(numero, `no se entiende la línea "${linea}"`);
    actual.pasos.push(paso);
  });
  cerrar();
  return chats;
}
