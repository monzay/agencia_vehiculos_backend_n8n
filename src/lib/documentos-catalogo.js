// Qué pide cada papel del legajo. Es el mismo para las tres modalidades
// (consignación, compra y permuta): el auto es el mismo y sus papeles también.
//
// Esta es LA fuente: el servicio valida contra estas declaraciones antes de
// guardar, y el panel dibuja el formulario leyéndolas por API. Un papel nuevo
// se agrega acá (y su valor en el ENUM de la columna `tipo`) y aparece en los
// dos lados sin tocar el front.
//
// Los cuatro campos que van en TODOS los papeles (tipo, fecha de carga + quién,
// ubicación física y vencimiento) no están acá: son columnas de la tabla. Lo
// que se declara en `campos` es lo propio de cada tipo, que vive en `datos_json`.
//
// `fuenteDelVehiculo` marca el único papel que ESCRIBE sobre el ingreso: el
// título. Al guardarlo, sus datos del vehículo pasan a las columnas del ingreso
// (el alta ya no los pide).
//
// `cruces` es lo que habilita la alerta en los demás: mapea un campo del papel
// contra la columna equivalente del ingreso, que ya vino del título. Esos
// papeles nunca escriben; solo se comparan y, si difieren, el panel lo marca.

const TEXTO = (clave, label, extra = {}) => ({ clave, label, tipo: "texto", max: 120, ...extra });
const FECHA = (clave, label, extra = {}) => ({ clave, label, tipo: "fecha", ...extra });
const SI_NO = (clave, label, extra = {}) => ({ clave, label, tipo: "booleano", ...extra });
const MONEDA = (clave, label, extra = {}) => ({ clave, label, tipo: "moneda", ...extra });

// `vencimiento` dice qué hacer con la columna `fecha_vencimiento`:
//   "no"        → ese papel no vence, la columna queda NULL
//   "opcional"  → puede tener fecha
//   "requerido" → sin fecha el papel no sirve
//
// `destino` dice qué pasa con el papel FÍSICO una vez digitalizado:
//   "agencia" → el original queda en la agencia hasta que se transfiera
//   "cliente" → se escanea y se lo lleva de vuelta
// Es el criterio por defecto, no una ley: cada agencia lo maneja distinto y hay
// clientes que no dejan el título. Lo que pasó de verdad se anota en
// `ubicacion_fisica`, que es por documento.
export const CATALOGO = {
  titulo: {
    label: "Título del automotor",
    vencimiento: "no",
    destino: "agencia",
    campos: [
      TEXTO("dominio", "Dominio", { max: 15, requerido: true }),
      TEXTO("marca", "Marca", { max: 60, requerido: true }),
      TEXTO("modelo", "Modelo", { max: 80, requerido: true }),
      { clave: "anio", label: "Año", tipo: "numero", min: 1900, max: 2200, requerido: true },
      TEXTO("motor", "Número de motor", { max: 40 }),
      TEXTO("chasis", "Número de chasis", { max: 40 }),
      { clave: "origen", label: "Origen", tipo: "opciones", opciones: ["nacional", "importado"] },
      TEXTO("titular", "Titular"),
      { clave: "titular_porcentaje", label: "Porcentaje del titular", tipo: "numero", min: 0, max: 100 },
      SI_NO("prenda", "Tiene prenda"),
      SI_NO("embargo", "Tiene embargo"),
    ],
    // No se cruza contra el vehículo: ES el vehículo. Compararlo consigo mismo
    // nunca daría diferencia.
    fuenteDelVehiculo: true,
  },

  cedula_verde: {
    label: "Cédula verde",
    vencimiento: "opcional",
    destino: "agencia",
    campos: [
      TEXTO("dominio", "Dominio", { max: 15, requerido: true }),
      TEXTO("motor", "Número de motor", { max: 40 }),
      TEXTO("chasis", "Número de chasis", { max: 40 }),
      TEXTO("titular", "Titular"),
    ],
    cruces: { dominio: "dominio", motor: "motor", chasis: "chasis" },
  },

  formulario_08: {
    label: "Formulario 08",
    vencimiento: "no",
    destino: "agencia",
    // Solo se guardan las imágenes del 08: no declara datos propios.
    campos: [],
  },

  // El estado del auto HOY en el Registro. Es el que se mira antes de pagar:
  // una inhibición del titular o un embargo trabado ayer no aparecen en el
  // título que el cliente trae en la mano.
  informe_dominio: {
    label: "Informe de dominio",
    vencimiento: "opcional",
    destino: "agencia",
    campos: [
      TEXTO("registro", "Registro seccional que lo emitió", { requerido: true }),
      FECHA("fecha_emision", "Fecha de emisión", { requerido: true }),
      TEXTO("dominio", "Dominio", { max: 15, requerido: true }),
      TEXTO("titular_registral", "Titular registral"),
      SI_NO("prenda", "Tiene prenda"),
      SI_NO("embargo", "Tiene embargo"),
      SI_NO("inhibicion", "El titular tiene inhibición"),
      SI_NO("denuncia_robo", "Tiene denuncia de robo o hurto"),
    ],
    // Mismo criterio que el histórico: el titular registral no se cruza.
    cruces: { dominio: "dominio" },
  },

  informe_dominio_historico: {
    label: "Informe de dominio histórico",
    vencimiento: "opcional",
    destino: "agencia",
    campos: [
      TEXTO("registro", "Registro seccional que lo emitió", { requerido: true }),
      FECHA("fecha_emision", "Fecha de emisión", { requerido: true }),
      TEXTO("dominio", "Dominio", { max: 15, requerido: true }),
      TEXTO("titular_registral", "Titular registral"),
      { clave: "titulares_anteriores", label: "Cantidad de dueños anteriores", tipo: "numero", min: 0, max: 99 },
      SI_NO("prenda", "Tiene prenda"),
      SI_NO("embargo", "Tiene embargo"),
      SI_NO("denuncia_venta", "Tiene denuncia de venta"),
      SI_NO("pedido_secuestro", "Tiene pedido de secuestro"),
    ],
    // El titular registral NO se cruza contra el titular cargado a propósito:
    // que no coincidan es información, no un error (puede vender un apoderado),
    // y eso se mira a ojo antes de firmar.
    cruces: { dominio: "dominio" },
  },

  libre_deuda_patentes: {
    label: "Libre deuda de patentes",
    vencimiento: "opcional",
    destino: "agencia",
    campos: [
      TEXTO("organismo", "Organismo que lo emitió", { requerido: true }),
      FECHA("fecha_emision", "Fecha de emisión", { requerido: true }),
      SI_NO("debe", "¿Debe?", { requerido: true }),
      MONEDA("monto", "Cuánto debe"),
    ],
  },

  libre_deuda_infracciones: {
    label: "Libre deuda de infracciones",
    vencimiento: "opcional",
    destino: "agencia",
    campos: [
      TEXTO("organismo", "Organismo que lo emitió", { requerido: true }),
      FECHA("fecha_emision", "Fecha de emisión", { requerido: true }),
      SI_NO("tiene_multas", "¿Tiene multas?", { requerido: true }),
      MONEDA("monto", "Cuánto suman"),
    ],
  },

  vtv: {
    label: "VTV / RTO",
    vencimiento: "requerido",
    destino: "agencia",
    campos: [],
  },

  verificacion_policial: {
    label: "Verificación policial (F12)",
    vencimiento: "requerido",
    destino: "agencia",
    campos: [
      FECHA("fecha_emision", "Fecha de emisión", { requerido: true }),
      { clave: "resultado", label: "Resultado", tipo: "opciones", opciones: ["apto", "no_apto"], requerido: true },
    ],
  },

  dni_titular: {
    label: "DNI del titular",
    vencimiento: "opcional",
    // El DNI es del dueño y vuelve con él: la agencia nunca retiene el original.
    destino: "cliente",
    campos: [
      TEXTO("nombre", "Nombre", { requerido: true }),
      TEXTO("apellido", "Apellido", { requerido: true }),
      TEXTO("documento", "Número de documento", { max: 20, requerido: true }),
      TEXTO("cuit", "CUIT / CUIL", { max: 13 }),
    ],
  },




};

export const TIPOS = Object.keys(CATALOGO);

function error(mensaje, status = 400) {
  const e = new Error(mensaje);
  e.status = status;
  return e;
}

const vacio = (v) => v === undefined || v === null || v === "";

// Convierte y valida un valor según lo declarado. Devuelve el valor ya tipado.
function valorValido(campo, bruto) {
  const { label, tipo } = campo;

  if (tipo === "texto") {
    const limpio = String(bruto).trim().replace(/\s+/g, " ");
    const max = campo.max ?? 120;
    if (limpio.length > max) throw error(`${label} supera los ${max} caracteres.`);
    return limpio;
  }

  if (tipo === "numero" || tipo === "moneda") {
    const n = Number(bruto);
    if (!Number.isFinite(n)) throw error(`${label} debe ser un número.`);
    const min = campo.min ?? (tipo === "moneda" ? 0 : null);
    if (min != null && n < min) throw error(`${label} no puede ser menor a ${min}.`);
    if (campo.max != null && n > campo.max) throw error(`${label} no puede ser mayor a ${campo.max}.`);
    return n;
  }

  if (tipo === "fecha") {
    const iso = String(bruto).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || Number.isNaN(Date.parse(iso))) {
      throw error(`${label} debe ser una fecha válida.`);
    }
    return iso;
  }

  if (tipo === "booleano") {
    if (typeof bruto === "boolean") return bruto;
    if (bruto === "true" || bruto === "si") return true;
    if (bruto === "false" || bruto === "no") return false;
    throw error(`${label} debe ser sí o no.`);
  }

  const elegido = String(bruto);
  if (!campo.opciones.includes(elegido)) {
    throw error(`${label} debe ser uno de: ${campo.opciones.join(", ")}.`);
  }
  return elegido;
}

// Valida `datos` contra el tipo y devuelve el objeto limpio que va a `datos_json`.
// Lista blanca: una clave no declarada se rechaza en vez de ignorarse, así un
// campo mal escrito se ve en el momento en lugar de perderse en silencio.
export function validarDatosDocumento(tipo, datos = {}) {
  const spec = CATALOGO[tipo];
  if (!spec) throw error(`Tipo de documento desconocido: ${tipo}.`);
  if (datos === null || typeof datos !== "object" || Array.isArray(datos)) {
    throw error("Los datos del documento deben ser un objeto.");
  }

  const declarados = new Set(spec.campos.map((c) => c.clave));
  const intrusa = Object.keys(datos).find((clave) => !declarados.has(clave));
  if (intrusa) throw error(`El campo "${intrusa}" no corresponde a ${spec.label}.`);

  const limpio = {};
  for (const campo of spec.campos) {
    const bruto = datos[campo.clave];
    if (vacio(bruto)) {
      if (campo.requerido) throw error(`${campo.label} es obligatorio en ${spec.label}.`);
      continue;
    }
    limpio[campo.clave] = valorValido(campo, bruto);
  }
  return limpio;
}

// Compara lo que declara el papel contra la verdad del ingreso. No corrige
// nada: devuelve las diferencias para que el panel las muestre.
export function cruzarConIngreso(tipo, datos, ingreso) {
  const cruces = CATALOGO[tipo]?.cruces;
  if (!cruces || !datos || !ingreso) return [];

  const normalizar = (v) => (typeof v === "string" ? v.trim().toUpperCase().replace(/[\s-]/g, "") : v);

  return Object.entries(cruces).flatMap(([campoPapel, campoIngreso]) => {
    const enPapel = datos[campoPapel];
    const enSistema = ingreso[campoIngreso];
    if (vacio(enPapel) || vacio(enSistema)) return [];
    if (normalizar(enPapel) === normalizar(enSistema)) return [];
    return [{ campo: campoPapel, enPapel, enSistema }];
  });
}
