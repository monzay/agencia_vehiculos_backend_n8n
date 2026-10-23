// Seed de DEMO: genera ~1000 consultas (sesiones) con clientes, mensajes,
// vehículos usados/venta y financiaciones para simular el panel en producción.
//
// Uso:    node prisma/seed/seed-demo.mjs
// Limpiar: node prisma/seed/seed-demo.mjs --wipe
//
// Solo corre contra la base local: se niega a cualquier otra, sin override.
//
// Todos los clientes generados llevan un email @seed.demo (el mismo dominio de los
// asesores de demo), así el wipe borra SOLO lo generado acá (los datos reales no se
// tocan). Los de mensajería tienen además su fila en cliente_canales, como los del bot.

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { baseAutorizada, destinoDeLaBase } from "../../src/lib/base-local.js";

// Genera ~1000 consultas y con --wipe borra: solo contra la base local, sin override. El chequeo va antes de
// crear el cliente de Prisma, que es quien lee el .env: se lee acá para poder mirar la URL.
const ARCHIVO_ENV = fileURLToPath(new URL("../../.env", import.meta.url));
if (existsSync(ARCHIVO_ENV)) process.loadEnvFile(ARCHIVO_ENV);
const urlBase = process.env.DATABASE_URL;
if (!baseAutorizada(urlBase)) {
  console.error(
    `DATABASE_URL apunta a ${destinoDeLaBase(urlBase)}, que no es una base local.\n` +
      "Este seed escribe datos de demo (y con --wipe borra): solo corre contra la base local."
  );
  process.exit(1);
}

const prisma = new PrismaClient();

const TOTAL_SESIONES = 1000;
const SEED_PREFIX = "seed_";
const DOMINIO_EMAIL = "seed.demo";
const SEMBRADOS = { email: { endsWith: `@${DOMINIO_EMAIL}` } };
const CANALES_MENSAJERIA = ["whatsapp", "facebook", "instagram"];

// ---------------------------------------------------------------------------
// Utilidades de azar
// ---------------------------------------------------------------------------
const rand = (n) => Math.floor(Math.random() * n);
const pick = (arr) => arr[rand(arr.length)];
const chance = (p) => Math.random() < p;
const entre = (min, max) => min + rand(max - min + 1);

// Fecha aleatoria dentro de los últimos `dias` días, en horario comercial.
function fechaReciente(dias = 60) {
  const d = new Date();
  // Sesgo hacia lo reciente: cuadrado del random concentra cerca de hoy.
  d.setDate(d.getDate() - Math.floor(Math.random() ** 2 * dias));
  d.setHours(entre(9, 20), entre(0, 59), entre(0, 59), 0);
  return d;
}

const minutosDespues = (fecha, min) => new Date(fecha.getTime() + min * 60000);

// ---------------------------------------------------------------------------
// Bancos de datos fake (nombres/vehículos argentinos)
// ---------------------------------------------------------------------------
const NOMBRES = [
  "Juan", "María", "Carlos", "Ana", "Luis", "Laura", "Jorge", "Sofía", "Diego",
  "Valentina", "Martín", "Camila", "Pablo", "Lucía", "Sergio", "Florencia",
  "Gustavo", "Carla", "Ricardo", "Julieta", "Fernando", "Rocío", "Marcelo",
  "Agustina", "Damián", "Micaela", "Hernán", "Paula", "Ezequiel", "Daniela",
  "Nicolás", "Brenda", "Matías", "Celeste", "Facundo", "Yamila", "Leandro",
  "Antonella", "Cristian", "Marina", "Gonzalo", "Vanesa", "Emiliano", "Silvia",
  "Franco", "Natalia", "Ramiro", "Gabriela", "Iván", "Verónica",
];
const APELLIDOS = [
  "González", "Rodríguez", "Gómez", "Fernández", "López", "Díaz", "Martínez",
  "Pérez", "García", "Sánchez", "Romero", "Sosa", "Torres", "Álvarez", "Ruiz",
  "Ramírez", "Flores", "Benítez", "Acosta", "Medina", "Herrera", "Aguirre",
  "Giménez", "Molina", "Castro", "Rojas", "Ortiz", "Silva", "Núñez", "Luna",
  "Cabrera", "Ríos", "Morales", "Godoy", "Domínguez", "Peralta", "Vega",
  "Carrizo", "Quiroga", "Villalba", "Ledesma", "Bustos", "Ponce", "Vera",
];
const CARACTERISTICAS = ["3050", "3510", "3410", "3520", "3540", "3560", "3624", "3644", "3715", "3731"];

const nombreCompleto = () => `${pick(NOMBRES)} ${pick(APELLIDOS)}`;
const telefonoAr = () => `+54 9 ${pick(CARACTERISTICAS)} ${entre(40, 69)}${entre(1000, 9999)}`;
const dniAr = () => String(entre(20000000, 45999999));

// Vehículos que el cliente entrega como usado o quiere vender/consignar.
const VEHICULOS_CLIENTE = [
  { marca: "Volkswagen", modelo: "Gol Trend" }, { marca: "Chevrolet", modelo: "Corsa Classic" },
  { marca: "Fiat", modelo: "Palio 1.4" }, { marca: "Ford", modelo: "Fiesta Kinetic" },
  { marca: "Renault", modelo: "Clio Mío" }, { marca: "Peugeot", modelo: "208 Allure" },
  { marca: "Fiat", modelo: "Uno Fire" }, { marca: "Chevrolet", modelo: "Onix LT" },
  { marca: "Toyota", modelo: "Etios XS" }, { marca: "Ford", modelo: "EcoSport 1.6" },
  { marca: "Renault", modelo: "Sandero Stepway" }, { marca: "Volkswagen", modelo: "Suran Comfortline" },
  { marca: "Honda", modelo: "Wave 110" }, { marca: "Motomel", modelo: "Blitz 110" },
  { marca: "Fiat", modelo: "Siena EL 1.4" }, { marca: "Chevrolet", modelo: "Aveo LS" },
];

const SALUDOS = [
  "Hola, buenas!", "Hola qué tal", "Buenas tardes", "Hola, cómo andan?",
  "Buen día!", "Hola, quería hacer una consulta", "Buenas!",
];
const CONSULTAS_AUTO = [
  "Está disponible todavía?", "Quería saber el precio del que publicaron",
  "Me interesa el que vi en Marketplace", "Qué tal está de motor?",
  "Se puede ver hoy?", "Aceptan permuta?", "Tiene todos los papeles al día?",
  "Cuánto tiene de kilometraje?", "Es el precio final o negociable?",
  "Vi la publicación en Instagram, sigue en venta?",
];
const CONSULTAS_GENERALES = [
  "Qué autos tienen disponibles?", "Tienen algo en menos de 10 millones?",
  "Hacen planes de financiación?", "Dónde están ubicados?",
  "Hasta qué hora atienden?", "Tienen motos también?",
  "Trabajan con permutas?", "Quería info de los 0km",
];
const RESPUESTAS_PAGO_CONTADO = ["Contado", "Al contado", "Efectivo", "Todo junto, contado"];
const RESPUESTAS_PAGO_FINANCIADO = ["Financiado", "En cuotas", "Con financiación", "Cuotas si se puede"];
const ANTICIPOS = ["500.000", "1.000.000", "2.000.000", "3.000.000", "1.500.000", "el 50%", "la mitad", "4 millones"];
const DECISOR_CON = ["mi señora", "mi marido", "mi viejo", "mi hermano", "mi socio", "la familia"];
const KMS_DECLARADOS = ["45.000", "60000", "80 mil", "120.000", "150000", "98.000", "unos 70 mil", "200.000"];
const PRECIOS_VENTA = ["7.000.000", "8.500.000", "9.000.000", "10.500.000", "12.000.000", "6.500.000", "a convenir", "13 millones"];

const ASESORES = [
  { nombre: "Marcos Ibáñez", telefono: "+54 9 3050 551234" },
  { nombre: "Paula Ferreyra", telefono: "+54 9 3050 662345" },
  { nombre: "Andrés Coronel", telefono: "+54 9 3510 773456" },
  { nombre: "Lucía Maidana", telefono: "+54 9 3410 884567" },
];

// ---------------------------------------------------------------------------
// Wipe: borra solo lo generado por este seed
// ---------------------------------------------------------------------------
async function wipe() {
  const clientes = await prisma.clientes.findMany({
    where: SEMBRADOS,
    select: { id: true },
  });
  const ids = clientes.map((c) => c.id);
  if (!ids.length) {
    console.log("No hay datos de seed para borrar.");
    return;
  }
  const sesiones = await prisma.chat_estado.findMany({
    where: { cliente_id: { in: ids } },
    select: { id: true },
  });
  const sesionIds = sesiones.map((s) => s.id);

  // Orden: hijos → padres (FKs sin cascade en varias tablas).
  await prisma.vehiculo_cliente.deleteMany({ where: { sesion_id: { in: sesionIds } } });
  await prisma.financiacion_pagos.deleteMany({ where: { financiaciones: { cliente_id: { in: ids } } } });
  await prisma.financiaciones.deleteMany({ where: { cliente_id: { in: ids } } });
  await prisma.alertas_stock.deleteMany({ where: { cliente_id: { in: ids } } });
  await prisma.historial_mensajes.deleteMany({ where: { cliente_id: { in: ids } } });
  await prisma.chat_estado.deleteMany({ where: { cliente_id: { in: ids } } });
  await prisma.cliente_canales.deleteMany({ where: { cliente_id: { in: ids } } });
  await prisma.clientes.deleteMany({ where: { id: { in: ids } } });
  await prisma.vendedores.deleteMany({ where: { email: { endsWith: "@seed.demo" } } });
  console.log(`Borrado: ${ids.length} clientes, ${sesionIds.length} sesiones y sus datos asociados.`);
}

// ---------------------------------------------------------------------------
// Generadores
// ---------------------------------------------------------------------------
async function crearAsesores() {
  const existentes = await prisma.vendedores.findMany({ where: { deleted_at: null }, select: { id: true } });
  if (existentes.length) return existentes.map((v) => v.id);

  await prisma.vendedores.createMany({
    data: ASESORES.map((a, i) => ({
      nombre: a.nombre,
      telefono: a.telefono,
      email: `asesor${i + 1}@seed.demo`, // marca para el wipe
      activo: true,
      recibe_consultas: true,
    })),
  });
  const creados = await prisma.vendedores.findMany({
    where: { email: { endsWith: "@seed.demo" } },
    select: { id: true },
  });
  return creados.map((v) => v.id);
}

// Devuelve `{ cliente, identificador }`: el cliente a insertar y, para los de mensajería, el
// identificador de su fila en cliente_canales. El email lleva ese mismo texto, que es único.
function generarClientes(cantidad, dnisOcupados) {
  const canales = () => {
    const r = Math.random();
    if (r < 0.72) return "whatsapp";
    if (r < 0.85) return "instagram";
    if (r < 0.95) return "facebook";
    return "web";
  };
  // El DNI es único entre las fichas vigentes (074): ni repetido entre los generados ni contra los que ya hay.
  const dnisUsados = new Set(dnisOcupados);
  const dniLibre = () => {
    let dni = dniAr();
    while (dnisUsados.has(dni)) dni = dniAr();
    dnisUsados.add(dni);
    return dni;
  };
  return Array.from({ length: cantidad }, (_, i) => {
    const nombre = nombreCompleto();
    const canal = canales();
    const telefono = telefonoAr();
    const identificador = `${SEED_PREFIX}${canal}_${Date.now()}_${i}`;
    return {
      cliente: {
        nombre,
        telefono,
        dni: chance(0.35) ? dniLibre() : null,
        email: `${identificador}@${DOMINIO_EMAIL}`,
        canal,
        created_at: fechaReciente(90),
      },
      identificador,
    };
  });
}

// Sesión de COMPRA completa: auto de interés + respuestas del flujo del bot.
function sesionCompra(clienteId, autos, asesorIds, inicio) {
  const auto = pick(autos);
  const clasif = pick(["CALIENTE", "CALIENTE", "TIBIO", "TIBIO", "TIBIO", "FRIO", "FRIO"]);
  const score = { CALIENTE: entre(70, 100), TIBIO: entre(40, 69), FRIO: entre(5, 39) }[clasif];
  const pago = chance(0.55) ? "financiado" : "contado";
  const entregaUsado = chance(0.4);
  const decisor = chance(0.6) ? "solo" : "consulta";
  const atendida = chance(0.45);
  const asesor = chance(0.75) ? pick(asesorIds) : null;

  return {
    sesion: {
      cliente_id: clienteId,
      paso_actual: "handoff",
      score,
      clasificacion: clasif,
      alerta_enviada: clasif === "CALIENTE",
      pago_tipo: pago,
      anticipo: pago === "financiado" ? pick(ANTICIPOS) : null,
      cuotas: pago === "financiado" ? pick([12, 18, 24, 36]) : null,
      credito_ok: pago === "financiado" ? (chance(0.8) ? 1 : 0) : null,
      entrega_usado: entregaUsado,
      decisor,
      decisor_con: decisor === "consulta" ? pick(DECISOR_CON) : null,
      disponibilidad: pick(["esta_semana", "esta_semana", "proximas", "no_sabe"]),
      auto_id: auto.id,
      origen: pick(["marketplace", "instagram", "web", "referido", null]),
      vendedor_id: asesor,
      atendido_at: atendida ? minutosDespues(inicio, entre(30, 600)) : null,
      atendido_por: atendida ? pick(ASESORES).nombre : null,
      nombre_declarado: chance(0.7) ? nombreCompleto() : null,
      sesion_inicio: inicio,
      ultimo_mensaje: minutosDespues(inicio, entre(5, 20)),
      updated_at: minutosDespues(inicio, entre(5, 20)),
    },
    usado: entregaUsado
      ? { contexto: "trade_in", ...pick(VEHICULOS_CLIENTE), anio: entre(2005, 2019), kms: pick(KMS_DECLARADOS) }
      : null,
    auto,
    tipo: "compra",
  };
}

// Sesión de compra ABANDONADA a mitad del flujo.
function sesionAbandonada(clienteId, autos, inicio) {
  const auto = pick(autos);
  const paso = pick(["q_pago", "q_anticipo", "q_usado", "q_decisor", "q_agenda", "q_nombre"]);
  const llegoAPago = ["q_anticipo", "q_usado", "q_decisor", "q_agenda", "q_nombre"].includes(paso);
  const pago = llegoAPago ? (chance(0.5) ? "financiado" : "contado") : null;
  const abandono = minutosDespues(inicio, entre(3, 12));

  return {
    sesion: {
      cliente_id: clienteId,
      paso_actual: paso,
      score: entre(5, 35),
      clasificacion: chance(0.5) ? "FRIO" : null,
      pago_tipo: pago,
      anticipo: pago === "financiado" && paso !== "q_anticipo" ? pick(ANTICIPOS) : null,
      auto_id: auto.id,
      origen: pick(["marketplace", "instagram", null]),
      abandonado_en: abandono,
      abandono_paso: paso,
      sesion_inicio: inicio,
      ultimo_mensaje: abandono,
      updated_at: abandono,
    },
    usado: null,
    auto,
    tipo: "abandonada",
  };
}

// Sesión de VENTA/CONSIGNACIÓN (completa si llegó a handoff).
function sesionVenta(clienteId, inicio, completa) {
  const vehiculo = pick(VEHICULOS_CLIENTE);
  const modalidad = chance(0.6) ? "venta" : "consignacion";
  const fin = minutosDespues(inicio, entre(6, 18));
  return {
    sesion: {
      cliente_id: clienteId,
      paso_actual: completa ? "handoff" : pick(["vender_modelo", "vender_anio", "vender_km", "vender_precio"]),
      score: 0,
      tipo_lead: "venta",
      modalidad_venta: modalidad,
      nombre_declarado: completa ? nombreCompleto() : null,
      ...(completa ? {} : { abandonado_en: fin, abandono_paso: "vender_km" }),
      sesion_inicio: inicio,
      ultimo_mensaje: fin,
      updated_at: fin,
    },
    venta: {
      contexto: "venta",
      ...vehiculo,
      anio: entre(2008, 2022),
      kms: completa ? pick(KMS_DECLARADOS) : null,
      precio_pedido: completa ? pick(PRECIOS_VENTA) : null,
    },
    tipo: "venta",
  };
}

// Consulta GENERAL: solo preguntó algo suelto (clasificación NULL, score bajo).
function sesionGeneral(clienteId, inicio) {
  return {
    sesion: {
      cliente_id: clienteId,
      paso_actual: pick(["gw_router", "menu"]),
      score: entre(1, 4), // >0 para que el panel la liste como "Consulta general"
      sesion_inicio: inicio,
      ultimo_mensaje: minutosDespues(inicio, entre(1, 5)),
      updated_at: minutosDespues(inicio, entre(1, 5)),
    },
    tipo: "general",
  };
}

// Mensajes del chat coherentes con el tipo de sesión.
function mensajesDe(clienteId, gen) {
  const t0 = gen.sesion.sesion_inicio;
  const msgs = [];
  let min = 0;
  const entrante = (mensaje, paso) =>
    msgs.push({ cliente_id: clienteId, direccion: "entrante", mensaje, paso_nodo: paso, created_at: minutosDespues(t0, min++) });
  const saliente = (mensaje) =>
    msgs.push({ cliente_id: clienteId, direccion: "saliente", mensaje, paso_nodo: "bot", created_at: minutosDespues(t0, min++) });

  entrante(pick(SALUDOS), "inicio");
  saliente("¡Hola! Gracias por escribirnos 😊 ¿En qué podemos ayudarte?");

  if (gen.tipo === "general") {
    entrante(pick(CONSULTAS_GENERALES), "gw_router");
    saliente("Te paso las opciones de nuestro menú 👇");
    return msgs;
  }

  if (gen.tipo === "venta") {
    entrante("Quiero vender mi auto", "gw_router");
    saliente("¡Genial! ¿Preferís venta directa o consignación?");
    entrante(gen.sesion.modalidad_venta === "consignacion" ? "Consignación" : "Venta directa", "vender_modalidad");
    entrante(gen.venta.marca, "vender_marca");
    entrante(gen.venta.modelo, "vender_modelo");
    if (gen.venta.anio) entrante(String(gen.venta.anio), "vender_anio");
    if (gen.venta.kms) entrante(gen.venta.kms, "vender_km");
    if (gen.venta.precio_pedido) entrante(gen.venta.precio_pedido, "vender_precio");
    if (gen.sesion.nombre_declarado) entrante(gen.sesion.nombre_declarado, "vender_nombre");
    return msgs;
  }

  // Compra (completa o abandonada)
  entrante(pick(CONSULTAS_AUTO), "gw_router");
  saliente(`¡Sí! El ${gen.auto.marca} ${gen.auto.modelo} está disponible. ¿Cómo pensás pagarlo?`);
  const s = gen.sesion;
  if (s.pago_tipo)
    entrante(pick(s.pago_tipo === "contado" ? RESPUESTAS_PAGO_CONTADO : RESPUESTAS_PAGO_FINANCIADO), "q_pago");
  if (s.anticipo) entrante(s.anticipo, "q_anticipo");
  if (s.entrega_usado != null) entrante(s.entrega_usado ? "Sí, entrego un usado" : "No", "q_usado");
  if (gen.usado) {
    entrante(gen.usado.marca, "q_usado_marca");
    entrante(gen.usado.modelo, "q_usado_modelo");
    entrante(String(gen.usado.anio), "q_usado_anio");
  }
  if (s.decisor) entrante(s.decisor === "solo" ? "Decido yo" : `Lo consulto con ${s.decisor_con}`, "q_decisor");
  if (s.disponibilidad)
    entrante({ esta_semana: "Esta semana puedo", proximas: "En las próximas semanas", no_sabe: "No sé todavía" }[s.disponibilidad], "q_agenda");
  if (s.nombre_declarado) entrante(s.nombre_declarado, "q_nombre");
  return msgs;
}

// Financiaciones activas con sus pagos ya realizados.
function generarFinanciaciones(clienteIds, cantidad) {
  return Array.from({ length: cantidad }, () => {
    const cuotas = pick([6, 12, 12, 18, 24, 24, 36]);
    const pagadas = entre(0, cuotas - 1);
    const inicio = new Date();
    inicio.setMonth(inicio.getMonth() - pagadas);
    return {
      fin: {
        cliente_id: pick(clienteIds),
        cantidad_cuotas: cuotas,
        precio_cuota: entre(150, 900) * 1000,
        dia_pago: entre(1, 28),
        telefono_alt: chance(0.2) ? telefonoAr() : null,
        activo: true,
        created_at: inicio,
      },
      pagadas,
    };
  });
}

// ---------------------------------------------------------------------------
// Seed principal
// ---------------------------------------------------------------------------
async function seed() {
  const autos = await prisma.autos.findMany({
    where: { deleted_at: null, disponible: true },
    select: { id: true, marca: true, modelo: true },
  });
  if (!autos.length) throw new Error("No hay autos en la base: cargá stock antes de correr el seed.");

  const asesorIds = await crearAsesores();
  console.log(`Asesores: ${asesorIds.length}`);

  // 1) Clientes (algunos tendrán más de una sesión → ~1000 sesiones totales)
  const CANT_CLIENTES = 850;
  const dnisOcupados = (await prisma.clientes.findMany({ where: { dni: { not: null } }, select: { dni: true } })).map((c) => c.dni);
  const generados = generarClientes(CANT_CLIENTES, dnisOcupados);
  await prisma.clientes.createMany({ data: generados.map((g) => g.cliente) });
  const clientes = await prisma.clientes.findMany({
    where: SEMBRADOS,
    select: { id: true, email: true },
    orderBy: { id: "asc" },
  });
  const idPorEmail = new Map(clientes.map((c) => [c.email, c.id]));
  await prisma.cliente_canales.createMany({
    data: generados
      .filter((g) => CANALES_MENSAJERIA.includes(g.cliente.canal))
      .map((g) => ({ cliente_id: idPorEmail.get(g.cliente.email), canal: g.cliente.canal, identificador: g.identificador })),
  });
  const clienteIds = clientes.map((c) => c.id);
  console.log(`Clientes creados: ${clienteIds.length}`);

  // 2) Generar las sesiones en memoria con su mezcla realista
  const generadas = [];
  for (let i = 0; i < TOTAL_SESIONES; i++) {
    // Los primeros CANT_CLIENTES tienen 1 sesión; el resto repite cliente.
    const clienteId = i < clienteIds.length ? clienteIds[i] : pick(clienteIds);
    const inicio = fechaReciente(60);
    const r = Math.random();
    if (r < 0.55) generadas.push(sesionCompra(clienteId, autos, asesorIds, inicio));
    else if (r < 0.70) generadas.push(sesionAbandonada(clienteId, autos, inicio));
    else if (r < 0.82) generadas.push(sesionVenta(clienteId, inicio, true));
    else if (r < 0.85) generadas.push(sesionVenta(clienteId, inicio, false));
    else generadas.push(sesionGeneral(clienteId, inicio));
  }

  // 3) Insertar sesiones y recuperar ids (createMany inserta en orden en MySQL)
  await prisma.chat_estado.createMany({ data: generadas.map((g) => g.sesion) });
  const sesiones = await prisma.chat_estado.findMany({
    where: { cliente_id: { in: clienteIds } },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  generadas.forEach((g, i) => (g.sesionId = sesiones[i].id));
  console.log(`Sesiones creadas: ${sesiones.length}`);

  // 4) Vehículos del cliente (usado que entrega / vehículo que vende)
  const vehiculos = [];
  for (const g of generadas) {
    if (g.usado) vehiculos.push({ sesion_id: g.sesionId, ...g.usado });
    if (g.venta) vehiculos.push({ sesion_id: g.sesionId, ...g.venta });
  }
  await prisma.vehiculo_cliente.createMany({ data: vehiculos });
  console.log(`Vehículos de cliente: ${vehiculos.length}`);

  // 5) Historial de mensajes (en tandas para no armar un INSERT gigante)
  const mensajes = generadas.flatMap((g) => mensajesDe(g.sesion.cliente_id, g));
  for (let i = 0; i < mensajes.length; i += 1000) {
    await prisma.historial_mensajes.createMany({ data: mensajes.slice(i, i + 1000) });
  }
  console.log(`Mensajes: ${mensajes.length}`);

  // 6) Financiaciones con pagos parciales
  const fins = generarFinanciaciones(clienteIds, 90);
  await prisma.financiaciones.createMany({ data: fins.map((f) => f.fin) });
  const finRows = await prisma.financiaciones.findMany({
    where: { cliente_id: { in: clienteIds } },
    select: { id: true, created_at: true },
    orderBy: { id: "asc" },
  });
  const pagos = [];
  finRows.forEach((row, i) => {
    for (let n = 1; n <= fins[i].pagadas; n++) {
      const pagadoEn = new Date(row.created_at);
      pagadoEn.setMonth(pagadoEn.getMonth() + n);
      pagos.push({ financiacion_id: row.id, numero: n, pagado_en: pagadoEn });
    }
  });
  await prisma.financiacion_pagos.createMany({ data: pagos });
  console.log(`Financiaciones: ${finRows.length} (pagos registrados: ${pagos.length})`);

  // 7) Alertas de stock (clientes que piden avisos)
  await prisma.alertas_stock.createMany({
    data: Array.from({ length: 30 }, () => ({
      cliente_id: pick(clienteIds),
      presupuesto: entre(5, 20) * 1000000,
      uso: pick(["trabajo", "familia", "primer auto", "reparto", null]),
      tipo: pick(["km", "usado", "cualquiera"]),
    })),
  });
  console.log("Alertas de stock: 30");

  // Resumen por tipo
  const porTipo = generadas.reduce((acc, g) => ((acc[g.tipo] = (acc[g.tipo] ?? 0) + 1), acc), {});
  console.log("Mezcla de sesiones:", porTipo);
}

// ---------------------------------------------------------------------------
const esWipe = process.argv.includes("--wipe");
try {
  if (esWipe) await wipe();
  else await seed();
} finally {
  await prisma.$disconnect();
}
