import { z } from "zod";
import { TIPOS_VEHICULO, normalizarTipoVehiculo } from "../lib/tipos-vehiculo.js";
import { whereDisponible, selectFicha, autoPublico, fichaConDescripcion, fotosPublicas } from "./auto-publico.js";
import { COMBUSTIBLES } from "../lib/combustibles.js";
import { puntaje, clasificar, pendientes, correspondePedirNombre } from "./calificacion.js";
import { nombreSeguro } from "./nombre-dicho.js";
import { horarioDelDia } from "./instrucciones.js";
import { linkDelCatalogo, codigoDeAuto } from "./origen-web.js";
import { SIN_VERIFICACION } from "../credito/verificacion.js";

// Las herramientas del agente vendedor. Cada una es un "formulario" con
// casilleros fijos (zod): la IA solo puede pedir que se ejecute completándolo.
// El backend valida el formulario, ejecuta SU consulta y devuelve el resultado.
//
// El cliente y la sesión NO vienen de la IA: llegan en `ctx` desde el backend
// (identificados por el número de WhatsApp). Así ninguna herramienta puede
// consultar ni tocar datos de otra persona.
//
// ctx = { db, clienteId, sesionId, urlPublica, ahora, cobranza, cambiarAuto, credito }
// `cobranza` = { financiacionId, avisoId } si el número recibió un recordatorio de cuota.
// `credito` = { registrarConsentimiento(acepta), verificar(cuil), estado(sesionId) }: la verificación con el
// BCRA, atada a este cliente por el backend (src/credito/verificacion.js).

const MAX_AUTOS = 5;
const MAX_CANDIDATOS_SIMILARES = 20;
const MARGEN_SIMILAR = 0.25;
const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const DESFASE_AR_MS = 3 * 3_600_000;

const MAX_INTENTOS_DNI = 3;
const VENTANA_INTENTOS_MS = 24 * 3_600_000;

const ref = z
  .string()
  .trim()
  .min(1)
  .max(30)
  .describe("Código del auto: solo el código, sin # ni la palabra REF (para 'REF #13' es 13). Lo tenés en el contexto o en el resultado de una búsqueda.");

// Texto libre que dicta el cliente y que después se ve en el panel: sin HTML ni
// links, para que nadie meta contenido malicioso a través del chat.
const textoLibre = (max, min = 1) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((v) => !/[<>]|https?:\/\/|www\.|\b[\w-]+\.(com|ar|me|ly|net|org|io|link)\b/i.test(v), "No se admiten HTML ni links.");

// Los autos viejos sin tipo cargado cuentan como "auto".
const filtroTipo = (tipo) => (tipo === "auto" ? { OR: [{ tipo_vehiculo: "auto" }, { tipo_vehiculo: null }] } : { tipo_vehiculo: tipo });

// Un auto "nafta_gnc" anda con los dos: también cumple al buscar nafta o GNC.
const COMBUSTIBLES_QUE_CUMPLEN = Object.freeze({
  nafta: ["nafta", "nafta_gnc"],
  gnc: ["gnc", "nafta_gnc"],
  diesel: ["diesel"],
  nafta_gnc: ["nafta_gnc"],
});

// Un filtro por cada dato que el cliente dio. Los que usan OR van juntos en AND para que no se pisen.
function whereDeBusqueda(f) {
  const condiciones = [
    f.tipo && filtroTipo(f.tipo),
    f.modelo && { OR: [{ modelo: { contains: f.modelo } }, { version: { contains: f.modelo } }] },
    f.presupuesto_contado_max && {
      OR: [{ precio_contado: { lte: f.presupuesto_contado_max } }, { precio_contado: null, precio: { lte: f.presupuesto_contado_max } }],
    },
  ].filter(Boolean);
  const anio = { ...(f.anio_desde && { gte: f.anio_desde }), ...(f.anio_hasta && { lte: f.anio_hasta }) };
  return {
    ...whereDisponible(),
    ...(f.condicion && { tipo: f.condicion === "0km" ? "km" : "usado" }),
    ...(f.marca && { marca: { contains: f.marca } }),
    ...(f.combustible && { combustible: { in: COMBUSTIBLES_QUE_CUMPLEN[f.combustible] } }),
    ...(f.presupuesto_max && { precio: { lte: f.presupuesto_max } }),
    ...(Object.keys(anio).length > 0 && { anio }),
    ...(f.km_max && { kms: { lte: f.km_max } }),
    ...(condiciones.length > 0 && { AND: condiciones }),
  };
}

// Un auto pausado o sin publicar no existe para el cliente. Uno vendido sí se
// informa, para poder ofrecerle parecidos.
const visibleParaElCliente = (auto) => Boolean(auto && (auto.disponible || auto.vendido_at));

const fechaAR = (ahora) => new Date(ahora.getTime() - DESFASE_AR_MS);
const iso = (anio, mes, dia) => `${anio}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;

function proximoVencimiento(diaPago, ahora) {
  const hoy = fechaAR(ahora);
  let anio = hoy.getUTCFullYear();
  let mes = hoy.getUTCMonth();
  if (hoy.getUTCDate() > diaPago) {
    mes += 1;
    if (mes > 11) {
      mes = 0;
      anio += 1;
    }
  }
  const ultimoDia = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
  return iso(anio, mes, Math.min(diaPago, ultimoDia));
}

function requiereSesion(ctx) {
  if (!ctx.sesionId) throw new Error("Falta la sesión del cliente.");
}

// Lo que dicta el cliente vuelve al contexto del agente: va en una sola línea, así
// no puede armar renglones que parezcan instrucciones o estado del recorrido.
const unaLinea = (v) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f\s]+/g, " ").trim() : v);

// Solo lo que el cliente dijo ahora (sin null): corregir un dato no borra los otros.
const sinNulos = (objeto) =>
  Object.fromEntries(
    Object.entries(objeto)
      .filter(([, v]) => v !== null && v !== undefined)
      .map(([k, v]) => [k, unaLinea(v)])
  );

// El código que mandó la IA, tal cual o limpio ("#13" -> "13"), el que exista como ref.
// Primero el exacto: un ref que existe tal cual nunca se reinterpreta. Mira si existe,
// no si está a la venta (por eso no filtra por deleted_at). Devuelve null si ninguno existe.
async function refExistente(db, codigo) {
  const exacto = String(codigo ?? "").trim();
  for (const candidato of new Set([exacto, codigoDeAuto(codigo)].filter(Boolean))) {
    const auto = await db.autos.findFirst({ where: { ref: candidato }, select: { id: true } });
    if (auto) return candidato;
  }
  return null;
}

// Un código mal escrito no es un auto que se fue: que la IA no se lo diga al cliente así.
const codigoInexistente = (codigo) => ({
  codigo_inexistente: true,
  motivo: `No hay ningún auto con el código "${codigo}". No le digas al cliente que el auto no está disponible: usá el código del auto de esta consulta (está en el contexto) o buscalo con buscar_autos.`,
});

// El auto de interés se toma solo si está a la venta; un código inventado o un auto
// fuera de venta no se guarda y se le avisa a la IA.
async function autoDeInteres(db, codigo) {
  if (!codigo) return { autoId: null };
  const refResuelto = await refExistente(db, codigo);
  if (!refResuelto) return { autoId: null, aviso: `No se guardó el auto de interés: no hay ningún auto con el código "${codigo}".` };
  const auto = await db.autos.findFirst({ where: { ...whereDisponible(), ref: refResuelto }, select: { id: true } });
  if (!auto) return { autoId: null, aviso: "No se guardó el auto de interés: ese auto no está a la venta." };
  return { autoId: auto.id };
}

// Si el cliente se interesa en otro auto, la misma consulta cambia de auto y avisa al
// asesor (`ctx.cambiarAuto`, lo hace el backend); sus respuestas van a esa consulta.
async function consultaDelAuto(ctx, autoId) {
  if (!autoId || !ctx.cambiarAuto) return ctx.sesionId;
  const actual = await ctx.db.chat_estado.findUnique({ where: { id: ctx.sesionId }, select: { auto_id: true } });
  if (actual?.auto_id == null || actual.auto_id === autoId) return ctx.sesionId;
  return ctx.cambiarAuto(ctx.sesionId, autoId);
}

// Con la visita acordada, el vendedor queda avisado para esperarlo con el auto listo.
// Si ya estaba avisado por otro motivo (una derivación), no se pisa.
function cambiosDeSesion(input, autoId, momento, yaAvisado) {
  const aviso = yaAvisado
    ? {}
    : { requiere_vendedor: true, requiere_vendedor_motivo: `Visita propuesta: ${unaLinea(input.visita_propuesta)}`.slice(0, 120), requiere_vendedor_at: momento };
  const visita = input.visita_propuesta ? { visita_propuesta: input.visita_propuesta, visita_propuesta_at: momento, ...aviso } : {};
  return sinNulos({
    auto_id: autoId,
    pago_tipo: input.pago_tipo,
    anticipo: input.anticipo,
    credito_ok: input.tiene_recibo_o_garante == null ? null : input.tiene_recibo_o_garante ? 1 : 0,
    entrega_usado: input.entrega_usado,
    decisor: input.decisor,
    decisor_con: input.decisor_con,
    disponibilidad: input.disponibilidad,
    ...visita,
  });
}

const PRECIO_NO_SABE = "No sabe";

// Hay una sola fila de usado por sesión (índice único): si estaba archivada se
// reactiva en vez de crear otra. Devuelve el usado como quedó.
async function guardarUsado(db, sesionId, input, momento) {
  const precio = input.usado_precio_pedido != null ? String(input.usado_precio_pedido) : input.usado_precio_no_sabe ? PRECIO_NO_SABE : null;
  const datos = sinNulos({
    marca: input.usado_marca,
    modelo: input.usado_modelo,
    anio: input.usado_anio,
    kms: input.usado_kms == null ? null : String(input.usado_kms),
    detalles: input.usado_detalles,
    precio_pedido: precio,
  });
  const existente = await db.vehiculo_cliente.findFirst({ where: { sesion_id: sesionId, contexto: "trade_in" } });
  if (Object.keys(datos).length === 0) return existente?.deleted_at ? null : existente;
  if (existente) {
    await db.vehiculo_cliente.update({ where: { id: existente.id }, data: { ...datos, deleted_at: null, updated_at: momento } });
    return { ...existente, ...datos };
  }
  await db.vehiculo_cliente.create({ data: { sesion_id: sesionId, contexto: "trade_in", ...datos } });
  return datos;
}

// El auto de la consulta en curso (id y precio), o null si todavía no tiene.
async function autoDeLaConsulta(db, sesionId) {
  if (!sesionId) return null;
  const sesion = await db.chat_estado.findUnique({ where: { id: sesionId }, select: { auto_id: true } });
  if (sesion?.auto_id == null) return null;
  return (await db.autos.findUnique({ where: { id: sesion.auto_id }, select: { id: true, precio: true } })) ?? null;
}

const SIGUE_TRAS_NEGAR = "Seguí con el recorrido, sin pedir el CUIL.";
const SIGUE_SI_YA_ESTABA_NEGADO = "Ya estaba registrado: seguí con el recorrido, sin pedir el CUIL.";

const HERRAMIENTAS = [
  {
    nombre: "buscar_autos",
    descripcion:
      "Busca autos disponibles para ofrecer. Nunca devuelve vendidos ni reservados. Usala para cualquier pregunta sobre qué autos hay: filtra por tipo, condición (0km o usado), marca, modelo o versión, combustible, año mínimo y máximo, km máximo, presupuesto máximo (contra el precio de lista) y presupuesto de contado (contra el precio de contado). Completá solo lo que el cliente dijo. Devuelve hasta 5.",
    // No estricta: el modo estricto de Claude admite hasta 16 campos opcionales
    // sumando todas las herramientas, y esta sola tiene 10. Igual se valida con zod.
    estricta: false,
    esquema: z.strictObject({
      tipo: z.enum(TIPOS_VEHICULO).nullish().describe("auto; camioneta (SUV, pick-up o furgón); camion (camión); moto."),
      condicion: z.enum(["0km", "usado"]).nullish().describe("0km o usado."),
      marca: textoLibre(40).nullish().describe("Marca, por ejemplo Toyota."),
      modelo: textoLibre(60).nullish().describe("Modelo o versión, por ejemplo Hilux o SRV."),
      combustible: z.enum(COMBUSTIBLES).nullish().describe("nafta, gnc, nafta_gnc o diesel."),
      anio_desde: z.number().int().min(1950).max(2100).nullish().describe("Año mínimo."),
      anio_hasta: z.number().int().min(1950).max(2100).nullish().describe("Año máximo."),
      km_max: z.number().int().positive().max(2_000_000).nullish().describe("Kilómetros máximos."),
      presupuesto_max: z.number().int().positive().max(10_000_000_000).nullish().describe("Precio de lista máximo en pesos."),
      presupuesto_contado_max: z.number().int().positive().max(10_000_000_000).nullish().describe("Presupuesto máximo en pesos si paga de contado."),
    }),
    async ejecutar(filtros, { db, sesionId }) {
      const conPresupuesto = Boolean(filtros.presupuesto_max || filtros.presupuesto_contado_max);
      // Sin presupuesto y mirando un auto: las otras opciones son las de precio parecido a ese.
      const referencia = conPresupuesto ? null : await autoDeLaConsulta(db, sesionId);
      if (referencia) {
        const candidatos = await db.autos.findMany({
          where: { ...whereDeBusqueda(filtros), id: { not: referencia.id } },
          select: selectFicha(),
          orderBy: { id: "desc" },
          take: MAX_CANDIDATOS_SIMILARES,
        });
        const distancia = (a) => Math.abs(Number(a.precio) - Number(referencia.precio));
        const cercanos = [...candidatos].sort((x, y) => distancia(x) - distancia(y)).slice(0, MAX_AUTOS);
        return { cantidad: cercanos.length, autos: cercanos.map(autoPublico) };
      }
      const autos = await db.autos.findMany({
        where: whereDeBusqueda(filtros),
        select: selectFicha(),
        orderBy: conPresupuesto ? { precio: "desc" } : { id: "desc" },
        take: MAX_AUTOS,
      });
      return { cantidad: autos.length, autos: autos.map(autoPublico) };
    },
  },
  {
    nombre: "buscar_similares",
    descripcion:
      "Busca autos disponibles parecidos a uno dado: mismo tipo y precio dentro de un 25% hacia arriba o abajo, el más cercano primero. Usala cuando el auto que le interesa ya no está, no le alcanza o pide algo parecido.",
    esquema: z.strictObject({ ref }),
    async ejecutar({ ref: codigo }, { db }) {
      const refResuelto = await refExistente(db, codigo);
      if (!refResuelto) return { encontrado: false, ...codigoInexistente(codigo) };
      const referencia = await db.autos.findFirst({ where: { ref: refResuelto, deleted_at: null }, select: selectFicha() });
      if (!visibleParaElCliente(referencia)) return { encontrado: false };

      const precio = Number(referencia.precio);
      const candidatos = await db.autos.findMany({
        where: {
          ...whereDisponible(),
          ...filtroTipo(normalizarTipoVehiculo(referencia.tipo_vehiculo)),
          precio: { gte: Math.round(precio * (1 - MARGEN_SIMILAR)), lte: Math.round(precio * (1 + MARGEN_SIMILAR)) },
          ref: { not: refResuelto },
        },
        select: selectFicha(),
        take: MAX_CANDIDATOS_SIMILARES,
      });
      const cercania = (a) => [Math.abs(Number(a.precio) - precio), Math.abs((a.anio ?? 0) - (referencia.anio ?? 0))];
      const parecidos = [...candidatos]
        .sort((a, b) => {
          const [pa, aa] = cercania(a);
          const [pb, ab] = cercania(b);
          return pa - pb || aa - ab;
        })
        .slice(0, MAX_AUTOS)
        .map(autoPublico);
      return { encontrado: true, referencia: autoPublico(referencia), parecidos };
    },
  },
  {
    nombre: "ver_auto",
    descripcion:
      "Muestra la ficha de un auto por su código: precio de lista, de contado y anticipo, versión, descripción, descuento y promociones vigentes, km, y si está disponible, reservado o vendido. Usala antes de dar cualquier precio.",
    esquema: z.strictObject({ ref }),
    async ejecutar({ ref: codigo }, { db }) {
      const refResuelto = await refExistente(db, codigo);
      if (!refResuelto) return { encontrado: false, ...codigoInexistente(codigo) };
      const auto = await db.autos.findFirst({ where: { ref: refResuelto, deleted_at: null }, select: selectFicha() });
      return visibleParaElCliente(auto) ? { encontrado: true, auto: fichaConDescripcion(auto) } : { encontrado: false };
    },
  },
  {
    nombre: "enviar_fotos_auto",
    descripcion: "Devuelve las fotos de un auto disponible para mandárselas al cliente por WhatsApp.",
    esquema: z.strictObject({ ref }),
    async ejecutar({ ref: codigo }, { db, urlPublica }) {
      const refResuelto = await refExistente(db, codigo);
      if (!refResuelto) return { fotos: [], ...codigoInexistente(codigo) };
      const auto = await db.autos.findFirst({ where: { ...whereDisponible(), ref: refResuelto }, select: { fotos_json: true } });
      if (!auto) return { fotos: [], motivo: "El auto no está disponible." };
      const fotos = fotosPublicas(auto, urlPublica);
      // La ficha web va en el botón "Ver todas las fotos" del mismo mensaje.
      return fotos.length ? { fotos, ref: refResuelto, ficha: linkDelCatalogo(urlPublica, refResuelto) } : { fotos: [], motivo: "Este auto todavía no tiene fotos cargadas." };
    },
  },
  {
    nombre: "mi_financiacion",
    descripcion:
      "Estado de la financiación que el cliente que escribe YA tiene con la agencia: cuotas pagas y pendientes, próximo vencimiento y saldo. Pedile antes los últimos 4 dígitos de su DNI. Si responde bloqueado, derivá a un vendedor. No sirve para consultar a otra persona ni para simular cuotas nuevas.",
    esquema: z.strictObject({
      dni_ultimos: z.string().regex(/^\d{4}$/).describe("Los últimos 4 dígitos del DNI que dio el cliente."),
    }),
    async ejecutar({ dni_ultimos }, { db, clienteId, ahora }) {
      if (!clienteId) return { verificado: false };
      const momento = ahora ?? new Date();

      // Contra la fuerza bruta: con 3 fallos en 24 h ni siquiera se compara.
      const fallidos = await db.verificacion_intentos.count({
        where: { cliente_id: clienteId, ok: false, created_at: { gte: new Date(momento.getTime() - VENTANA_INTENTOS_MS) } },
      });
      if ((Number(fallidos) || 0) >= MAX_INTENTOS_DNI) return { verificado: false, bloqueado: true };

      const cliente = await db.clientes.findUnique({ where: { id: clienteId }, select: { dni: true } });
      const dni = String(cliente?.dni ?? "").replace(/\D/g, "");
      const ok = Boolean(dni) && dni.endsWith(dni_ultimos);
      await db.verificacion_intentos.create({ data: { cliente_id: clienteId, ok, created_at: momento } });
      if (!ok) return { verificado: false };

      const financiaciones = await db.financiaciones.findMany({
        where: { cliente_id: clienteId, deleted_at: null, activo: true },
        // Un pago anulado no es una cuota paga: solo se cuentan los vigentes.
        select: { cantidad_cuotas: true, precio_cuota: true, dia_pago: true, pagos: { where: { deleted_at: null }, select: { numero: true } } },
      });
      return {
        verificado: true,
        financiaciones: financiaciones.map((f) => {
          const pagadas = f.pagos?.length ?? 0;
          const pendientes = Math.max(0, f.cantidad_cuotas - pagadas);
          const valor = Number(f.precio_cuota);
          return {
            cuotas_total: f.cantidad_cuotas,
            cuotas_pagadas: pagadas,
            cuotas_pendientes: pendientes,
            valor_cuota: valor,
            saldo: pendientes * valor,
            dia_de_pago: f.dia_pago,
            proximo_vencimiento: pendientes > 0 ? proximoVencimiento(f.dia_pago, momento) : null,
          };
        }),
      };
    },
  },
  {
    nombre: "horarios_atencion",
    descripcion:
      "Horarios de atención de la agencia, día por día. Un día puede tener dos franjas (por ejemplo de 08:00 a 13:00 y de 16:00 a 21:00): entre ellas la agencia está cerrada. Usala antes de confirmar cuándo puede venir el cliente.",
    esquema: z.strictObject({}),
    async ejecutar(_, { db }) {
      const filas = await db.horarios_atencion.findMany({ orderBy: { dia: "asc" } });
      return {
        horarios: filas.map((h) => ({ dia: DIAS[h.dia], abierto: Boolean(h.abierto), horario: horarioDelDia(h) })),
      };
    },
  },
  {
    nombre: "registrar_calificacion",
    descripcion:
      "Guarda lo que el cliente respondió en el recorrido de venta: auto de interés, forma de pago, anticipo, recibo o garante, el usado que entrega (marca, modelo, año y cuánto pide; km y detalles solo si los contó sin que se los pidas), quién decide y la visita a la agencia. Completá solo lo que el cliente dijo; el resto en null. Llamala cada vez que responda algo nuevo: devuelve lo que todavía falta preguntar.",
    // No estricta: el modo estricto de Claude admite hasta 16 campos opcionales
    // sumando todas las herramientas, y esta sola tiene 16. Igual se valida con zod.
    estricta: false,
    // Puede pasar a la consulta de otro auto: devuelve en qué consulta quedó.
    cambiaConsulta: true,
    esquema: z.strictObject({
      auto_ref: textoLibre(20).nullish().describe("Código del auto que le interesa, sin # ni la palabra REF (para 'REF #13' es 13)."),
      pago_tipo: z.enum(["contado", "financiado"]).nullish(),
      anticipo: textoLibre(40).nullish().describe("Lo que dijo del anticipo, por ejemplo '3 millones'."),
      tiene_recibo_o_garante: z.boolean().nullish(),
      entrega_usado: z.boolean().nullish(),
      usado_marca: textoLibre(60).nullish(),
      usado_modelo: textoLibre(60).nullish(),
      usado_anio: z.number().int().min(1950).max(2100).nullish(),
      usado_kms: z.number().int().min(0).max(2_000_000).nullish(),
      usado_detalles: textoLibre(300).nullish().describe("Estado del usado: choques, service, cubiertas, algo para arreglar."),
      usado_precio_pedido: z.number().int().min(1).max(10_000_000_000).nullish().describe("Cuánto pide por el usado, en pesos."),
      usado_precio_no_sabe: z.boolean().nullish().describe("true si no sabe cuánto pedir por el usado."),
      decisor: z.enum(["solo", "consulta"]).nullish().describe("solo si decide él o ella; consulta si lo consulta con alguien."),
      decisor_con: textoLibre(40).nullish().describe("Con quién lo consulta, por ejemplo 'pareja'."),
      disponibilidad: z.enum(["esta_semana", "proximas", "no_sabe"]).nullish().describe("Cuándo puede venir a la agencia."),
      visita_propuesta: textoLibre(120).nullish().describe("Cuándo acordó venir: un día, una hora, una semana o una fecha, por ejemplo 'sábado a la mañana'."),
      nombre: z.string().max(200).nullish().describe("El nombre que el cliente dijo de sí mismo (el suyo, no el de otra persona que nombre). Solo si lo dijo en la charla; nunca el del perfil."),
    }),
    async ejecutar(input, ctx) {
      requiereSesion(ctx);
      const { db, ahora } = ctx;
      const momento = ahora ?? new Date();
      const { autoId, aviso } = await autoDeInteres(db, input.auto_ref);
      const sesionId = await consultaDelAuto(ctx, autoId);
      const actual = await db.chat_estado.findUnique({
        where: { id: sesionId },
        select: { auto_id: true, pago_tipo: true, anticipo: true, credito_ok: true, entrega_usado: true, decisor: true, disponibilidad: true, visita_propuesta: true, requiere_vendedor: true, nombre_declarado: true, nombre_pedido_at: true, fotos_usado_pedidas_at: true },
      });
      // El nombre lo guarda el callback con el usuario del backend (agente_ia no puede escribirlo); va a la consulta donde quedó.
      const nombre = nombreSeguro(input.nombre);
      const dijoNombre = /\p{L}/u.test(nombre) ? nombre : "";
      if (dijoNombre) await ctx.guardarNombre?.(dijoNombre, sesionId);
      // "Su nombre" figura según la consulta como estaba ANTES de este turno: si la visita se guarda ahora, recién va en el próximo mensaje.
      const pedirNombre = correspondePedirNombre({ sesion: actual, nombreDicho: dijoNombre || actual?.nombre_declarado || ctx.nombreDicho });
      const cambios = cambiosDeSesion(input, autoId, momento, Boolean(actual?.requiere_vendedor));
      const vigente = { ...actual, ...cambios };
      await db.chat_estado.update({
        where: { id: sesionId },
        data: { ...cambios, score: puntaje(vigente), clasificacion: clasificar(vigente), updated_at: momento },
      });
      const usado = await guardarUsado(db, sesionId, input, momento);
      // Las fotos del usado se piden una sola vez por consulta: la primera vez que dice que entrega uno.
      // La marca la escribe el callback con el usuario del backend (agente_ia no escribe `fotos_usado_pedidas_at`).
      const pedirFotosUsado = input.entrega_usado === true && !actual?.fotos_usado_pedidas_at;
      if (pedirFotosUsado) await Promise.resolve(ctx.marcarFotosPedidas?.(sesionId)).catch((err) => console.error("[agente] no se pudo marcar el pedido de fotos del usado:", err?.message));
      // En qué va la verificación crediticia con lo recién anotado; si no se puede leer, sigue sin eso.
      const credito = await ctx.credito?.estado?.(sesionId).catch(() => null);
      return { resultado: { registrado: true, faltan: pendientes(vigente, usado, credito, { pedirNombre }), ...(pedirFotosUsado && { pedir_fotos_usado: true }), ...(aviso && { aviso }) }, sesionId };
    },
  },
  {
    nombre: "registrar_consentimiento",
    descripcion:
      "Guarda que el cliente no quiere pasarle el CUIL para consultar su situación en el BCRA. Usala solo si dice claramente que no quiere pasar el CUIL, con acepta false. Si esquiva la pregunta o no queda claro, no la uses. El sí no se guarda acá: es el CUIL que manda el cliente.",
    // Lo que falla acá puede traer el CUIL en el mensaje: el log lleva solo el código.
    datosPersonales: true,
    esquema: z.strictObject({
      acepta: z.boolean().describe("false: el cliente dijo claramente que no quiere pasar el CUIL."),
    }),
    async ejecutar({ acepta }, { credito }) {
      if (!credito) return { registrado: false, motivo: SIN_VERIFICACION };
      const r = await credito.registrarConsentimiento(acepta);
      if (!r.registrado) return r;
      if (r.repetido) return { ...r, sigue: SIGUE_SI_YA_ESTABA_NEGADO };
      return { ...r, sigue: SIGUE_TRAS_NEGAR };
    },
  },
  {
    nombre: "verificar_situacion_crediticia",
    descripcion:
      "Consulta la situación crediticia del cliente en el BCRA con el CUIL que te pasó. Pasar el CUIL es su autorización: usala apenas el cliente te lo manda. El resultado lo ve el asesor: a vos solo te dice si se hizo. Nunca le digas al cliente si califica o no.",
    datosPersonales: true,
    esquema: z.strictObject({
      cuil: z.string().trim().min(11).max(15).regex(/^[\d\s.-]+$/).describe("El CUIL que dio el cliente: 11 números."),
    }),
    // El semáforo nunca vuelve a la IA: solo si se consultó o por qué no.
    // La consulta va atada a la sesión vigente del turno (puede haber pasado a la de otro auto).
    async ejecutar({ cuil }, { credito, sesionId }) {
      if (!credito) return { consultado: false, motivo: SIN_VERIFICACION };
      return credito.verificar(cuil, sesionId);
    },
  },
  {
    nombre: "derivar_a_vendedor",
    descripcion:
      "Pasa la conversación a un vendedor. Usala si el cliente pide hablar con una persona, quiere negociar el precio o una tasa, reservar o señar un auto, tasar su usado, está enojado, o si no podés resolver lo que pide.",
    esquema: z.strictObject({
      motivo: textoLibre(120, 3).describe("Por qué se deriva, en pocas palabras."),
    }),
    async ejecutar({ motivo }, { db, sesionId, ahora }) {
      requiereSesion({ sesionId });
      await db.chat_estado.update({
        where: { id: sesionId },
        data: { requiere_vendedor: true, requiere_vendedor_motivo: motivo, requiere_vendedor_at: ahora ?? new Date() },
      });
      return { derivado: true };
    },
  },
  {
    nombre: "avisar_administracion",
    descripcion:
      "Le deja un aviso al administrador sobre la cuota del recordatorio que recibió el cliente: si la paga en la agencia o por transferencia, si dice que ya la pagó, si no puede pagar, si es un número equivocado u otra cosa. Usala solo si el contexto dice que le mandamos un recordatorio de pago.",
    esquema: z.strictObject({
      tipo: z.enum(["pagara_en_agencia", "transferencia", "ya_pago", "no_puede_pagar", "numero_equivocado", "otro"]),
      detalle: textoLibre(300).nullish().describe("Lo que dijo el cliente, en pocas palabras (por ejemplo 'paga el viernes')."),
    }),
    // La financiación sale del recordatorio que el backend encontró para este
    // número, nunca de la IA. createMany: el usuario del agente solo puede
    // insertar alertas, no leerlas (create() relee la fila). Lo mismo dos veces
    // para el mismo aviso no se duplica.
    async ejecutar({ tipo, detalle }, { db, cobranza, ahora }) {
      if (!cobranza) return { avisado: false, motivo: "No hay un recordatorio de cuota reciente para este cliente." };
      await db.financiacion_alertas.createMany({
        data: [{ financiacion_id: cobranza.financiacionId, aviso_id: cobranza.avisoId, tipo, detalle: detalle ?? null, created_at: ahora ?? new Date() }],
        skipDuplicates: true,
      });
      return { avisado: true };
    },
  },
];

const POR_NOMBRE = new Map(HERRAMIENTAS.map((h) => [h.nombre, h]));
export const NOMBRES_HERRAMIENTAS = HERRAMIENTAS.map((h) => h.nombre);

// El modo estricto de Claude no acepta límites numéricos ni de largo: se sacan
// del formulario que ve la IA, y el backend los sigue validando con zod.
const LIMITES_NO_ADMITIDOS = new Set(["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "minLength", "maxLength", "pattern"]);

function sinLimites(nodo) {
  if (Array.isArray(nodo)) return nodo.map(sinLimites);
  if (!nodo || typeof nodo !== "object") return nodo;
  return Object.fromEntries(
    Object.entries(nodo)
      .filter(([clave]) => !LIMITES_NO_ADMITIDOS.has(clave) && clave !== "$schema")
      .map(([clave, valor]) => [clave, sinLimites(valor)])
  );
}

// Las definiciones que se mandan a Claude. `strict: true` lo obliga a respetar
// exactamente los casilleros; igual el backend vuelve a validar todo.
export function definicionesParaClaude() {
  return HERRAMIENTAS.map((h) => ({
    name: h.nombre,
    description: h.descripcion,
    input_schema: sinLimites(z.toJSONSchema(h.esquema)),
    strict: h.estricta !== false,
  }));
}

// Del pedido de la IA, el log muestra el valor solo de estos casilleros (códigos y
// filtros de búsqueda); del resto, solo los nombres. Nunca DNI, CUIL ni lo que dicta el cliente.
const CASILLEROS_A_LA_VISTA = ["ref", "auto_ref", "tipo", "presupuesto_max", "anio_desde", "marca"];
// Del resultado, solo estas claves: nada de montos ni datos personales.
const CLAVES_DEL_RESUMEN = ["encontrado", "codigo_inexistente", "cantidad", "registrado", "aviso", "derivado", "avisado", "verificado", "bloqueado"];

function pedidoParaLog(datos) {
  const completos = Object.entries(datos).filter(([, valor]) => valor != null);
  const aLaVista = completos.filter(([nombre]) => CASILLEROS_A_LA_VISTA.includes(nombre));
  const otros = completos.map(([nombre]) => nombre).filter((nombre) => !CASILLEROS_A_LA_VISTA.includes(nombre));
  return { ...Object.fromEntries(aLaVista), ...(otros.length > 0 && { otros }) };
}

function resumenParaLog({ esError, resultado }) {
  const r = resultado ?? {};
  const refs = (r.autos ?? r.parecidos)?.map((a) => a.ref);
  const disponibilidad = (r.auto ?? r.referencia)?.disponibilidad;
  return {
    ...Object.fromEntries(CLAVES_DEL_RESUMEN.filter((clave) => r[clave] !== undefined).map((clave) => [clave, r[clave]])),
    ...(refs && { refs }),
    ...(disponibilidad && { disponibilidad }),
    ...(Array.isArray(r.fotos) && { fotos: r.fotos.length }),
    ...(esError && { error: true }),
  };
}

const sinControl = (texto) => String(texto).replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 60);

function registrarLlamada(ctx, nombre, pedido, respuesta) {
  // El log nunca rompe la respuesta: si falla, solo el mensaje del error (sin el pedido).
  try {
    const linea = `[agente] herramienta ${sinControl(nombre)} (sesión ${ctx.sesionId}) ${JSON.stringify(pedido)} → ${JSON.stringify(resumenParaLog(respuesta))}`;
    (ctx.log ?? console.info)(linea);
  } catch (err) {
    console.error("[agente] no se pudo registrar la llamada a la herramienta:", err?.message);
  }
}

// Ejecuta una herramienta pedida por la IA. Nunca lanza: devuelve
// { esError, resultado } o { esError, error } para mandarle a Claude.
// Cada llamada, válida o no, deja una línea en el log.
// Gancho opcional (el simulador lo usa para ver el resultado entero): nunca rompe la respuesta.
function avisarUso(ctx, nombre, pedido, respuesta) {
  if (typeof ctx.alUsarHerramienta !== "function") return;
  try {
    ctx.alUsarHerramienta({ nombre, pedido, resultado: respuesta.esError ? respuesta.error : respuesta.resultado, esError: Boolean(respuesta.esError) });
  } catch (err) {
    console.error("[agente] falló alUsarHerramienta:", err?.message);
  }
}

export async function ejecutarHerramienta(nombre, entrada, ctx) {
  const herramienta = POR_NOMBRE.get(nombre);
  const validado = herramienta?.esquema.safeParse(entrada ?? {});
  const valido = validado?.success === true;
  const respuesta = valido ? await ejecutarValidada(herramienta, nombre, validado.data, ctx) : respuestaInvalida(nombre, herramienta, validado);
  const pedido = valido ? pedidoParaLog(validado.data) : { campos: Object.keys(entrada ?? {}) };
  registrarLlamada(ctx, nombre, pedido, respuesta);
  avisarUso(ctx, nombre, valido ? validado.data : entrada, respuesta);
  return respuesta;
}

function respuestaInvalida(nombre, herramienta, validado) {
  if (!herramienta) return { esError: true, error: `No existe la herramienta ${nombre}.` };
  const campos = [...new Set(validado.error.issues.map((i) => i.path.join(".") || "formulario"))].join(", ");
  return { esError: true, error: `Datos inválidos en: ${campos}.` };
}

async function ejecutarValidada(herramienta, nombre, datos, ctx) {
  try {
    const salida = await herramienta.ejecutar(datos, ctx);
    if (!herramienta.cambiaConsulta) return { esError: false, resultado: salida };
    // El id de la consulta queda para el orquestador: a la IA no le llega.
    const otraConsulta = salida.sesionId !== ctx.sesionId;
    return { esError: false, resultado: salida.resultado, ...(otraConsulta && { sesionId: salida.sesionId }) };
  } catch (err) {
    const detalle = herramienta.datosPersonales ? err?.code ?? err?.name : err?.message;
    console.error(`[agente] la herramienta ${nombre} falló:`, detalle);
    return { esError: true, error: "No se pudo completar la consulta. Ofrecé derivar a un vendedor." };
  }
}
