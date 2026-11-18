// Lector del documento de chats simulados: lo convierte en chats con sus pasos,
// su "Debe", su "No debe" y sus controles automáticos. Lo que no se entiende
// falla con el número de línea, para que un documento mal escrito no corra a medias.

const DATOS_GUARDADO = new Set(["pago_tipo", "anticipo", "entrega_usado", "auto", "visita", "requiere_vendedor", "permisos", "cuil", "nombre", "fotos_usado"]);
const CONTROLES_SI_NO = {
  "repite pregunta seguida: no": "repite_pregunta",
  "cuotas con números: no": "cuotas_con_numeros",
  "termina con 👍: no": "termina_con_pulgar",
  "se presenta más de una vez: no": "presentacion_repetida",
  "usa el nombre del perfil: no": "nombre_del_perfil",
  "pide fotos con la pregunta: sí": "fotos_con_pregunta",
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
  const pedidos = /^pide (fotos del usado|el nombre):\s*(\d+)$/.exec(texto);
  if (pedidos) return { tipo: pedidos[1] === "el nombre" ? "pedidos_de_nombre" : "pedidos_de_fotos", cantidad: Number(pedidos[2]) };
  if (CONTROLES_SI_NO[texto]) return { tipo: CONTROLES_SI_NO[texto] };
  throw falla(linea, `control desconocido "${texto}"`);
}

// Una línea del guion del modelo simulado: "Modelo: texto" o "Modelo (herramienta): nombre {json}".
function leerModelo(texto, linea) {
  const herramienta = /^Modelo \(herramienta\):\s*(.*)$/.exec(texto);
  if (herramienta) {
    const m = /^([A-Za-z_]\w*)(?:\s+([\s\S]+))?$/.exec(herramienta[1].trim());
    if (!m) throw falla(linea, `Modelo (herramienta) necesita el nombre de la herramienta: "${texto}"`);
    let entrada = {};
    if (m[2]) {
      try {
        entrada = JSON.parse(m[2]);
      } catch {
        throw falla(linea, `el JSON de la herramienta ${m[1]} no es válido`);
      }
    }
    return { herramienta: m[1], entrada };
  }
  const modelo = /^Modelo:\s*(.+)$/.exec(texto);
  return modelo ? { texto: modelo[1].replaceAll("\\n", "\n") } : null;
}

function leerPaso(texto) {
  const espera = ESPERA.exec(texto);
  if (espera) return { tipo: "espera", minutos: Number(espera[1]) * (/^m/i.test(espera[2]) ? 1 : 1440) };
  const cliente = /^Cliente(?: \((seguido|audio)\))?:\s*(.+)$/.exec(texto);
  if (!cliente) {
    const foto = /^Foto(?: \((seguido)\))?:\s*(.+)$/.exec(texto);
    if (!foto) return null;
    return foto[1] ? { tipo: "foto", descripcion: foto[2], seguido: true } : { tipo: "foto", descripcion: foto[2] };
  }
  if (cliente[1] === "audio") return { tipo: "audio", texto: cliente[2] };
  if (cliente[1] === "seguido") return { tipo: "mensaje", texto: cliente[2], seguido: true };
  return { tipo: "mensaje", texto: cliente[2] };
}

const nuevoChat = (codigo, nombre, linea) => ({
  codigo, nombre, linea, empieza: null, perfil: null, reglas: "", pasos: [], debe: [], noDebe: [], controles: [],
});

export function leerChats(texto) {
  const chats = [];
  let actual = null;
  let lista = null; // a dónde van las viñetas: "debe", "noDebe" o "controles"
  // Un mensaje del modelo puede seguir en las líneas de abajo (con renglones vacíos en el medio, como párrafos).
  let continuacion = null; // { respuesta, vacias }

  const cerrar = () => {
    if (actual && actual.pasos.length === 0) throw falla(actual.linea, `el chat ${actual.codigo} no tiene ningún paso`);
    if (actual) delete actual.linea;
    actual = null;
    lista = null;
  };

  String(texto).split(/\r?\n/).forEach((cruda, i) => {
    const numero = i + 1;
    const linea = cruda.trim();
    if (!linea || linea === "---") {
      if (!linea && continuacion) continuacion.vacias += 1;
      return;
    }
    const seguia = continuacion;
    continuacion = null;

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
    if (linea.startsWith("Perfil:")) {
      actual.perfil = linea.slice(7).trim() || null;
      return;
    }
    if (linea.startsWith("Modelo")) {
      const respuesta = leerModelo(linea, numero);
      if (!respuesta) throw falla(numero, `no se entiende la línea "${linea}"`);
      const anterior = actual.pasos.at(-1);
      if (!anterior) throw falla(numero, "una línea Modelo tiene que ir después de un paso");
      (anterior.guion ??= []).push(respuesta);
      if (respuesta.texto !== undefined) continuacion = { respuesta, vacias: 0 };
      return;
    }
    const paso = leerPaso(linea);
    if (!paso && seguia) {
      seguia.respuesta.texto += "\n".repeat(seguia.vacias + 1) + linea;
      continuacion = { respuesta: seguia.respuesta, vacias: 0 };
      return;
    }
    if (!paso) throw falla(numero, `no se entiende la línea "${linea}"`);
    actual.pasos.push(paso);
  });
  cerrar();
  return chats;
}
