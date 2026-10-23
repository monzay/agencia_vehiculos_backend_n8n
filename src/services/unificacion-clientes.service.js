import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../lib/prisma.js";
import { CANALES_MENSAJERIA, VIGENTE_CLIENTE, planDeUnificacion, normalizarTelefonos, normalizarDnis, fusionarClientes } from "./clientes.service.js";

// Une las fichas de cliente que son la misma persona (una persona = una ficha, migración 073).
// Lo corre `scripts/unificar-clientes.js`; la lógica vive acá para probarla con una base falsa.
// Nunca borra filas: fusionar es archivar la ficha de origen (`deleted_at` + `fusionado_en_id`)
// y anotar la fusión en `cliente_fusiones`.
//
// Pasos de `--aplicar`: 0) vincular en `cliente_canales` los canales que quedaron solo en
// `canal_id`, 1) normalizar teléfonos, 2) normalizar DNIs, 3) fusionar según el plan, cada
// fusión en su transacción. La prueba hace los mismos pasos sobre la misma vista de la base, sin escribir.
//
// Un identificador que no se puede vincular porque ya es de otra ficha (la que creó el backend nuevo para el
// mismo número) cuenta igual como el WhatsApp de su ficha al normalizar teléfonos: así el plan las une por
// teléfono y la 074, al sacar `canal_id`, no deja a la vieja sin su única llave.

const MUESTRA = 5; // ejemplos que muestra el texto de cada lista
const MUESTRA_IDS = 20; // ids que muestra en una sola línea la lista de fichas a revisar

// Qué tiene cada ficha: las filas que la fusión le mueve al destino.
const CONTENIDO = [
  { clave: "consultas", modelo: "chat_estado" },
  { clave: "financiaciones", modelo: "financiaciones" },
  { clave: "tramites", modelo: "consignacion_ingresos" },
  { clave: "senas", modelo: "senas" },
];

const claveDeCanal = (canal, identificador) => `${canal}:${identificador}`;

// ── Paso 0: vincular los canales que quedaron sin fila ──

// ¿Existe todavía `clientes.canal_id`? La 074 la saca, y con ella el motivo de este paso.
async function existeCanalId(db) {
  const [{ n }] = await db.$queryRaw`SELECT COUNT(*) AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'clientes' AND COLUMN_NAME = 'canal_id'`;
  return Number(n) > 0;
}

/**
 * Las fichas de WhatsApp/Facebook/Instagram con identificador en `canal_id`, en dos grupos:
 *  - `sinVincular`: su par (canal, identificador) no está en `cliente_canales`. Son las que el backend
 *    viejo creó entre la 073 y el backend nuevo. Es el `INSERT … SELECT … WHERE NOT EXISTS` de la 073,
 *    hecho en JS para poder probarlo. Cuenta también las archivadas (el chequeo de la 074 las cuenta) y
 *    no vuelve a vincular un identificador que ya pasó a otra ficha por una fusión.
 *  - `enOtraFicha`: su par ya está, pero a nombre de OTRA ficha vigente (`vinculado_a`): el backend nuevo
 *    creó otra para el mismo número. No se pueden vincular (el par es único) y sin teléfono el plan no las
 *    uniría: la 074 les sacaría su única llave. Las archivadas no cuentan: su número pasó a propósito.
 * Sin la columna no hay nada que vincular.
 * La columna se lee con SQL directo: el Prisma del backend nuevo ya no la conoce, y en producción el
 * script corre entre ese backend y la 074.
 */
async function canalesSinVincular(db) {
  if (!(await existeCanalId(db))) return { omitido: true, sinVincular: [], enOtraFicha: [] };

  const fichas = await db.$queryRaw`SELECT id, canal, canal_id, deleted_at FROM clientes WHERE canal_id IS NOT NULL AND canal_id <> '' ORDER BY id`;
  const vinculados = await db.cliente_canales.findMany({ select: { cliente_id: true, canal: true, identificador: true } });
  const duenioDe = new Map(vinculados.map(({ cliente_id, canal, identificador }) => [claveDeCanal(canal, identificador), cliente_id]));

  const deMensajeria = fichas
    .filter(({ canal }) => CANALES_MENSAJERIA.includes(canal))
    .map(({ id, canal, canal_id, deleted_at }) => ({
      vinculo: { cliente_id: Number(id), canal, identificador: canal_id }, // el id llega como BigInt
      vigente: deleted_at == null,
      duenio: duenioDe.get(claveDeCanal(canal, canal_id)),
    }));

  return {
    omitido: false,
    sinVincular: deMensajeria.filter(({ duenio }) => duenio === undefined).map(({ vinculo }) => vinculo),
    enOtraFicha: deMensajeria
      .filter(({ vinculo, vigente, duenio }) => vigente && duenio !== undefined && duenio !== vinculo.cliente_id)
      .map(({ vinculo, duenio }) => ({ ...vinculo, vinculado_a: duenio })),
  };
}

// De a una: si otro proceso se adelantó con el mismo identificador, ese ya tiene su fila y se informa como omitido.
async function vincularCanales(db, pendientes) {
  const vinculados = [];
  const omitidos = [];
  for (const vinculo of pendientes) {
    try {
      await db.cliente_canales.create({ data: vinculo });
      vinculados.push(vinculo);
    } catch (e) {
      if (e?.code !== "P2002") throw e;
      omitidos.push(vinculo);
    }
  }
  return { vinculados, omitidos };
}

// ── La base con la que se normaliza ──

const coincideVinculo = (vinculo, where = {}) =>
  Object.entries(where).every(([campo, valor]) => {
    if (valor !== null && typeof valor === "object") throw new Error(`La vista de la base no entiende el filtro de "${campo}".`);
    return vinculo[campo] === valor;
  });

const proyectar = (fila, select) => (select ? Object.fromEntries(Object.keys(select).map((campo) => [campo, fila[campo]])) : { ...fila });

/**
 * La base con la que corren las funciones de normalización, la misma vista en la prueba y en `--aplicar`: así la
 * prueba cuenta lo mismo que va a hacer `--aplicar`. En las dos, `cliente_canales.findMany` suma `canalesExtra`,
 * los identificadores que no tienen fila propia pero cuentan como el WhatsApp de su ficha. En la prueba además
 * `clientes.update` no escribe; con `--aplicar` escribe de verdad. Lo que no está listado acá no existe: si esas
 * funciones pasan a usar otra tabla o a escribir de otra forma, la prueba falla en vez de escribir.
 */
function vistaDeLaBase(db, canalesExtra, { escribir }) {
  return {
    clientes: escribir ? db.clientes : { findMany: (args) => db.clientes.findMany(args), update: async () => ({}) },
    cliente_canales: {
      findMany: async (args = {}) => {
        const reales = await db.cliente_canales.findMany(args);
        const extra = canalesExtra.filter((vinculo) => coincideVinculo(vinculo, args.where)).map((vinculo) => proyectar(vinculo, args.select));
        return [...reales, ...extra];
      },
    },
  };
}

// ── Lectura de las fichas ──

// Las fichas como las lee el plan: `{ id, nombre, telefono, dni, canal }`. El número de WhatsApp de las que no
// tienen teléfono ya lo puso `normalizarTelefonos` (desde `cliente_canales`, así anda también sin `canal_id`).
const fichasVigentes = (base) =>
  base.clientes.findMany({
    where: VIGENTE_CLIENTE,
    select: { id: true, nombre: true, telefono: true, dni: true, canal: true },
    orderBy: { id: "asc" },
  });

// Las fichas como van a quedar después de normalizar (en la prueba, sin haber escrito nada).
function conCambios(fichas, { telefonos, dnis }) {
  const telefonoNuevo = new Map(telefonos.map(({ id, despues }) => [id, despues]));
  const dniNuevo = new Map(dnis.map(({ id, despues }) => [id, despues]));
  return fichas.map((ficha) => ({
    ...ficha,
    telefono: telefonoNuevo.get(ficha.id) ?? ficha.telefono,
    dni: dniNuevo.get(ficha.id) ?? ficha.dni,
  }));
}

const idsDelPlan = ({ grupos, dudosos }) =>
  [
    ...new Set([
      ...grupos.flatMap((grupo) => [grupo.destinoId, ...grupo.origenes.map((origen) => origen.id)]),
      ...dudosos.flatMap((dudoso) => dudoso.fichas.map((ficha) => ficha.id)),
    ]),
  ].sort((a, b) => a - b);

const contarPorCliente = (filas) => filas.reduce((cuentas, { cliente_id }) => cuentas.set(cliente_id, (cuentas.get(cliente_id) ?? 0) + 1), new Map());

// Los datos y el contenido de cada ficha que aparece en el plan (las de los grupos y las dudosas).
async function detalleDeFichas(plan, fichas, db) {
  const ids = idsDelPlan(plan);
  if (!ids.length) return {};

  const porId = new Map(fichas.map((ficha) => [ficha.id, ficha]));
  const cuentas = [];
  for (const { clave, modelo } of CONTENIDO) {
    const filas = await db[modelo].findMany({ where: { cliente_id: { in: ids } }, select: { cliente_id: true } });
    cuentas.push([clave, contarPorCliente(filas)]);
  }
  return Object.fromEntries(
    ids.map((id) => {
      const { nombre, canal, telefono, dni } = porId.get(id);
      const contenido = Object.fromEntries(cuentas.map(([clave, porCliente]) => [clave, porCliente.get(id) ?? 0]));
      return [id, { id, nombre: nombre ?? null, canal, telefono, dni, ...contenido }];
    })
  );
}

// ── Fusiones ──

// Una por origen, cada una en su transacción: si una falla se anota y sigue con las demás.
async function fusionarSegunPlan(plan, db) {
  const fusiones = [];
  const errores = [];
  for (const { destinoId, origenes } of plan.grupos) {
    for (const { id: origenId, motivo } of origenes) {
      try {
        fusiones.push(await fusionarClientes({ origenId, destinoId, motivo }, db));
      } catch (e) {
        errores.push({ origenId, destinoId, motivo, status: e?.status ?? null, mensaje: e?.message ?? String(e) });
      }
    }
  }
  return { fusiones, errores };
}

/**
 * Unifica las fichas de cliente que son la misma persona. Con `aplicar: true` escribe (vincula
 * canales, normaliza teléfonos y DNIs y fusiona); en cualquier otro caso es una prueba que no escribe
 * nada y devuelve lo mismo que haría. El resultado se puede guardar como JSON tal cual:
 * `{ aplicar, fichasVigentes, canales: { omitido, sinVincular, enOtraFicha, vinculados, omitidos },
 *    normalizado: { telefonos, dnis }, plan: { grupos, dudosos, revisar }, fichas, fusiones, errores }`.
 */
export async function ejecutarUnificacion({ db = prisma, aplicar = false } = {}) {
  const escribir = aplicar === true;

  const { omitido, sinVincular, enOtraFicha } = await canalesSinVincular(db);
  const { vinculados, omitidos } = escribir ? await vincularCanales(db, sinVincular) : { vinculados: [], omitidos: [] };

  // Los identificadores sin fila propia cuentan como el WhatsApp de su ficha al normalizar teléfonos. Con
  // `--aplicar` los que se pudieron vincular ya están en la base; la prueba los suma como si lo estuvieran.
  const canalesExtra = escribir ? [...enOtraFicha, ...omitidos] : [...sinVincular, ...enOtraFicha];
  const base = vistaDeLaBase(db, canalesExtra, { escribir });
  const telefonos = await normalizarTelefonos(base);
  const dnis = await normalizarDnis(base);

  const vigentes = conCambios(await fichasVigentes(base), { telefonos, dnis });
  const plan = planDeUnificacion(vigentes);
  const fichas = await detalleDeFichas(plan, vigentes, db);
  const { fusiones, errores } = escribir ? await fusionarSegunPlan(plan, db) : { fusiones: [], errores: [] };

  return {
    aplicar: escribir,
    fichasVigentes: vigentes.length,
    canales: { omitido, sinVincular, enOtraFicha, vinculados, omitidos },
    normalizado: { telefonos, dnis },
    plan,
    fichas,
    fusiones,
    errores,
  };
}

// ── El informe ──

const plural = (n, singular, varios) => `${n} ${n === 1 ? singular : varios}`;
const unaLinea = (texto) => String(texto).replace(/\s+/g, " ").trim();

const describir = (ficha) =>
  `#${ficha.id} ${ficha.nombre ?? "(sin nombre)"} [${ficha.canal}] tel ${ficha.telefono ?? "—"} ${ficha.dni ? `DNI ${ficha.dni}` : "sin DNI"}: ` +
  `consultas ${ficha.consultas}, financiaciones ${ficha.financiaciones}, trámites ${ficha.tramites}, señas ${ficha.senas}`;

const conMas = (lineas, total) => (total > MUESTRA ? [...lineas, `  … y ${total - MUESTRA} más`] : lineas);

const describirVinculo = ({ cliente_id, canal, identificador, vinculado_a }) =>
  `  #${cliente_id} ${canal} ${identificador}${vinculado_a ? ` (ya vinculado a #${vinculado_a})` : ""}`;
const ejemplosDeVinculos = (lista) => conMas(lista.slice(0, MUESTRA).map(describirVinculo), lista.length);

function lineasDeCanales({ omitido, sinVincular, enOtraFicha, vinculados, omitidos }, escribio) {
  if (omitido) return ["Canales por vincular: se omite (la columna canal_id ya no existe)."];
  const titulo = escribio
    ? `Canales vinculados: ${vinculados.length} de ${sinVincular.length}`
    : `Canales por vincular: ${sinVincular.length}${sinVincular.length ? " (se vincularían con --aplicar)" : ""}`;
  const enOtra = `Canales ya vinculados a otra ficha: ${enOtraFicha.length}${enOtraFicha.length ? " (cuentan como el WhatsApp de la ficha para unirla por teléfono)" : ""}`;
  return [
    titulo,
    ...ejemplosDeVinculos(escribio ? vinculados : sinVincular),
    enOtra,
    ...ejemplosDeVinculos(enOtraFicha),
    ...(escribio ? [`Canales omitidos (otro proceso los vinculó antes): ${omitidos.length}`, ...ejemplosDeVinculos(omitidos)] : []),
  ];
}

function lineasDeNormalizacion({ telefonos, dnis }, escribio) {
  const cuantos = `${plural(telefonos.length, "teléfono", "teléfonos")} y ${plural(dnis.length, "DNI", "DNIs")}`;
  const ejemplos = (cambios, etiqueta) =>
    conMas(
      cambios.slice(0, MUESTRA).map(({ id, antes, despues }) => `  ${etiqueta} #${id}: ${antes ?? "(vacío)"} → ${despues}`),
      cambios.length
    );
  return [escribio ? `Normalizados: ${cuantos}.` : `Se normalizarían ${cuantos}.`, ...ejemplos(telefonos, "teléfono"), ...ejemplos(dnis, "DNI")];
}

function lineasDeGrupos({ grupos }, fichas) {
  return [
    `Grupos a unificar: ${grupos.length}`,
    ...grupos.flatMap(({ destinoId, origenes }, i) => [
      `  Grupo ${i + 1}: #${destinoId} ← ${origenes.map((origen) => `#${origen.id} (${origen.motivo})`).join(", ")}`,
      `    destino ${describir(fichas[destinoId])}`,
      ...origenes.map((origen) => `    origen ${describir(fichas[origen.id])}`),
    ]),
  ];
}

function lineasDeDudosos({ dudosos }, fichas) {
  if (!dudosos.length) return ["Dudosos: 0"];
  return [
    `Dudosos: ${dudosos.length} (un mismo teléfono con DNI distintos; no se une nada)`,
    ...dudosos.flatMap(({ telefono, fichas: delTelefono }) => [`  tel ${telefono}`, ...delTelefono.map(({ id }) => `    ${describir(fichas[id])}`)]),
  ];
}

// Solo los ids: el valor del documento (un pasaporte, un "S/D") no se copia al informe.
function lineasDeRevisar({ revisar }) {
  if (!revisar.length) return ["A revisar a mano: 0"];
  return [
    `A revisar a mano: ${revisar.length} (el DNI no es de 7 a 9 dígitos; no se une nada por ellas)`,
    `  ${revisar.slice(0, MUESTRA_IDS).map(({ id }) => `#${id}`).join(", ")}`,
    ...(revisar.length > MUESTRA_IDS ? [`  … y ${revisar.length - MUESTRA_IDS} más`] : []),
  ];
}

function lineasDeFusiones({ fusiones, errores }) {
  const movidas = (fusion) => Object.values(fusion.movidos).reduce((total, n) => total + n, 0);
  return [
    `Fusiones hechas: ${fusiones.length} · fallidas: ${errores.length}`,
    ...fusiones.map((f) => `  #${f.origenId} → #${f.destinoId} (${f.motivo}): fusión ${f.fusionId} · filas movidas: ${movidas(f)}`),
    ...errores.map((e) => `  ERROR #${e.origenId} → #${e.destinoId} (${e.motivo}): ${unaLinea(e.mensaje)}`),
  ];
}

/**
 * El resultado de `ejecutarUnificacion` en texto para la consola: la prueba dice lo que haría y
 * `--aplicar` lo que hizo. `base` es el destino ("host:puerto/base") que se muestra en el encabezado.
 */
export function textoDelInforme(resultado, { base = "" } = {}) {
  const { aplicar, fichasVigentes, canales, normalizado, plan, fichas, fusiones, errores } = resultado;
  const encabezado = aplicar ? `APLICADO en la base${base ? ` ${base}` : ""}.` : `PRUEBA: no se escribió nada en la base${base ? ` (${base})` : ""}.`;

  const secciones = [
    [encabezado, `Fichas vigentes: ${fichasVigentes}`],
    lineasDeCanales(canales, aplicar),
    lineasDeNormalizacion(normalizado, aplicar),
    lineasDeGrupos(plan, fichas),
    lineasDeDudosos(plan, fichas),
    lineasDeRevisar(plan),
    ...(aplicar ? [lineasDeFusiones({ fusiones, errores })] : []),
  ];
  return secciones.map((lineas) => lineas.join("\n")).join("\n\n");
}

const dosDigitos = (n) => String(n).padStart(2, "0");

// "unificacion-clientes-20261018-210509.json": la fecha y la hora locales, como los demás respaldos.
export function nombreDelInforme(ahora = new Date()) {
  const fecha = `${ahora.getFullYear()}${dosDigitos(ahora.getMonth() + 1)}${dosDigitos(ahora.getDate())}`;
  const hora = `${dosDigitos(ahora.getHours())}${dosDigitos(ahora.getMinutes())}${dosDigitos(ahora.getSeconds())}`;
  return `unificacion-clientes-${fecha}-${hora}.json`;
}

/**
 * Guarda el resultado de `--aplicar` como JSON en `carpeta` (la crea si falta) y devuelve la ruta.
 * Nunca pisa un informe que ya existe: es el registro de lo que se hizo. Trae nombres, teléfonos y DNI,
 * así que se escribe con permisos 0o600 (solo quien lo corrió; en Windows el modo no se aplica).
 */
export function guardarInforme(resultado, { carpeta, base = "", ahora = new Date() }) {
  const ruta = join(carpeta, nombreDelInforme(ahora));
  mkdirSync(carpeta, { recursive: true });
  writeFileSync(ruta, JSON.stringify({ generado: ahora.toISOString(), base, ...resultado }, null, 2), { flag: "wx", mode: 0o600 });
  return ruta;
}
