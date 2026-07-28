// Seed de datos de prueba coherentes (agencia de autos, Argentina).
// Respeta tipos, enums, FKs, UNIQUE y orden de inserción. Usa Prisma Client
// (parametrizado) y bcrypt para password_hash. "Borrado" = deleted_at.
//
// Ejecutar con DATABASE_URL apuntando a la base destino:
//   DATABASE_URL="mysql://..." node prisma/seed/seed_test_data.mjs

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Helper: fecha relativa en días (negativo = pasado).
const dias = (n) => new Date(Date.now() + n * 86400000);
const hash = (pw) => bcrypt.hashSync(pw, 10);

async function main() {
  console.log("→ Sembrando datos de prueba...");

  // ─────────────────────────────────────────────────────────
  // 1) VENDEDORES (asesores)
  // ─────────────────────────────────────────────────────────
  const vendedoresData = [
    { nombre: "Martín Gómez",     telefono: "+5493814567890", telegram_id: "601234567", email: "martin.gomez@seaautomotores.com",  recibe_consultas: true,  leads_activos: 2 },
    { nombre: "Lucía Fernández",  telefono: "+5493815678901", telegram_id: "601234568", email: "lucia.fernandez@seaautomotores.com", recibe_consultas: true,  leads_activos: 1 },
    { nombre: "Diego Rodríguez",  telefono: "+5493816789012", telegram_id: "601234569", email: "diego.rodriguez@seaautomotores.com", recibe_consultas: true,  leads_activos: 0 },
    { nombre: "Sofía Martínez",   telefono: "+5493817890123", telegram_id: null,          email: "sofia.martinez@seaautomotores.com",  recibe_consultas: false, leads_activos: 0, activo: false },
  ];
  const vendedores = [];
  for (const v of vendedoresData) {
    vendedores.push(await prisma.vendedores.create({ data: v }));
  }
  console.log(`  vendedores: ${vendedores.length}`);

  // ─────────────────────────────────────────────────────────
  // 2) USUARIOS (login) — solo asesores; el admin (admin_unico=1) ya existe.
  // ─────────────────────────────────────────────────────────
  let usuariosCreados = 0;
  for (const v of vendedores) {
    await prisma.usuarios.create({
      data: {
        nombre: v.nombre,
        email: v.email,
        password_hash: hash("Asesor123!"),
        rol: "asesor",
        activo: v.activo !== false,
        // admin_unico es columna GENERADA en la DB (auto: 1 si admin) → no se setea.
        vendedor_id: v.id,
      },
    });
    usuariosCreados++;
  }
  console.log(`  usuarios (asesores): ${usuariosCreados}`);

  // ─────────────────────────────────────────────────────────
  // 3) CLIENTES  — UNIQUE(canal, canal_id)
  // ─────────────────────────────────────────────────────────
  const clientesData = [
    { nombre: "Juan Pérez",       telefono: "+5493811111111", dni: "28111222", email: "juan.perez@gmail.com",     canal: "whatsapp",  canal_id: "5493811111111" },
    { nombre: "María López",      telefono: "+5493812222222", dni: "30222333", email: "maria.lopez@gmail.com",    canal: "whatsapp",  canal_id: "5493812222222" },
    { nombre: "Carlos Díaz",      telefono: "+5493813333333", dni: "27333444", email: null,                        canal: "whatsapp",  canal_id: "5493813333333" },
    { nombre: "Ana Torres",       telefono: null,              dni: null,       email: "ana.torres@hotmail.com",  canal: "instagram", canal_id: "ig_ana_torres" },
    { nombre: "Pedro Sánchez",    telefono: "+5493814000111",  dni: "25444555", email: null,                        canal: "facebook",  canal_id: "fb_10098877" },
    { nombre: "Laura Romero",     telefono: "+5493814000222",  dni: null,       email: "laura.romero@gmail.com",  canal: "web",       canal_id: "web_sess_00187" },
    { nombre: "Jorge Ruiz",       telefono: "+5493814444444",  dni: "31555666", email: null,                        canal: "whatsapp",  canal_id: "5493814444444" },
    { nombre: "Valentina Silva",  telefono: null,              dni: null,       email: null,                        canal: "instagram", canal_id: "ig_valen_silva" },
    { nombre: "Roberto Acosta",   telefono: "+5493815555555",  dni: "24666777", email: "r.acosta@yahoo.com",       canal: "whatsapp",  canal_id: "5493815555555" },
  ];
  const clientes = [];
  for (const c of clientesData) {
    clientes.push(await prisma.clientes.create({ data: c }));
  }
  console.log(`  clientes: ${clientes.length}`);

  // ─────────────────────────────────────────────────────────
  // 4) DESCUENTOS
  // ─────────────────────────────────────────────────────────
  const descuentosData = [
    { nombre: "Contado 10%",              tipo: "porcentaje", valor: "10.00",     fecha_fin: dias(30), activo: true },
    { nombre: "Financiado 5%",            tipo: "porcentaje", valor: "5.00",      fecha_fin: dias(45), activo: true },
    { nombre: "Bonificación $500.000",    tipo: "monto",      valor: "500000.00", fecha_fin: dias(20), activo: true },
    { nombre: "Liquidación usados 15%",   tipo: "porcentaje", valor: "15.00",     fecha_fin: dias(-5), activo: false, deleted_at: dias(-5) },
  ];
  const descuentos = [];
  for (const d of descuentosData) {
    descuentos.push(await prisma.descuentos.create({ data: d }));
  }
  console.log(`  descuentos: ${descuentos.length}`);

  // ─────────────────────────────────────────────────────────
  // 5) PROMOCIONES
  // ─────────────────────────────────────────────────────────
  const promocionesData = [
    { nombre: "Julio 0km",                    descripcion: "Descuento especial en unidades 0km durante todo julio.",            condiciones: "Solo unidades seleccionadas. Stock limitado.",       descuento: "8.00",  descuento_tipo: "porcentaje", fecha_fin: dias(15), activo: true },
    { nombre: "Usados certificados",          descripcion: "Autos usados con garantía e inspección de 100 puntos.",             condiciones: "Sujeto a disponibilidad.",                            descuento: null,     descuento_tipo: null,         fecha_fin: dias(40), activo: true },
    { nombre: "Financiación sin interés",     descripcion: "12 cuotas fijas sin interés para modelos seleccionados.",          condiciones: "Con aprobación crediticia. Anticipo del 40%.",        descuento: null,     descuento_tipo: null,         fecha_fin: dias(25), activo: true },
    { nombre: "Entregá tu usado",             descripcion: "Tomamos tu usado como parte de pago a valor de mercado.",           condiciones: "Tasación en concesionaria.",                          descuento: "300000.00", descuento_tipo: "monto",   fecha_fin: dias(60), activo: true },
  ];
  const promociones = [];
  for (const p of promocionesData) {
    promociones.push(await prisma.promociones.create({ data: p }));
  }
  console.log(`  promociones: ${promociones.length}`);

  // ─────────────────────────────────────────────────────────
  // 6) FINANCIACIONES (+ pagos)
  // ─────────────────────────────────────────────────────────
  const financiacionesData = [
    { cliente: clientes[0], cantidad_cuotas: 24, precio_cuota: "185000.00", dia_pago: 10, pagos: 3 },
    { cliente: clientes[1], cantidad_cuotas: 12, precio_cuota: "260000.00", dia_pago: 5,  pagos: 5 },
    { cliente: clientes[4], cantidad_cuotas: 36, precio_cuota: "140000.00", dia_pago: 15, pagos: 1, telefono_alt: "+5493814999888" },
    { cliente: clientes[6], cantidad_cuotas: 48, precio_cuota: "120000.00", dia_pago: 20, pagos: 0 },
    { cliente: clientes[8], cantidad_cuotas: 18, precio_cuota: "210000.00", dia_pago: 1,  pagos: 2 },
  ];
  let finCount = 0, pagoCount = 0;
  for (const f of financiacionesData) {
    const fin = await prisma.financiaciones.create({
      data: {
        cliente_id: f.cliente.id,
        cantidad_cuotas: f.cantidad_cuotas,
        precio_cuota: f.precio_cuota,
        dia_pago: f.dia_pago,
        telefono_alt: f.telefono_alt ?? null,
        activo: true,
      },
    });
    finCount++;
    // Pagos: números 1..pagos (nunca > cantidad_cuotas), UNIQUE(fin, numero).
    for (let n = 1; n <= Math.min(f.pagos, f.cantidad_cuotas); n++) {
      await prisma.financiacion_pagos.create({
        data: { financiacion_id: fin.id, numero: n, pagado_en: dias(-(f.pagos - n) * 30) },
      });
      pagoCount++;
    }
  }
  console.log(`  financiaciones: ${finCount} | pagos: ${pagoCount}`);

  // ─────────────────────────────────────────────────────────
  // 7) SESIONES (chat_estado) — variedad de clasificación (incl. NULL)
  // ─────────────────────────────────────────────────────────
  const sesionesData = [
    { cliente: clientes[0], paso_actual: "handoff",   score: 85, clasificacion: "CALIENTE", pago_tipo: "contado",    decisor: "solo",     disponibilidad: "esta_semana", entrega_usado: false, origen: "whatsapp", vendedor: vendedores[0], nombre_declarado: "Juan Pérez",  tipo_lead: "compra", modalidad_venta: "venta" },
    { cliente: clientes[1], paso_actual: "handoff",   score: 78, clasificacion: "CALIENTE", pago_tipo: "financiado", decisor: "solo",     disponibilidad: "esta_semana", cuotas: 12, credito_ok: 1, anticipo: "40%", origen: "whatsapp", vendedor: vendedores[1], nombre_declarado: "María López", tipo_lead: "compra", modalidad_venta: "venta" },
    { cliente: clientes[2], paso_actual: "gw_clasif", score: 55, clasificacion: "TIBIO",    pago_tipo: "financiado", decisor: "consulta", disponibilidad: "proximas",    cuotas: 24, credito_ok: 0, origen: "whatsapp", vendedor: null, tipo_lead: "compra", modalidad_venta: "venta" },
    { cliente: clientes[3], paso_actual: "gw_clasif", score: 40, clasificacion: "TIBIO",    pago_tipo: "contado",    decisor: "consulta", disponibilidad: "no_sabe",     entrega_usado: true, origen: "instagram", vendedor: null, tipo_lead: "compra", modalidad_venta: "venta" },
    { cliente: clientes[4], paso_actual: "gw_clasif", score: 20, clasificacion: "FRIO",     pago_tipo: "financiado", decisor: "consulta", disponibilidad: "no_sabe",     cuotas: 36, credito_ok: -1, origen: "facebook", vendedor: null, tipo_lead: "compra", modalidad_venta: "venta" },
    { cliente: clientes[7], paso_actual: "venta_usado", score: 60, clasificacion: "TIBIO",  origen: "instagram", vendedor: vendedores[2], nombre_declarado: "Valentina", tipo_lead: "venta", modalidad_venta: "consignacion" },
    { cliente: clientes[5], paso_actual: "gw_router", score: 0,  clasificacion: null,       origen: "web", vendedor: null, tipo_lead: null }, // consulta general (solo saludo/menú)
  ];
  const sesiones = [];
  for (const s of sesionesData) {
    const ses = await prisma.chat_estado.create({
      data: {
        cliente_id: s.cliente.id,
        paso_actual: s.paso_actual,
        score: s.score,
        clasificacion: s.clasificacion ?? null,
        pago_tipo: s.pago_tipo ?? null,
        anticipo: s.anticipo ?? null,
        cuotas: s.cuotas ?? null,
        credito_ok: s.credito_ok ?? null,
        entrega_usado: s.entrega_usado ?? null,
        decisor: s.decisor ?? null,
        disponibilidad: s.disponibilidad ?? null,
        origen: s.origen ?? null,
        vendedor_id: s.vendedor ? s.vendedor.id : null,
        tipo_lead: s.tipo_lead ?? null,
        modalidad_venta: s.modalidad_venta ?? null,
        nombre_declarado: s.nombre_declarado ?? null,
        sesion_inicio: dias(-3),
        ultimo_mensaje: dias(-1),
      },
    });
    sesiones.push({ ...ses, _src: s });
  }
  console.log(`  sesiones: ${sesiones.length}`);

  // 7b) vehiculo_cliente (trade-in / interés) — UNIQUE(sesion_id, contexto)
  let vcCount = 0;
  // Sesión con entrega de usado (trade_in)
  await prisma.vehiculo_cliente.create({
    data: { sesion_id: sesiones[3].id, contexto: "trade_in", marca: "Volkswagen", modelo: "Gol Trend", anio: 2015, kms: "95000", precio_pedido: "6500000" },
  });
  vcCount++;
  // Sesión de consignación (venta de su auto)
  await prisma.vehiculo_cliente.create({
    data: { sesion_id: sesiones[5].id, contexto: "venta", marca: "Toyota", modelo: "Etios", anio: 2018, kms: "60000", precio_pedido: "11000000" },
  });
  vcCount++;
  console.log(`  vehiculo_cliente: ${vcCount}`);

  // ─────────────────────────────────────────────────────────
  // 8) HISTORIAL DE MENSAJES — conversación coherente por sesión
  // ─────────────────────────────────────────────────────────
  const guionPorClasificacion = {
    CALIENTE: [
      ["entrante", "Hola, me interesa un auto que vi en la web", "gw_router"],
      ["saliente", "¡Hola! Claro, ¿qué modelo estás buscando?", "gw_menu"],
      ["entrante", "El Corolla 2021. ¿Está disponible? Pago de contado", "gw_clasif"],
      ["saliente", "Sí, está disponible. Te derivo con un asesor para coordinar la visita 😊", "handoff"],
    ],
    TIBIO: [
      ["entrante", "Buenas, quería consultar precios", "gw_router"],
      ["saliente", "¡Hola! ¿Buscás 0km o usado?", "gw_menu"],
      ["entrante", "Usado, para financiar en cuotas", "gw_clasif"],
      ["saliente", "Perfecto, tenemos varias opciones con financiación. ¿Tenés recibo de sueldo?", "gw_clasif"],
    ],
    FRIO: [
      ["entrante", "hola", "gw_router"],
      ["saliente", "¡Hola! ¿En qué te puedo ayudar? 1) Catálogo 2) Financiación 3) Vender tu usado", "gw_menu"],
      ["entrante", "solo estaba mirando precios", "gw_clasif"],
      ["saliente", "Genial, cuando quieras te paso el catálogo actualizado 👍", "gw_menu"],
    ],
    GENERAL: [
      ["entrante", "buenas", "gw_router"],
      ["saliente", "¡Hola! ¿En qué te puedo ayudar? 1) Catálogo 2) Financiación 3) Vender tu usado", "gw_menu"],
    ],
  };
  let msgCount = 0;
  for (const ses of sesiones) {
    const clave = ses._src.clasificacion ?? "GENERAL";
    const guion = guionPorClasificacion[clave] ?? guionPorClasificacion.GENERAL;
    let t = dias(-3).getTime();
    for (const [direccion, mensaje, paso_nodo] of guion) {
      await prisma.historial_mensajes.create({
        data: { cliente_id: ses.cliente_id, direccion, mensaje, paso_nodo, created_at: new Date(t) },
      });
      t += 2 * 60 * 1000; // +2 min por mensaje
      msgCount++;
    }
  }
  console.log(`  historial_mensajes: ${msgCount}`);

  console.log("✔ Seed completado.");
}

main()
  .catch((e) => { console.error("✖ Error en seed:", e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
