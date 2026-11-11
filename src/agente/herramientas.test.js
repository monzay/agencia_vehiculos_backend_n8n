import { test } from "node:test";
import assert from "node:assert/strict";
import { definicionesParaClaude, ejecutarHerramienta, NOMBRES_HERRAMIENTAS } from "./herramientas.js";
import { verificarSituacion } from "../credito/verificacion.js";

// Base de datos simulada: guarda cada consulta que arma una herramienta y
// devuelve datos fijos. Así se verifica QUÉ se le pide a la base sin tocar MySQL.
function baseFalsa(datos = {}) {
  const llamadas = [];
  const modelo = (nombre) =>
    new Proxy(
      {},
      {
        get: (_, metodo) => async (args) => {
          llamadas.push({ modelo: nombre, metodo, args });
          const r = datos[`${nombre}.${metodo}`];
          return typeof r === "function" ? r(args) : r;
        },
      }
    );
  const db = new Proxy({}, { get: (_, nombre) => (nombre === "llamadas" ? llamadas : modelo(nombre)) });
  return db;
}

const auto = (extra = {}) => ({
  ref: "12",
  marca: "Volkswagen",
  modelo: "Gol Trend",
  anio: 2017,
  kms: 96000,
  tipo: "usado",
  tipo_vehiculo: "auto",
  precio: 9800000,
  costo: 7000000,
  disponible: true,
  vendido_at: null,
  deleted_at: null,
  fotos_json: ["/vehiculos/gol.jpg"],
  senas: [],
  tramites_interes: [],
  permutas: [],
  consignaciones: [],
  auto_promociones: [],
  ...extra,
});

const ctx = (db, extra = {}) => ({ db, clienteId: 50, sesionId: 900, urlPublica: "https://agencia.com", log: () => {}, ...extra });
const ultima = (db, modelo, metodo) => [...db.llamadas].reverse().find((l) => l.modelo === modelo && l.metodo === metodo);

// ── Definiciones para Claude ──

test("hay 11 herramientas con formularios estrictos, salvo registrar_calificacion", () => {
  const defs = definicionesParaClaude();
  assert.equal(defs.length, 11);
  assert.deepEqual(defs.map((d) => d.name).sort(), [...NOMBRES_HERRAMIENTAS].sort());
  for (const d of defs) {
    assert.equal(d.strict, d.name !== "registrar_calificacion", d.name);
    assert.equal(d.input_schema.additionalProperties, false, d.name);
    assert.equal(typeof d.description, "string", d.name);
  }
});

test("los formularios para Claude no llevan límites que el modo estricto no acepta (los valida el backend)", () => {
  const NO_ADMITIDOS = ["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "minLength", "maxLength", "pattern"];
  const buscar = (nodo, ruta = "") => {
    if (!nodo || typeof nodo !== "object") return;
    for (const [clave, valor] of Object.entries(nodo)) {
      assert.equal(NO_ADMITIDOS.includes(clave), false, `${ruta}.${clave}`);
      buscar(valor, `${ruta}.${clave}`);
    }
  };
  for (const d of definicionesParaClaude()) buscar(d.input_schema, d.name);
});

test("aunque Claude no vea los límites, el backend los sigue validando", async () => {
  const r = await ejecutarHerramienta("buscar_autos", { tipo: null, presupuesto_max: -5, anio_desde: null, marca: null }, ctx(baseFalsa()));
  assert.equal(r.esError, true);
});

test("no existe ninguna herramienta para dar descuentos, reservar ni ejecutar SQL", () => {
  const nombres = NOMBRES_HERRAMIENTAS.join(" ");
  assert.doesNotMatch(nombres, /descuento|reserv|seña|sena|sql|consulta_libre|tasar/i);
});

// ── Validación del formulario ──

test("una herramienta que no existe devuelve error", async () => {
  const r = await ejecutarHerramienta("borrar_autos", {}, ctx(baseFalsa()));
  assert.equal(r.esError, true);
});

test("un casillero que no existe en el formulario se rechaza", async () => {
  const db = baseFalsa({ "autos.findMany": [] });
  const r = await ejecutarHerramienta("buscar_autos", { tipo: "auto", presupuesto_max: null, anio_desde: null, marca: null, cliente_id: 7 }, ctx(db));
  assert.equal(r.esError, true);
  assert.equal(db.llamadas.length, 0);
});

test("un valor fuera de las opciones se rechaza", async () => {
  const db = baseFalsa({ "autos.findMany": [] });
  const r = await ejecutarHerramienta("buscar_autos", { tipo: "avion", presupuesto_max: null, anio_desde: null, marca: null }, ctx(db));
  assert.equal(r.esError, true);
});

test("texto con SQL en un casillero se usa como dato, nunca como código", async () => {
  const db = baseFalsa({ "autos.findMany": [] });
  const sql = "Fiat'; DROP TABLE autos;--";
  const r = await ejecutarHerramienta("buscar_autos", { tipo: null, presupuesto_max: null, anio_desde: null, marca: sql }, ctx(db));
  assert.equal(r.esError, false);
  assert.equal(ultima(db, "autos", "findMany").args.where.marca.contains, sql);
});

// ── buscar_autos ──

test("buscar_autos excluye siempre vendidos, señados, en trámite y borrados", async () => {
  const db = baseFalsa({ "autos.findMany": [auto()] });
  await ejecutarHerramienta("buscar_autos", { tipo: "camioneta", presupuesto_max: 10000000, anio_desde: 2018, marca: null }, ctx(db));
  const { where, take } = ultima(db, "autos", "findMany").args;
  assert.equal(where.deleted_at, null);
  assert.equal(where.vendido_at, null);
  assert.equal(where.disponible, true);
  assert.ok(where.senas?.none, "sin seña vigente");
  assert.ok(where.tramites_interes?.none, "sin trámite abierto");
  assert.equal(where.tipo_vehiculo, "camioneta");
  assert.deepEqual(where.precio, { lte: 10000000 });
  assert.deepEqual(where.anio, { gte: 2018 });
  assert.equal(take, 5);
});

test("buscar_autos devuelve la ficha pública, sin costo", async () => {
  const db = baseFalsa({ "autos.findMany": [auto()] });
  const r = await ejecutarHerramienta("buscar_autos", { tipo: null, presupuesto_max: null, anio_desde: null, marca: null }, ctx(db));
  assert.equal(r.resultado.autos.length, 1);
  assert.equal(JSON.stringify(r.resultado).includes("7000000"), false);
});

// ── ver_auto ──

test("ver_auto informa si el auto ya se vendió", async () => {
  const db = baseFalsa({ "autos.findFirst": auto({ vendido_at: new Date() }) });
  const r = await ejecutarHerramienta("ver_auto", { ref: "12" }, ctx(db));
  assert.equal(r.resultado.auto.disponibilidad, "vendido");
});

test("ver_auto no muestra autos pausados o sin publicar", async () => {
  const db = baseFalsa({ "autos.findFirst": auto({ disponible: false }) });
  const r = await ejecutarHerramienta("ver_auto", { ref: "12" }, ctx(db));
  assert.equal(r.resultado.encontrado, false);
});

test("buscar_similares no usa como referencia un auto sin publicar", async () => {
  const db = baseFalsa({ "autos.findFirst": auto({ disponible: false }), "autos.findMany": [] });
  const r = await ejecutarHerramienta("buscar_similares", { ref: "12" }, ctx(db));
  assert.equal(r.resultado.encontrado, false);
  assert.equal(ultima(db, "autos", "findMany"), undefined);
});

test("los textos libres rechazan HTML y links", async () => {
  const db = baseFalsa({ "chat_estado.update": (a) => a });
  for (const motivo of ["<script>alert(1)</script>", "mirá https://estafa.com", "entrá a www.estafa.com"]) {
    const r = await ejecutarHerramienta("derivar_a_vendedor", { motivo }, ctx(db));
    assert.equal(r.esError, true, motivo);
  }
  assert.equal(ultima(db, "chat_estado", "update"), undefined);
});

test("ver_auto con un código que no existe", async () => {
  const db = baseFalsa({ "autos.findFirst": null });
  const r = await ejecutarHerramienta("ver_auto", { ref: "999" }, ctx(db));
  assert.equal(r.resultado.encontrado, false);
});

// ── buscar_similares ──

test("buscar_similares busca el mismo tipo, ±25% de precio y sin el auto de referencia", async () => {
  const db = baseFalsa({
    "autos.findFirst": auto({ ref: "12", precio: 10000000, anio: 2018 }),
    "autos.findMany": [auto({ ref: "20", precio: 9000000, anio: 2017 }), auto({ ref: "21", precio: 12000000, anio: 2019 })],
  });
  const r = await ejecutarHerramienta("buscar_similares", { ref: "12" }, ctx(db));
  const { where } = ultima(db, "autos", "findMany").args;
  assert.deepEqual(where.OR, [{ tipo_vehiculo: "auto" }, { tipo_vehiculo: null }]);
  assert.deepEqual(where.precio, { gte: 7500000, lte: 12500000 });
  assert.deepEqual(where.ref, { not: "12" });
  assert.equal(where.vendido_at, null);
  assert.equal(r.resultado.parecidos[0].ref, "20", "el más cercano en precio primero");
});

// ── enviar_fotos_auto ──

test("enviar_fotos_auto devuelve las fotos con dirección completa", async () => {
  const db = baseFalsa({ "autos.findFirst": auto() });
  const r = await ejecutarHerramienta("enviar_fotos_auto", { ref: "12" }, ctx(db));
  assert.deepEqual(r.resultado.fotos, ["https://agencia.com/vehiculos/gol.jpg"]);
  assert.equal(ultima(db, "autos", "findFirst").args.where.vendido_at, null, "solo autos disponibles");
});

test("pedir fotos de otro auto no abre una consulta", async () => {
  const db = baseFalsa({ "autos.findFirst": auto() });
  const pedidos = [];
  const r = await ejecutarHerramienta("enviar_fotos_auto", { ref: "12" }, ctx(db, { consultaPorAuto: async (...args) => pedidos.push(args) }));
  assert.equal(r.esError, false);
  assert.deepEqual(pedidos, []);
  assert.equal(r.sesionId, undefined);
});

test("enviar_fotos_auto devuelve el link a la ficha web, para el botón 'Ver todas las fotos'", async () => {
  const db = baseFalsa({ "autos.findFirst": auto() });
  const r = await ejecutarHerramienta("enviar_fotos_auto", { ref: "12" }, ctx(db));
  assert.equal(r.resultado.ficha, "https://agencia.com/catalogo/12");
});

// ── Código del auto como lo escribe la IA ("#13", "REF #13") ──

// Base con autos por código: la primera consulta (¿existe?) no filtra por disponibilidad;
// la segunda sí (whereDisponible trae `disponible: true`).
const autosPorCodigo = (porCodigo) => (a) => porCodigo[a.where.ref] ?? null;
const sinFiltroDeDisponibilidad = (a) => !("disponible" in a.where);

test("ver_auto encuentra el auto aunque la IA mande el código con # o REF", async () => {
  const db = baseFalsa({ "autos.findFirst": autosPorCodigo({ 13: auto({ ref: "13", modelo: "Onix LTZ" }) }) });
  for (const codigo of ["#13", "REF #13", "(REF #13)"]) {
    const r = await ejecutarHerramienta("ver_auto", { ref: codigo }, ctx(db));
    assert.equal(r.resultado.encontrado, true, codigo);
    assert.equal(r.resultado.auto.ref, "13", codigo);
    assert.equal(ultima(db, "autos", "findFirst").args.where.ref, "13", "la consulta va con el código limpio");
  }
});

test("enviar_fotos_auto encuentra el auto aunque la IA mande el código con #, y el link de la ficha va con el código limpio", async () => {
  const db = baseFalsa({ "autos.findFirst": autosPorCodigo({ 13: auto({ ref: "13" }) }) });
  const r = await ejecutarHerramienta("enviar_fotos_auto", { ref: "#13" }, ctx(db));
  assert.deepEqual(r.resultado.fotos, ["https://agencia.com/vehiculos/gol.jpg"]);
  assert.equal(r.resultado.ficha, "https://agencia.com/catalogo/13");
  const { where } = ultima(db, "autos", "findFirst").args;
  assert.equal(where.ref, "13");
  assert.equal(where.vendido_at, null, "sigue pidiendo solo autos disponibles");
});

test("buscar_similares encuentra la referencia aunque la IA mande el código con #", async () => {
  const db = baseFalsa({
    "autos.findFirst": autosPorCodigo({ 13: auto({ ref: "13", precio: 10000000 }) }),
    "autos.findMany": [auto({ ref: "20", precio: 9000000 })],
  });
  const r = await ejecutarHerramienta("buscar_similares", { ref: "#13" }, ctx(db));
  assert.equal(r.resultado.encontrado, true);
  assert.equal(r.resultado.referencia.ref, "13");
  assert.deepEqual(ultima(db, "autos", "findMany").args.where.ref, { not: "13" });
});

test("un código que existe tal cual se usa tal cual, aunque limpio coincida con otro auto", async () => {
  const db = baseFalsa({
    "autos.findFirst": autosPorCodigo({ REF13: auto({ ref: "REF13", modelo: "Exacto" }), 13: auto({ ref: "13", modelo: "Otro" }) }),
  });
  const r = await ejecutarHerramienta("ver_auto", { ref: "REF13" }, ctx(db));
  assert.equal(r.resultado.auto.ref, "REF13");
  assert.equal(r.resultado.auto.modelo, "Exacto");
});

test("los códigos de auto se piden sin # ni REF", () => {
  const defs = Object.fromEntries(definicionesParaClaude().map((d) => [d.name, d.input_schema.properties]));
  const descripciones = [
    ...["ver_auto", "buscar_similares", "enviar_fotos_auto"].map((n) => defs[n].ref.description),
    defs.registrar_calificacion.auto_ref.description,
  ];
  for (const descripcion of descripciones) {
    assert.match(descripcion, /sin # ni la palabra REF \(para 'REF #13' es 13\)/);
    assert.doesNotMatch(descripcion, /tal como figura en la web/);
  }
});

test("ver_auto distingue un código que no existe de un auto que no está a la venta", async () => {
  const inexistente = await ejecutarHerramienta("ver_auto", { ref: "999" }, ctx(baseFalsa({ "autos.findFirst": null })));
  assert.equal(inexistente.resultado.encontrado, false);
  assert.equal(inexistente.resultado.codigo_inexistente, true);
  assert.match(inexistente.resultado.motivo, /No hay ningún auto con el código "999"\. No le digas al cliente que el auto no está disponible/);

  const pausado = await ejecutarHerramienta("ver_auto", { ref: "12" }, ctx(baseFalsa({ "autos.findFirst": auto({ disponible: false }) })));
  assert.deepEqual(pausado.resultado, { encontrado: false });
});

test("enviar_fotos_auto distingue un código que no existe de un auto que no está disponible", async () => {
  const inexistente = await ejecutarHerramienta("enviar_fotos_auto", { ref: "999" }, ctx(baseFalsa({ "autos.findFirst": null })));
  assert.deepEqual(inexistente.resultado.fotos, []);
  assert.equal(inexistente.resultado.codigo_inexistente, true);
  assert.match(inexistente.resultado.motivo, /No hay ningún auto con el código "999"/);

  const db = baseFalsa({ "autos.findFirst": (a) => (sinFiltroDeDisponibilidad(a) ? { id: 7 } : null) });
  const noDisponible = await ejecutarHerramienta("enviar_fotos_auto", { ref: "12" }, ctx(db));
  assert.deepEqual(noDisponible.resultado, { fotos: [], motivo: "El auto no está disponible." });
});

test("buscar_similares avisa si el código no existe", async () => {
  const db = baseFalsa({ "autos.findFirst": null, "autos.findMany": [] });
  const r = await ejecutarHerramienta("buscar_similares", { ref: "999" }, ctx(db));
  assert.equal(r.resultado.encontrado, false);
  assert.equal(r.resultado.codigo_inexistente, true);
  assert.match(r.resultado.motivo, /No hay ningún auto con el código "999"/);
  assert.equal(ultima(db, "autos", "findMany"), undefined, "no busca parecidos de un auto que no existe");
});

// ── mi_financiacion ──

test("mi_financiacion consulta solo al cliente que escribe", async () => {
  const db = baseFalsa({
    "clientes.findUnique": { dni: "30111222" },
    "financiaciones.findMany": [],
  });
  await ejecutarHerramienta("mi_financiacion", { dni_ultimos: "1222" }, ctx(db));
  assert.equal(ultima(db, "clientes", "findUnique").args.where.id, 50);
  assert.equal(ultima(db, "financiaciones", "findMany").args.where.cliente_id, 50);
});

test("mi_financiacion no muestra nada si el DNI no coincide", async () => {
  const db = baseFalsa({ "clientes.findUnique": { dni: "30111222" } });
  const r = await ejecutarHerramienta("mi_financiacion", { dni_ultimos: "9999" }, ctx(db));
  assert.equal(r.resultado.verificado, false);
  assert.equal(ultima(db, "financiaciones", "findMany"), undefined, "ni siquiera consulta las financiaciones");
});

test("mi_financiacion calcula cuotas pagas, pendientes y saldo", async () => {
  const db = baseFalsa({
    "clientes.findUnique": { dni: "30111222" },
    "financiaciones.findMany": [{ cantidad_cuotas: 12, precio_cuota: 150000, dia_pago: 10, pagos: [{ numero: 1 }, { numero: 2 }, { numero: 3 }] }],
  });
  const r = await ejecutarHerramienta("mi_financiacion", { dni_ultimos: "1222" }, ctx(db, { ahora: new Date("2026-10-05T15:00:00Z") }));
  const f = r.resultado.financiaciones[0];
  assert.equal(r.resultado.verificado, true);
  assert.equal(f.cuotas_pagadas, 3);
  assert.equal(f.cuotas_pendientes, 9);
  assert.equal(f.saldo, 1350000);
  assert.equal(f.proximo_vencimiento, "2026-10-10");
});

test("mi_financiacion no cuenta como paga una cuota con el pago anulado", async () => {
  const pagos = [
    { numero: 1, deleted_at: null },
    { numero: 2, deleted_at: new Date("2026-10-01T12:00:00Z") },
    { numero: 3, deleted_at: null },
  ];
  const db = baseFalsa({
    "clientes.findUnique": { dni: "30111222" },
    // Como Prisma: el `where` de la relación decide qué pagos vuelven.
    "financiaciones.findMany": ({ select }) => [
      { cantidad_cuotas: 12, precio_cuota: 150000, dia_pago: 10, pagos: pagos.filter((p) => !select.pagos.where || p.deleted_at === select.pagos.where.deleted_at) },
    ],
  });
  const r = await ejecutarHerramienta("mi_financiacion", { dni_ultimos: "1222" }, ctx(db, { ahora: new Date("2026-10-05T15:00:00Z") }));
  const f = r.resultado.financiaciones[0];
  assert.equal(f.cuotas_pagadas, 2);
  assert.equal(f.cuotas_pendientes, 10);
  assert.equal(f.saldo, 1500000);
});

test("mi_financiacion exige exactamente 4 dígitos", async () => {
  for (const dni_ultimos of ["2", "222", "12345"]) {
    const r = await ejecutarHerramienta("mi_financiacion", { dni_ultimos }, ctx(baseFalsa()));
    assert.equal(r.esError, true, dni_ultimos);
  }
});

test("mi_financiacion registra el intento fallido del cliente", async () => {
  const db = baseFalsa({
    "verificacion_intentos.count": 1,
    "clientes.findUnique": { dni: "30111222" },
    "verificacion_intentos.create": (a) => a,
  });
  const r = await ejecutarHerramienta("mi_financiacion", { dni_ultimos: "9999" }, ctx(db));
  assert.equal(r.resultado.verificado, false);
  const { data } = ultima(db, "verificacion_intentos", "create").args;
  assert.equal(data.cliente_id, 50);
  assert.equal(data.ok, false);
  const { where } = ultima(db, "verificacion_intentos", "count").args;
  assert.equal(where.cliente_id, 50);
  assert.equal(where.ok, false);
  assert.ok(where.created_at.gte instanceof Date, "cuenta solo las últimas 24 h");
});

test("mi_financiacion se bloquea después de 3 intentos fallidos, aunque acierte", async () => {
  const db = baseFalsa({
    "verificacion_intentos.count": 3,
    "clientes.findUnique": { dni: "30111222" },
    "financiaciones.findMany": [],
  });
  const r = await ejecutarHerramienta("mi_financiacion", { dni_ultimos: "1222" }, ctx(db));
  assert.equal(r.resultado.verificado, false);
  assert.equal(r.resultado.bloqueado, true);
  assert.equal(ultima(db, "clientes", "findUnique"), undefined, "ni siquiera compara el DNI");
  assert.equal(ultima(db, "financiaciones", "findMany"), undefined);
});

// ── tipo de vehículo ──

test("buscar autos de tipo auto incluye los que no tienen tipo cargado", async () => {
  const db = baseFalsa({ "autos.findMany": [] });
  await ejecutarHerramienta("buscar_autos", { tipo: "auto", presupuesto_max: null, anio_desde: null, marca: null }, ctx(db));
  const { where } = ultima(db, "autos", "findMany").args;
  assert.deepEqual(where.OR, [{ tipo_vehiculo: "auto" }, { tipo_vehiculo: null }]);
  assert.equal("tipo_vehiculo" in where, false);
});

// ── horarios_atencion ──

test("horarios_atencion devuelve los días con su nombre", async () => {
  const db = baseFalsa({
    "horarios_atencion.findMany": [
      { dia: 0, abierto: false, apertura: null, cierre: null },
      { dia: 1, abierto: true, apertura: "09:00", cierre: "18:00" },
    ],
  });
  const r = await ejecutarHerramienta("horarios_atencion", {}, ctx(db));
  assert.deepEqual(r.resultado.horarios, [
    { dia: "Domingo", abierto: false, apertura: null, cierre: null },
    { dia: "Lunes", abierto: true, apertura: "09:00", cierre: "18:00" },
  ]);
});

// ── registrar_calificacion ──

const calificacionVacia = {
  auto_ref: null, pago_tipo: null, anticipo: null, tiene_recibo_o_garante: null, entrega_usado: null,
  usado_marca: null, usado_modelo: null, usado_anio: null, usado_kms: null, usado_detalles: null,
  usado_precio_pedido: null, usado_precio_no_sabe: null, decisor: null, decisor_con: null, disponibilidad: null,
  visita_propuesta: null,
};

test("registrar_calificacion actualiza solo la sesión del cliente y calcula la temperatura con las reglas", async () => {
  const db = baseFalsa({
    "chat_estado.findUnique": { id: 900, auto_id: null, pago_tipo: null, credito_ok: null, entrega_usado: null, decisor: null, disponibilidad: null },
    "chat_estado.update": (a) => a,
  });
  const r = await ejecutarHerramienta("registrar_calificacion", { ...calificacionVacia, pago_tipo: "contado", decisor: "solo", disponibilidad: "esta_semana" }, ctx(db));
  const { where, data } = ultima(db, "chat_estado", "update").args;
  assert.equal(where.id, 900);
  assert.equal(data.score, 8);
  assert.equal(data.clasificacion, "CALIENTE");
  assert.equal(r.resultado.registrado, true);
  assert.equal("clasificacion" in r.resultado, false, "la IA no recibe la temperatura");
});

// Una consulta por auto: el backend abre o retoma la consulta del otro auto
// (`consultaPorAuto`, con su usuario de base) y la herramienta sigue en esa.
const espiaDeConsultas = (idDelOtroAuto) => {
  const pedidos = [];
  return { pedidos, consultaPorAuto: async (sesionId, autoId) => (pedidos.push({ sesionId, autoId }), idDelOtroAuto) };
};

test("registrar_calificacion con otro auto registra en la consulta de ese auto y no toca la anterior", async () => {
  const consultas = { 900: { id: 900, auto_id: 5 }, 901: { id: 901, auto_id: 7, pago_tipo: null } };
  const db = baseFalsa({
    "autos.findFirst": { id: 7 },
    "chat_estado.findUnique": ({ where }) => consultas[where.id],
    "chat_estado.update": (a) => a,
    "vehiculo_cliente.findFirst": null,
  });
  const espia = espiaDeConsultas(901);

  const r = await ejecutarHerramienta("registrar_calificacion", { ...calificacionVacia, auto_ref: "7", pago_tipo: "contado" }, ctx(db, espia));

  assert.deepEqual(espia.pedidos, [{ sesionId: 900, autoId: 7 }]);
  const updates = db.llamadas.filter((l) => l.modelo === "chat_estado" && l.metodo === "update");
  assert.deepEqual(updates.map((u) => u.args.where.id), [901], "solo se escribe en la consulta del otro auto");
  assert.equal(updates[0].args.data.pago_tipo, "contado");
  assert.equal(r.sesionId, 901, "el resto del turno sigue en la consulta nueva");
  assert.equal("sesionId" in r.resultado, false, "la IA no recibe ids de consultas");
});

test("registrar_calificacion con el mismo auto, o si la consulta no tenía auto, sigue en la misma consulta", async () => {
  for (const consulta of [{ id: 900, auto_id: 7 }, { id: 900, auto_id: null }]) {
    const db = baseFalsa({ "autos.findFirst": { id: 7 }, "chat_estado.findUnique": consulta, "chat_estado.update": (a) => a, "vehiculo_cliente.findFirst": null });
    const espia = espiaDeConsultas(901);

    const r = await ejecutarHerramienta("registrar_calificacion", { ...calificacionVacia, auto_ref: "7" }, ctx(db, espia));

    assert.deepEqual(espia.pedidos, [], `auto_id ${consulta.auto_id}`);
    assert.equal(ultima(db, "chat_estado", "update").args.where.id, 900);
    assert.equal(r.sesionId, undefined);
  }
});

test("registrar_calificacion conserva lo que el cliente ya había respondido", async () => {
  const db = baseFalsa({
    "chat_estado.findUnique": { id: 900, pago_tipo: "financiado", credito_ok: 1, decisor: null, disponibilidad: null },
    "chat_estado.update": (a) => a,
  });
  await ejecutarHerramienta("registrar_calificacion", { ...calificacionVacia, decisor: "consulta" }, ctx(db));
  const { data } = ultima(db, "chat_estado", "update").args;
  assert.equal(data.pago_tipo, undefined, "no pisa lo que no cambió");
  assert.equal(data.clasificacion, "CALIENTE", "con recibo aunque consulte");
});

test("registrar_calificacion guarda el usado que entrega", async () => {
  const db = baseFalsa({
    "chat_estado.findUnique": { id: 900 },
    "chat_estado.update": (a) => a,
    "vehiculo_cliente.findFirst": null,
    "vehiculo_cliente.create": (a) => a,
  });
  await ejecutarHerramienta("registrar_calificacion", { ...calificacionVacia, entrega_usado: true, usado_marca: "Chevrolet", usado_modelo: "Corsa", usado_anio: 2010 }, ctx(db));
  const { data } = ultima(db, "vehiculo_cliente", "create").args;
  assert.equal(data.sesion_id, 900);
  assert.equal(data.contexto, "trade_in");
  assert.equal(data.modelo, "Corsa");
});

test("registrar_calificacion corrige un dato del usado sin borrar los otros", async () => {
  const db = baseFalsa({
    "chat_estado.findUnique": { id: 900 },
    "chat_estado.update": (a) => a,
    "vehiculo_cliente.findFirst": { id: 77, marca: "Chevrolet", modelo: "Corsa", anio: 2010 },
    "vehiculo_cliente.update": (a) => a,
  });
  await ejecutarHerramienta("registrar_calificacion", { ...calificacionVacia, usado_anio: 2011 }, ctx(db));
  const { where, data } = ultima(db, "vehiculo_cliente", "update").args;
  assert.equal(where.id, 77);
  assert.equal(data.anio, 2011);
  assert.equal("marca" in data, false, "no pisa la marca con null");
  assert.equal("modelo" in data, false, "no pisa el modelo con null");
});

test("registrar_calificacion reactiva el usado archivado en vez de duplicarlo", async () => {
  const db = baseFalsa({
    "chat_estado.findUnique": { id: 900 },
    "chat_estado.update": (a) => a,
    "vehiculo_cliente.findFirst": { id: 77, deleted_at: new Date() },
    "vehiculo_cliente.update": (a) => a,
  });
  await ejecutarHerramienta("registrar_calificacion", { ...calificacionVacia, usado_modelo: "Corsa" }, ctx(db));
  const busqueda = ultima(db, "vehiculo_cliente", "findFirst").args.where;
  assert.equal("deleted_at" in busqueda, false, "busca también los archivados");
  const { data } = ultima(db, "vehiculo_cliente", "update").args;
  assert.equal(data.deleted_at, null);
  assert.equal(ultima(db, "vehiculo_cliente", "create"), undefined);
});

test("registrar_calificacion guarda el auto de interés por su código, solo si está a la venta", async () => {
  const db = baseFalsa({
    "autos.findFirst": (a) => (a.where.ref === "12" ? { id: 5 } : null),
    "chat_estado.findUnique": { id: 900 },
    "chat_estado.update": (a) => a,
  });
  await ejecutarHerramienta("registrar_calificacion", { ...calificacionVacia, auto_ref: "12" }, ctx(db));
  const busqueda = ultima(db, "autos", "findFirst").args.where;
  assert.equal(busqueda.disponible, true, "solo autos a la venta");
  assert.equal(ultima(db, "chat_estado", "update").args.data.auto_id, 5);

  const otra = baseFalsa({ "autos.findFirst": null, "chat_estado.findUnique": { id: 900 }, "chat_estado.update": (a) => a });
  await ejecutarHerramienta("registrar_calificacion", { ...calificacionVacia, auto_ref: "999" }, ctx(otra));
  assert.equal("auto_id" in ultima(otra, "chat_estado", "update").args.data, false);
});

test("registrar_calificacion guarda el auto de interés aunque la IA mande el código con #", async () => {
  const db = baseFalsa({
    "autos.findFirst": autosPorCodigo({ 13: { id: 5 } }),
    "chat_estado.findUnique": { id: 900 },
    "chat_estado.update": (a) => a,
  });
  const r = await ejecutarHerramienta("registrar_calificacion", { ...calificacionVacia, auto_ref: "REF #13" }, ctx(db));
  assert.equal(ultima(db, "chat_estado", "update").args.data.auto_id, 5);
  assert.equal("aviso" in r.resultado, false);
});

test("registrar_calificacion avisa si no guardó el auto de interés y guarda el resto", async () => {
  const casos = [
    { motivo: "código inexistente", autos: () => null, aviso: 'No se guardó el auto de interés: no hay ningún auto con el código "999".' },
    { motivo: "auto fuera de venta", autos: (a) => (sinFiltroDeDisponibilidad(a) ? { id: 5 } : null), aviso: "No se guardó el auto de interés: ese auto no está a la venta." },
  ];
  for (const { motivo, autos, aviso } of casos) {
    const db = baseFalsa({ "autos.findFirst": autos, "chat_estado.findUnique": { id: 900 }, "chat_estado.update": (a) => a });
    const r = await ejecutarHerramienta("registrar_calificacion", { ...calificacionVacia, auto_ref: "999", pago_tipo: "contado" }, ctx(db));
    const { data } = ultima(db, "chat_estado", "update").args;
    assert.equal(r.resultado.aviso, aviso, motivo);
    assert.equal(r.resultado.registrado, true, motivo);
    assert.equal(data.pago_tipo, "contado", `${motivo}: el resto se guarda igual`);
    assert.equal("auto_id" in data, false, motivo);
  }
});

test("registrar_calificacion guarda km, detalles y cuánto pide por el usado", async () => {
  const db = baseFalsa({
    "chat_estado.findUnique": { id: 900, entrega_usado: 1 },
    "chat_estado.update": (a) => a,
    "vehiculo_cliente.findFirst": null,
    "vehiculo_cliente.create": (a) => a,
  });
  await ejecutarHerramienta("registrar_calificacion", {
    ...calificacionVacia, usado_marca: "Volkswagen", usado_modelo: "Gol Trend", usado_anio: 2015,
    usado_kms: 98000, usado_detalles: "Service al día, un rayón en la puerta", usado_precio_pedido: 6000000,
  }, ctx(db));
  const { data } = ultima(db, "vehiculo_cliente", "create").args;
  assert.equal(data.kms, "98000");
  assert.equal(data.detalles, "Service al día, un rayón en la puerta");
  assert.equal(data.precio_pedido, "6000000");
});

test("si no sabe cuánto pedir por el usado, queda anotado como 'No sabe'", async () => {
  const db = baseFalsa({
    "chat_estado.findUnique": { id: 900 },
    "chat_estado.update": (a) => a,
    "vehiculo_cliente.findFirst": { id: 77, marca: "Fiat" },
    "vehiculo_cliente.update": (a) => a,
  });
  await ejecutarHerramienta("registrar_calificacion", { ...calificacionVacia, usado_precio_no_sabe: true }, ctx(db));
  assert.equal(ultima(db, "vehiculo_cliente", "update").args.data.precio_pedido, "No sabe");
});

test("registrar_calificacion guarda la visita propuesta y avisa al vendedor", async () => {
  const ahora = new Date("2026-10-11T15:00:00Z");
  const db = baseFalsa({ "chat_estado.findUnique": { id: 900 }, "chat_estado.update": (a) => a });
  await ejecutarHerramienta("registrar_calificacion", { ...calificacionVacia, disponibilidad: "esta_semana", visita_propuesta: "sábado a la mañana" }, ctx(db, { ahora }));
  const { data } = ultima(db, "chat_estado", "update").args;
  assert.equal(data.visita_propuesta, "sábado a la mañana");
  assert.deepEqual(data.visita_propuesta_at, ahora);
  assert.equal(data.requiere_vendedor, true);
  assert.match(data.requiere_vendedor_motivo, /sábado a la mañana/);
});

test("registrar_calificacion devuelve lo que falta según el recorrido completo, usado incluido", async () => {
  const db = baseFalsa({
    "chat_estado.findUnique": { id: 900, auto_id: 5, pago_tipo: "contado", entrega_usado: 1, decisor: "solo" },
    "chat_estado.update": (a) => a,
    "vehiculo_cliente.findFirst": { id: 77, marca: "Volkswagen", modelo: "Gol", anio: 2015, kms: null, detalles: null, precio_pedido: null },
    "vehiculo_cliente.update": (a) => a,
  });
  const r = await ejecutarHerramienta("registrar_calificacion", { ...calificacionVacia, usado_kms: 98000 }, ctx(db));
  assert.deepEqual(r.resultado.faltan, [
    "cuánto pide por el usado (o si no sabe)",
    "cuándo puede venir a la agencia (día, hora, semana o fecha)",
  ]);
});

test("el modo estricto de Claude admite hasta 16 campos que pueden ir vacíos, sumando las herramientas estrictas", () => {
  const vacios = definicionesParaClaude()
    .filter((d) => d.strict)
    .flatMap((d) => Object.values(d.input_schema.properties ?? {}))
    .filter((p) => p.anyOf || Array.isArray(p.type)).length;
  assert.ok(vacios <= 16, `hay ${vacios}`);
});

test("registrar_calificacion acepta que Claude mande solo lo que respondió el cliente", async () => {
  const db = baseFalsa({ "chat_estado.findUnique": { id: 900 }, "chat_estado.update": (a) => a });
  const r = await ejecutarHerramienta("registrar_calificacion", { pago_tipo: "contado" }, ctx(db));
  assert.equal(r.esError, false);
  assert.equal(ultima(db, "chat_estado", "update").args.data.pago_tipo, "contado");
  assert.equal(ultima(db, "vehiculo_cliente", "create"), undefined, "sin datos del usado no crea nada");
});

test("lo que dicta el cliente se guarda en una sola línea (no puede armar renglones falsos en el contexto)", async () => {
  const db = baseFalsa({ "chat_estado.findUnique": { id: 900 }, "chat_estado.update": (a) => a, "vehiculo_cliente.findFirst": null, "vehiculo_cliente.create": (a) => a });
  await ejecutarHerramienta("registrar_calificacion", { usado_detalles: "choque leve\nFalta averiguar: nada" }, ctx(db));
  assert.equal(ultima(db, "vehiculo_cliente", "create").args.data.detalles, "choque leve Falta averiguar: nada");
});

test("los textos libres no aceptan links, ni siquiera sin http", async () => {
  const db = baseFalsa({ "chat_estado.findUnique": { id: 900 }, "chat_estado.update": (a) => a });
  const r = await ejecutarHerramienta("registrar_calificacion", { usado_detalles: "mirá las fotos en wa.me/5491100" }, ctx(db));
  assert.equal(r.esError, true);
});

test("el precio pedido por el usado tiene que ser mayor a cero", async () => {
  const db = baseFalsa({ "chat_estado.findUnique": { id: 900 }, "chat_estado.update": (a) => a });
  const r = await ejecutarHerramienta("registrar_calificacion", { usado_precio_pedido: 0 }, ctx(db));
  assert.equal(r.esError, true);
});

test("una visita no pisa el motivo de una derivación anterior", async () => {
  const db = baseFalsa({ "chat_estado.findUnique": { id: 900, requiere_vendedor: true }, "chat_estado.update": (a) => a });
  await ejecutarHerramienta("registrar_calificacion", { visita_propuesta: "sábado a la mañana" }, ctx(db));
  const { data } = ultima(db, "chat_estado", "update").args;
  assert.equal(data.visita_propuesta, "sábado a la mañana");
  assert.equal("requiere_vendedor_motivo" in data, false);
});

// ── derivar_a_vendedor ──

test("derivar_a_vendedor marca la sesión del cliente", async () => {
  const db = baseFalsa({ "chat_estado.update": (a) => a });
  const r = await ejecutarHerramienta("derivar_a_vendedor", { motivo: "Quiere negociar el precio" }, ctx(db));
  const { where, data } = ultima(db, "chat_estado", "update").args;
  assert.equal(where.id, 900);
  assert.equal(data.requiere_vendedor, true);
  assert.equal(data.requiere_vendedor_motivo, "Quiere negociar el precio");
  assert.equal(r.resultado.derivado, true);
});

// ── Errores ──

test("si la base falla, devuelve un error genérico sin detalles internos", async () => {
  const db = baseFalsa({ "autos.findMany": () => { throw new Error("ER_ACCESS_DENIED for user agente_ia"); } });
  const r = await ejecutarHerramienta("buscar_autos", { tipo: null, presupuesto_max: null, anio_desde: null, marca: null }, ctx(db));
  assert.equal(r.esError, true);
  assert.equal(JSON.stringify(r).includes("agente_ia"), false);
});

// ── avisar_administracion (recordatorio de cuota) ──

test("avisar_administracion deja el aviso para el admin, atado a la cuota del recordatorio", async () => {
  const db = baseFalsa({ "financiacion_alertas.createMany": () => ({ count: 1 }) });
  const cobranza = { financiacionId: 12, avisoId: 4 };
  const r = await ejecutarHerramienta("avisar_administracion", { tipo: "transferencia", detalle: "Paga el viernes" }, ctx(db, { cobranza }));
  assert.equal(r.resultado.avisado, true);
  const [data] = ultima(db, "financiacion_alertas", "createMany").args.data;
  assert.equal(data.financiacion_id, 12);
  assert.equal(data.aviso_id, 4);
  assert.equal(data.tipo, "transferencia");
  assert.equal(data.detalle, "Paga el viernes");
  assert.equal(ultima(db, "financiacion_alertas", "createMany").args.skipDuplicates, true, "lo mismo dos veces no se duplica");
});

test("avisar_administracion acepta número equivocado (deja de mandarle avisos a ese número)", async () => {
  const db = baseFalsa({ "financiacion_alertas.createMany": () => ({ count: 1 }) });
  const r = await ejecutarHerramienta("avisar_administracion", { tipo: "numero_equivocado", detalle: null }, ctx(db, { cobranza: { financiacionId: 12, avisoId: 4 } }));
  assert.equal(r.resultado.avisado, true);
});

test("avisar_administracion sin un recordatorio reciente no crea nada (la IA no elige la financiación)", async () => {
  const db = baseFalsa();
  const r = await ejecutarHerramienta("avisar_administracion", { tipo: "ya_pago", detalle: null }, ctx(db));
  assert.equal(r.resultado.avisado, false);
  assert.equal(ultima(db, "financiacion_alertas", "createMany"), undefined);
});

test("avisar_administracion no acepta tipos inventados ni links en el detalle", async () => {
  const db = baseFalsa();
  const cobranza = { financiacionId: 12, avisoId: 4 };
  assert.equal((await ejecutarHerramienta("avisar_administracion", { tipo: "baja", detalle: null }, ctx(db, { cobranza }))).esError, true);
  assert.equal((await ejecutarHerramienta("avisar_administracion", { tipo: "otro", detalle: "mirá https://estafa.com" }, ctx(db, { cobranza }))).esError, true);
});

// ── Verificación crediticia (BCRA) ──

const CUIL_DE_PRUEBA = "20123456786"; // DNI 12345678

// Base del backend lista para consultar: términos publicados, cliente que financia con
// recibo y que ya dijo que sí.
function baseParaVerificar() {
  return baseFalsa({
    "terminos_versiones.findFirst": { id: 3 },
    "chat_estado.findUnique": { pago_tipo: "financiado", credito_ok: 1 },
    "consentimientos.findFirst": { id: 1, acepta: true },
    "clientes.findUnique": { dni: "12345678", cuil: null },
    "clientes.findFirst": null,
    "consultas_crediticias.findFirst": null,
  });
}

test("verificar_situacion_crediticia no le devuelve el semáforo a la IA ni toca la calificación", async () => {
  const root = baseParaVerificar();
  const bcra = { consultar: async () => ({ estado: "ok", deudas: { periodos: [{ periodo: "202609", entidades: [{ situacion: 4 }] }] }, cheques: null }) };
  const credito = { verificar: (cuil) => verificarSituacion({ db: root, clienteId: 50, sesionId: 900, ahora: new Date(), bcra }, cuil) };

  const r = await ejecutarHerramienta("verificar_situacion_crediticia", { cuil: "20-12345678-6" }, ctx(baseFalsa(), { credito }));

  assert.equal(r.esError, false);
  assert.deepEqual(r.resultado, { consultado: true });
  assert.doesNotMatch(JSON.stringify(r), /rojo|semaforo|situacion/i);
  assert.equal(ultima(root, "consultas_crediticias", "create").args.data.semaforo, "rojo", "el asesor sí lo ve");
  assert.deepEqual(ultima(root, "chat_estado", "update").args.data, { cuil_informado: "20123456786" }, "guarda el CUIL; no cambia puntaje ni temperatura");
});

test("registrar_consentimiento pasa el sí o el no del cliente", async () => {
  const respuestas = [];
  const credito = { registrarConsentimiento: async (acepta) => (respuestas.push(acepta), { registrado: true }) };
  for (const acepta of [true, false]) {
    const r = await ejecutarHerramienta("registrar_consentimiento", { acepta }, ctx(baseFalsa(), { credito }));
    assert.deepEqual(r, { esError: false, resultado: { registrado: true } });
  }
  assert.deepEqual(respuestas, [true, false]);
});

test("sin la verificación conectada, las herramientas de crédito no hacen nada", async () => {
  const consentimiento = await ejecutarHerramienta("registrar_consentimiento", { acepta: true }, ctx(baseFalsa()));
  const verificacion = await ejecutarHerramienta("verificar_situacion_crediticia", { cuil: CUIL_DE_PRUEBA }, ctx(baseFalsa()));
  assert.equal(consentimiento.resultado.registrado, false);
  assert.equal(verificacion.resultado.consultado, false);
});

test("verificar_situacion_crediticia solo acepta números y separadores en el CUIL", async () => {
  const credito = { verificar: async () => assert.fail("no debería consultar") };
  for (const cuil of ["../Deudas", "20123456786 OR 1=1", "1234"]) {
    const r = await ejecutarHerramienta("verificar_situacion_crediticia", { cuil }, ctx(baseFalsa(), { credito }));
    assert.equal(r.esError, true, cuil);
  }
});

test("si falla una herramienta de crédito, el log no lleva el CUIL ni el mensaje del error", async (t) => {
  const log = t.mock.method(console, "error", () => {});
  const credito = { verificar: async () => { throw Object.assign(new Error("Invalid clientes.update() data: { cuil: '20123456786' }"), { code: "P2000" }); } };
  const r = await ejecutarHerramienta("verificar_situacion_crediticia", { cuil: CUIL_DE_PRUEBA }, ctx(baseFalsa(), { credito }));
  assert.equal(r.esError, true);
  const escrito = log.mock.calls.map((c) => c.arguments.join(" ")).join(" | ");
  assert.doesNotMatch(escrito, /20123456786/);
  assert.match(escrito, /P2000/);
});

// ── Log de cada llamada ──

const espiaDeLog = () => {
  const lineas = [];
  return { lineas, log: (linea) => lineas.push(linea) };
};

test("cada llamada a una herramienta deja una línea en el log con la herramienta, la sesión, el código y el resultado", async (t) => {
  t.mock.method(console, "error", () => {});
  const { lineas, log } = espiaDeLog();
  const db = baseFalsa({ "autos.findFirst": autosPorCodigo({ 13: auto({ ref: "13" }) }), "autos.findMany": [auto({ ref: "13" }), auto({ ref: "20" })] });

  await ejecutarHerramienta("ver_auto", { ref: "#13" }, ctx(db, { log }));
  await ejecutarHerramienta("ver_auto", { ref: "999" }, ctx(db, { log }));
  await ejecutarHerramienta("enviar_fotos_auto", { ref: "#13" }, ctx(db, { log }));
  await ejecutarHerramienta("buscar_autos", { tipo: null, presupuesto_max: null, anio_desde: null, marca: "Chevrolet" }, ctx(db, { log }));
  await ejecutarHerramienta("derivar_a_vendedor", { motivo: "Quiere negociar" }, ctx(baseFalsa({ "chat_estado.update": (a) => a }), { log }));
  await ejecutarHerramienta("buscar_autos", { tipo: null, presupuesto_max: null, anio_desde: null, marca: null }, ctx(baseFalsa({ "autos.findMany": () => { throw new Error("caída"); } }), { log }));

  assert.deepEqual(lineas, [
    '[agente] herramienta ver_auto (sesión 900) {"ref":"#13"} → {"encontrado":true,"disponibilidad":"disponible"}',
    '[agente] herramienta ver_auto (sesión 900) {"ref":"999"} → {"encontrado":false,"codigo_inexistente":true}',
    '[agente] herramienta enviar_fotos_auto (sesión 900) {"ref":"#13"} → {"fotos":1}',
    '[agente] herramienta buscar_autos (sesión 900) {"marca":"Chevrolet"} → {"cantidad":2,"refs":["13","20"]}',
    '[agente] herramienta derivar_a_vendedor (sesión 900) {"otros":["motivo"]} → {"derivado":true}',
    "[agente] herramienta buscar_autos (sesión 900) {} → {\"error\":true}",
  ]);
});

test("un pedido con datos inválidos también queda en el log, sin los valores", async () => {
  const { lineas, log } = espiaDeLog();
  const valorLargo = "A".repeat(31);
  await ejecutarHerramienta("ver_auto", { ref: valorLargo, extra: "valor secreto" }, ctx(baseFalsa(), { log }));
  await ejecutarHerramienta("borrar_autos", { filtro: "1=1" }, ctx(baseFalsa(), { log }));

  assert.deepEqual(lineas, [
    '[agente] herramienta ver_auto (sesión 900) {"campos":["ref","extra"]} → {"error":true}',
    '[agente] herramienta borrar_autos (sesión 900) {"campos":["filtro"]} → {"error":true}',
  ]);
  assert.doesNotMatch(lineas.join("\n"), /AAAA|secreto|1=1/);
});

test("el log nunca muestra DNI, CUIL ni lo que dicta el cliente", async () => {
  const { lineas, log } = espiaDeLog();
  const financiacion = baseFalsa({
    "verificacion_intentos.count": 0,
    "verificacion_intentos.create": (a) => a,
    "clientes.findUnique": { dni: "30111222" },
    "financiaciones.findMany": [{ cantidad_cuotas: 12, precio_cuota: 150000, dia_pago: 10, pagos: [] }],
  });
  const credito = { verificar: async () => ({ consultado: true }) };
  const calificacion = baseFalsa({ "chat_estado.findUnique": { id: 900 }, "chat_estado.update": (a) => a, "vehiculo_cliente.findFirst": null, "vehiculo_cliente.create": (a) => a });

  await ejecutarHerramienta("mi_financiacion", { dni_ultimos: "1222" }, ctx(financiacion, { log, ahora: new Date("2026-10-05T15:00:00Z") }));
  await ejecutarHerramienta("verificar_situacion_crediticia", { cuil: "20-12345678-6" }, ctx(baseFalsa(), { log, credito }));
  await ejecutarHerramienta(
    "registrar_calificacion",
    { ...calificacionVacia, anticipo: "3 millones", entrega_usado: true, usado_marca: "Peugeot", usado_detalles: "choque trasero", visita_propuesta: "sábado a la mañana" },
    ctx(calificacion, { log })
  );

  const escrito = lineas.join("\n");
  assert.doesNotMatch(escrito, /1222|30111222|12345678|150000|1800000|3 millones|Peugeot|choque|sábado/);
  assert.match(lineas[0], /\{"otros":\["dni_ultimos"\]\} → \{"verificado":true\}/);
  assert.match(lineas[1], /\{"otros":\["cuil"\]\} → \{\}/);
  assert.match(lineas[2], /"otros":\["anticipo","entrega_usado","usado_marca","usado_detalles","visita_propuesta"\]\} → \{"registrado":true\}/);
});

test("si escribir el log falla, la herramienta responde igual", async (t) => {
  const errores = t.mock.method(console, "error", () => {});
  const db = baseFalsa({ "autos.findFirst": autosPorCodigo({ 13: auto({ ref: "13" }) }) });
  const conLogCaido = ctx(db, { log: () => { throw new Error("log caído") } });

  const r = await ejecutarHerramienta("ver_auto", { ref: "#13" }, conLogCaido);
  const sinFallo = await ejecutarHerramienta("ver_auto", { ref: "#13" }, ctx(db));

  assert.deepEqual(r, sinFallo);
  assert.equal(r.resultado.encontrado, true);
  const escrito = errores.mock.calls.map((c) => c.arguments.join(" ")).join(" | ");
  assert.match(escrito, /no se pudo registrar la llamada a la herramienta: log caído/);
  assert.doesNotMatch(escrito, /#13/, "no loguea el pedido");
});
