import { test, mock } from "node:test";
import assert from "node:assert/strict";
import fs, { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ejecutarUnificacion, textoDelInforme, nombreDelInforme, guardarInforme } from "./unificacion-clientes.service.js";

// ── Base falsa en memoria ──
// Lo justo para correr las funciones reales de clientes.service.js (normalizar, fusionar) y hacer cumplir
// lo que la base real exige acá: el DNI único entre vigentes (`uq_clientes_dni_vigente`, 074), un identificador
// por canal, un perfil por cliente, "fusionado implica archivado" y cónyuge distinto del titular. Ningún modelo
// tiene delete ni deleteMany: un borrado físico revienta el test.
// Como el Prisma del esquema final, el modelo `clientes` no conoce `canal_id`: la columna solo se ve con SQL
// directo, mientras exista. `columnaCanalId: false` hace como si la 074 ya la hubiera sacado de la base.
// `indiceDni: false` hace como si la 074 todavía no hubiera creado el índice de DNI: es el estado en que se
// corre el script en producción, con DNI repetidos que la unificación tiene que dejar sin repetir.

const MODELOS = [
  "clientes",
  "cliente_canales",
  "cliente_fusiones",
  "cliente_perfiles",
  "chat_estado",
  "historial_mensajes",
  "ia_consumos",
  "verificacion_intentos",
  "alertas_stock",
  "entregas",
  "senas",
  "financiaciones",
  "consignacion_ingresos",
  "consentimientos",
  "consultas_crediticias",
];
const ESCRITURAS = ["create", "update", "updateMany"];
const CREADA = new Date("2026-10-01T12:00:00Z");
const FECHA = new Date("2026-10-10T12:00:00Z");

const DEFECTOS = {
  clientes: { nombre: null, telefono: null, dni: null, cuil: null, email: null, canal_id: null, deleted_at: null, fusionado_en_id: null, created_at: CREADA },
  cliente_perfiles: {
    apellido: null, cuit: null, domicilio: null, localidad: null, provincia: null,
    cbu: null, alias_cbu: null, banco_cbu: null, contacto_alt_telefono: null, contacto_alt_vinculo: null,
  },
  consignacion_ingresos: { conyuge_cliente_id: null },
};
const CLAVES_UNICAS = {
  clientes: (f) => (f.deleted_at == null && f.dni != null ? [`dni ${f.dni}`] : []),
  cliente_canales: (f) => [`canal ${f.canal} ${f.identificador}`],
  cliente_perfiles: (f) => [`cliente ${f.cliente_id}`],
};
const CHECKS = {
  clientes: (f) => f.fusionado_en_id == null || f.deleted_at != null,
  consignacion_ingresos: (f) => f.conyuge_cliente_id == null || f.conyuge_cliente_id !== f.cliente_id,
  cliente_perfiles: (f) => (f.contacto_alt_telefono == null) === (f.contacto_alt_vinculo == null),
};

const nulo = (valor) => valor === undefined || valor === null;
const restriccion = (code, mensaje) => Object.assign(new Error(mensaje), { code });

function coincide(fila, where = {}) {
  return Object.entries(where).every(([campo, esperado]) => {
    if (esperado === undefined) throw new Error(`Prisma ignora undefined: "${campo}" no filtraría nada`);
    if (campo === "OR") return esperado.some((condicion) => coincide(fila, condicion));
    if (esperado !== null && typeof esperado === "object") {
      if ("in" in esperado) return esperado.in.includes(fila[campo]);
      if ("not" in esperado) return nulo(esperado.not) ? !nulo(fila[campo]) : fila[campo] !== esperado.not;
      throw new Error(`Filtro no soportado por la base falsa: ${JSON.stringify(esperado)}`);
    }
    return nulo(esperado) ? nulo(fila[campo]) : fila[campo] === esperado;
  });
}

const proyectar = (fila, select) => (select ? Object.fromEntries(Object.keys(select).map((campo) => [campo, fila[campo]])) : { ...fila });

function ordenar(filas, orderBy) {
  if (!orderBy) return filas;
  const [[campo, sentido]] = Object.entries(orderBy);
  return [...filas].sort((a, b) => (a[campo] - b[campo]) * (sentido === "desc" ? -1 : 1));
}

function baseFalsa(semilla = {}, { columnaCanalId = true, indiceDni = true } = {}) {
  const tablas = Object.fromEntries(MODELOS.map((m) => [m, (semilla[m] ?? []).map((fila) => ({ ...DEFECTOS[m], ...fila }))]));
  const siguiente = Object.fromEntries(MODELOS.map((m) => [m, 1000]));
  const ganchos = new Map();
  const llamadas = [];
  const transacciones = { abiertas: 0, confirmadas: 0, revertidas: 0 };

  function validar(modelo, fila, actual) {
    const claves = modelo === "clientes" && !indiceDni ? null : CLAVES_UNICAS[modelo];
    if (claves) {
      const ocupadas = tablas[modelo].filter((f) => f !== actual).flatMap(claves);
      const choque = claves(fila).find((clave) => ocupadas.includes(clave));
      if (choque) throw restriccion("P2002", `Unique constraint failed on ${choque}`);
    }
    if (CHECKS[modelo] && !CHECKS[modelo](fila)) throw restriccion("P2004", `Check constraint failed on ${modelo}`);
  }

  // `diario` es null fuera de una transacción; dentro, junta cómo deshacer cada escritura.
  function modelo(nombre, diario) {
    const tabla = tablas[nombre];
    const buscar = (where) => tabla.filter((fila) => coincide(fila, where));
    const paso = async (metodo, args = {}) => {
      // El esquema final ya no tiene `canal_id`: Prisma rechaza cualquier consulta que la nombre.
      if (nombre === "clientes" && ["select", "where", "data"].some((parte) => args[parte] && "canal_id" in args[parte])) {
        throw new Error("Unknown field `canal_id` for model `clientes`");
      }
      llamadas.push({ modelo: nombre, metodo, args, enTransaccion: diario !== null });
      const clave = `${nombre}.${metodo}`;
      const gancho = ganchos.get(clave);
      ganchos.delete(clave);
      await gancho?.();
    };
    const aplicar = (fila, data, select) => {
      validar(nombre, { ...fila, ...data }, fila);
      const antes = { ...fila };
      Object.assign(fila, data);
      diario?.push(() => Object.assign(fila, antes));
      return proyectar(fila, select);
    };
    return {
      findUnique: async (args) => {
        await paso("findUnique", args);
        const [fila] = buscar(args.where);
        return fila ? proyectar(fila, args.select) : null;
      },
      findFirst: async (args = {}) => {
        await paso("findFirst", args);
        const [fila] = ordenar(buscar(args.where), args.orderBy);
        return fila ? proyectar(fila, args.select) : null;
      },
      findMany: async (args = {}) => {
        await paso("findMany", args);
        return ordenar(buscar(args.where), args.orderBy).map((fila) => proyectar(fila, args.select));
      },
      create: async (args) => {
        await paso("create", args);
        // Prisma serializa el JSON: un BigInt adentro revienta.
        const data = nombre === "cliente_fusiones" ? { ...args.data, detalle: JSON.parse(JSON.stringify(args.data.detalle)) } : args.data;
        const fila = { ...DEFECTOS[nombre], id: siguiente[nombre]++, ...data };
        validar(nombre, fila, null);
        tabla.push(fila);
        diario?.push(() => tabla.splice(tabla.indexOf(fila), 1));
        return proyectar(fila, args.select);
      },
      update: async (args) => {
        await paso("update", args);
        const [fila] = buscar(args.where);
        if (!fila) throw restriccion("P2025", "Record to update not found");
        return aplicar(fila, args.data, args.select);
      },
      updateMany: async (args) => {
        await paso("updateMany", args);
        const filas = buscar(args.where);
        filas.forEach((fila) => aplicar(fila, args.data));
        return { count: filas.length };
      },
    };
  }

  const vista = (diario) => Object.fromEntries(MODELOS.map((m) => [m, modelo(m, diario)]));
  // Sin `$transaction`: así llega el `tx` de Prisma dentro de una transacción.
  const tx = vista(null);
  const db = {
    ...tx,
    // El SQL directo: information_schema dice si la columna sigue existiendo y, mientras exista, el
    // SELECT de `canal_id` devuelve las fichas que lo tienen (con su `deleted_at`), con el id como BigInt
    // (así llega un INT UNSIGNED).
    $queryRaw: async (partes) => {
      const sql = partes.join("?");
      if (/information_schema/i.test(sql)) return [{ n: columnaCanalId ? 1n : 0n }];
      if (!/canal_id/.test(sql)) throw new Error(`SQL directo no soportado por la base falsa: ${sql}`);
      if (!columnaCanalId) throw new Error("Unknown column 'canal_id' in 'field list'");
      return tablas.clientes
        .filter((c) => c.canal_id != null && c.canal_id !== "")
        .sort((a, b) => a.id - b.id)
        .map(({ id, canal, canal_id, deleted_at }) => ({ id: BigInt(id), canal, canal_id, deleted_at }));
    },
    $transaction: async (tarea) => {
      transacciones.abiertas += 1;
      const diario = [];
      try {
        const resultado = await tarea(vista(diario));
        transacciones.confirmadas += 1;
        return resultado;
      } catch (e) {
        diario.reverse().forEach((deshacer) => deshacer());
        transacciones.revertidas += 1;
        throw e;
      }
    },
  };

  return {
    db,
    tx,
    transacciones,
    llamadas,
    // Corre `gancho` justo antes de la próxima llamada a "modelo.metodo": para simular a otro proceso o una caída.
    antes: (clave, gancho) => ganchos.set(clave, gancho),
    filas: (nombre) => tablas[nombre].map((fila) => ({ ...fila })),
    escrituras: () => llamadas.filter((l) => ESCRITURAS.includes(l.metodo)),
  };
}

const estado = (base) => Object.fromEntries(MODELOS.map((m) => [m, base.filas(m)]));
const ficha = (base, id) => base.filas("clientes").find((c) => c.id === id);
const canal = (id, cliente_id, identificador, tipo = "whatsapp") => ({ id, cliente_id, canal: tipo, identificador });

const WA = "5493884708347";
const TEL = "3884708347";

// Personas del escenario principal:
//  - Ana: la ficha web #10 y la de WhatsApp #11 (sin teléfono: su número solo está en el canal) → mismo teléfono.
//  - Pedro: #20 (DNI con puntos) y #21 (DNI limpio, teléfono con 549) → mismo DNI.
//  - Una familia: #30 y #31 comparten el teléfono con DNI distintos y #32 (WhatsApp) tiene ese número → dudosa.
//  - Luis #40 está solo y #50 es una ficha archivada con su mismo DNI: no cuenta.
//  - Perfiles: el de #11 pasa a #10 (que no tenía) y el de #21 completa al de #20 (los dos tenían).
// Es el estado de producción antes de la 074: sin el índice de DNI, con "30.111.222" y "30111222" repetidos.
function escenario(cambios = {}) {
  return baseFalsa(
    {
      clientes: [
        { id: 10, canal: "web", canal_id: "3887000101", nombre: "Ana", telefono: "3887000101", dni: "30000101" },
        { id: 11, canal: "whatsapp", canal_id: "5493887000101" },
        { id: 20, canal: "presencial", canal_id: "30.111.222", nombre: "Pedro", telefono: "3884001122", dni: "30.111.222" },
        { id: 21, canal: "web", canal_id: "5493884001122", nombre: "Pedro R.", telefono: "5493884001122", dni: "30111222" },
        { id: 30, canal: "web", canal_id: TEL, nombre: "Marta", telefono: TEL, dni: "30125678" },
        { id: 31, canal: "presencial", canal_id: "47544582", nombre: "Hijo de Marta", telefono: TEL, dni: "47544582" },
        { id: 32, canal: "whatsapp", canal_id: WA },
        { id: 40, canal: "web", canal_id: "3511234567", nombre: "Luis", telefono: "3511234567", dni: "20111222" },
        { id: 50, canal: "web", canal_id: "20111222", nombre: "Luis viejo", dni: "20111222", deleted_at: FECHA },
      ],
      cliente_canales: [canal(1, 11, "5493887000101"), canal(2, 32, WA)],
      cliente_perfiles: [
        { id: 1, cliente_id: 11, apellido: "Gómez" },
        { id: 2, cliente_id: 20, cuit: "20301112229" },
        { id: 3, cliente_id: 21, apellido: "Rojas" },
      ],
      chat_estado: [{ id: 1, cliente_id: 11 }, { id: 2, cliente_id: 11 }, { id: 3, cliente_id: 10 }, { id: 4, cliente_id: 32 }],
      historial_mensajes: [{ id: 100n, cliente_id: 11 }],
      financiaciones: [{ id: 700, cliente_id: 10 }],
      consignacion_ingresos: [{ id: 800, cliente_id: 21 }],
      senas: [{ id: 600, cliente_id: 20 }],
      ...cambios,
    },
    { indiceDni: false }
  );
}

const GRUPOS_ESCENARIO = [
  { destinoId: 10, origenes: [{ id: 11, motivo: "mismo_telefono" }] },
  { destinoId: 20, origenes: [{ id: 21, motivo: "mismo_dni" }] },
];

test("la base falsa exige el DNI único entre vigentes y un perfil por cliente, y no tiene borrado físico", async () => {
  const base = baseFalsa({
    clientes: [{ id: 1, dni: "30125678" }, { id: 2 }, { id: 3, dni: "30125678", deleted_at: FECHA }],
    cliente_perfiles: [{ id: 1, cliente_id: 1 }],
  });

  await assert.rejects(base.tx.clientes.update({ where: { id: 2 }, data: { dni: "30125678" } }), (e) => e.code === "P2002");
  await base.tx.clientes.update({ where: { id: 3 }, data: { nombre: "archivada" } });
  await assert.rejects(base.tx.cliente_perfiles.create({ data: { cliente_id: 1 } }), (e) => e.code === "P2002");
  await assert.rejects(
    base.tx.cliente_perfiles.create({ data: { cliente_id: 2, contacto_alt_telefono: "3884001122" } }),
    (e) => e.code === "P2004",
    "el teléfono alternativo no va sin su vínculo"
  );
  for (const modelo of Object.values(base.tx)) {
    assert.equal(modelo.delete, undefined);
    assert.equal(modelo.deleteMany, undefined);
  }
});

test("sin el índice de DNI (antes de la 074) la base falsa deja repetir el DNI entre vigentes", async () => {
  const base = baseFalsa({ clientes: [{ id: 1, dni: "30125678" }, { id: 2 }] }, { indiceDni: false });

  await base.tx.clientes.update({ where: { id: 2 }, data: { dni: "30125678" } });

  assert.deepEqual(base.filas("clientes").map((c) => c.dni), ["30125678", "30125678"]);
});

// ── La prueba ──

test("la prueba arma el plan con los datos normalizados y cuenta lo que normalizaría, sin escribir nada", async () => {
  const base = escenario();
  const antes = estado(base);

  const resultado = await ejecutarUnificacion({ db: base.db, aplicar: false });

  assert.equal(resultado.aplicar, false);
  assert.equal(resultado.fichasVigentes, 8);
  assert.deepEqual(resultado.plan.grupos, GRUPOS_ESCENARIO);
  assert.deepEqual(resultado.plan.dudosos, [
    {
      telefono: TEL,
      fichas: [
        { id: 30, dni: "30125678", canal: "web", nombre: "Marta" },
        { id: 31, dni: "47544582", canal: "presencial", nombre: "Hijo de Marta" },
        { id: 32, dni: null, canal: "whatsapp", nombre: null },
      ],
    },
  ]);
  assert.deepEqual(resultado.normalizado, {
    telefonos: [
      { id: 11, antes: null, despues: "3887000101" },
      { id: 21, antes: "5493884001122", despues: "3884001122" },
      { id: 32, antes: null, despues: TEL },
    ],
    dnis: [{ id: 20, antes: "30.111.222", despues: "30111222" }],
  });
  assert.deepEqual([resultado.fusiones, resultado.errores], [[], []]);
  assert.deepEqual(base.escrituras(), [], "ni un create, update ni updateMany");
  assert.equal(base.transacciones.abiertas, 0);
  assert.deepEqual(estado(base), antes);
});

test("solo escribe con aplicar: true; cualquier otro valor (omitido, 'false', 1) es la prueba", async () => {
  for (const opciones of [{}, { aplicar: undefined }, { aplicar: "false" }, { aplicar: 1 }, { aplicar: "--aplicar" }]) {
    const base = escenario();

    const resultado = await ejecutarUnificacion({ db: base.db, ...opciones });

    assert.equal(resultado.aplicar, false, JSON.stringify(opciones));
    assert.deepEqual(base.escrituras(), [], JSON.stringify(opciones));
  }
});

test("la prueba dice qué tiene cada ficha del plan: consultas, financiaciones, trámites y señas", async () => {
  const base = escenario();

  const { fichas } = await ejecutarUnificacion({ db: base.db });

  assert.deepEqual(Object.keys(fichas), ["10", "11", "20", "21", "30", "31", "32"], "las del plan y las dudosas; Luis no entra");
  assert.deepEqual(fichas[10], { id: 10, nombre: "Ana", canal: "web", telefono: "3887000101", dni: "30000101", consultas: 1, financiaciones: 1, tramites: 0, senas: 0 });
  assert.deepEqual(fichas[11], { id: 11, nombre: null, canal: "whatsapp", telefono: "3887000101", dni: null, consultas: 2, financiaciones: 0, tramites: 0, senas: 0 });
  assert.deepEqual([fichas[20].dni, fichas[20].senas, fichas[21].telefono, fichas[21].tramites], ["30111222", 1, "3884001122", 1], "se ve la ficha ya normalizada");
  assert.deepEqual([fichas[32].consultas, fichas[30].consultas, fichas[31].financiaciones], [1, 0, 0]);
});

test("sin fichas, o sin nada para unificar, no hay grupos, dudosos ni fichas a revisar y no se consulta el contenido", async () => {
  const vacia = baseFalsa();
  const sinNada = baseFalsa({ clientes: [{ id: 1, canal: "web", telefono: TEL, dni: "30125678" }, { id: 2, canal: "web", telefono: "3511234567" }] });

  for (const base of [vacia, sinNada]) {
    const resultado = await ejecutarUnificacion({ db: base.db, aplicar: true });
    assert.deepEqual(resultado.plan, { grupos: [], dudosos: [], revisar: [] });
    assert.deepEqual([resultado.fichas, resultado.fusiones, resultado.errores], [{}, [], []]);
    assert.ok(base.llamadas.every((l) => l.modelo !== "chat_estado" && l.modelo !== "senas"));
  }
  assert.equal(vacia.llamadas.some((l) => l.modelo === "clientes" && l.metodo === "findMany"), true);
});

test("si falla la lectura el error sube y no se escribe nada", async () => {
  const base = escenario();
  base.antes("clientes.findMany", () => {
    throw new Error("se cayó la conexión");
  });

  await assert.rejects(ejecutarUnificacion({ db: base.db, aplicar: true }), /se cayó la conexión/);

  assert.deepEqual(base.escrituras(), []);
});

// ── --aplicar ──

test("--aplicar normaliza y fusiona lo que dice el plan, cada fusión en su transacción", async () => {
  const base = escenario();

  const resultado = await ejecutarUnificacion({ db: base.db, aplicar: true });

  assert.equal(resultado.aplicar, true);
  assert.deepEqual(resultado.errores, []);
  assert.deepEqual(
    resultado.fusiones.map(({ origenId, destinoId, motivo }) => ({ origenId, destinoId, motivo })),
    [
      { origenId: 11, destinoId: 10, motivo: "mismo_telefono" },
      { origenId: 21, destinoId: 20, motivo: "mismo_dni" },
    ]
  );
  assert.equal(base.transacciones.confirmadas, 2, "una transacción por fusión");
  assert.deepEqual(
    base.filas("cliente_fusiones").map((f) => [f.id, f.origen_id, f.destino_id, f.motivo]),
    resultado.fusiones.map((f) => [f.fusionId, f.origenId, f.destinoId, f.motivo]),
    "cada fusión informa el id de su fila en cliente_fusiones"
  );
  assert.deepEqual([ficha(base, 11).fusionado_en_id, ficha(base, 21).fusionado_en_id], [10, 20]);
  assert.ok(ficha(base, 11).deleted_at instanceof Date && ficha(base, 21).deleted_at instanceof Date, "los orígenes quedan archivados");
  assert.deepEqual(base.filas("chat_estado").map((c) => [c.id, c.cliente_id]), [[1, 10], [2, 10], [3, 10], [4, 32]], "las consultas pasan al destino");
  assert.deepEqual(base.filas("cliente_canales").map((c) => [c.id, c.cliente_id]), [[1, 10], [2, 32]], "el número de WhatsApp pasa al destino");
});

test("--aplicar normaliza antes de fusionar: las fichas que quedan tienen teléfono y DNI solo con dígitos", async () => {
  const base = escenario();

  await ejecutarUnificacion({ db: base.db, aplicar: true });

  assert.deepEqual([ficha(base, 20).dni, ficha(base, 20).telefono], ["30111222", "3884001122"]);
  assert.deepEqual([ficha(base, 21).dni, ficha(base, 21).telefono], ["30111222", "3884001122"]);
  assert.deepEqual([ficha(base, 11).telefono, ficha(base, 32).telefono], ["3887000101", TEL], "el teléfono sale del número de WhatsApp");
});

// El chequeo previo de la 074: SELECT dni, COUNT(*) FROM clientes WHERE deleted_at IS NULL … HAVING COUNT(*) > 1.
const dnisRepetidosEntreVigentes = (base) => {
  const dnis = base.filas("clientes").filter((c) => c.deleted_at == null && c.dni != null).map((c) => c.dni);
  return [...new Set(dnis.filter((dni, i) => dnis.indexOf(dni) !== i))];
};

test("después de --aplicar no queda ningún DNI repetido entre fichas vigentes: la 074 puede crear su índice", async () => {
  const base = escenario();
  assert.deepEqual(base.filas("clientes").filter((c) => c.id === 20 || c.id === 21).map((c) => c.dni), ["30.111.222", "30111222"]);

  await ejecutarUnificacion({ db: base.db, aplicar: true });

  assert.deepEqual(dnisRepetidosEntreVigentes(base), []);
  assert.deepEqual(base.filas("clientes").filter((c) => c.dni === "30111222").map((c) => [c.id, c.deleted_at !== null]), [[20, false], [21, true]]);
});

test("--aplicar une también los perfiles, respetando un perfil por cliente: el del origen pasa o completa al del destino", async () => {
  const base = escenario();

  const resultado = await ejecutarUnificacion({ db: base.db, aplicar: true });

  assert.deepEqual(resultado.errores, []);
  assert.deepEqual(resultado.fusiones.map((f) => f.perfil), ["movido", "completado"]);
  const [deAna, dePedro, sobrante] = base.filas("cliente_perfiles");
  assert.deepEqual([deAna.cliente_id, deAna.apellido], [10, "Gómez"], "el perfil de #11 pasó a #10, que no tenía");
  assert.deepEqual([dePedro.cliente_id, dePedro.cuit, dePedro.apellido], [20, "20301112229", "Rojas"], "el de #20 se completó sin pisar su CUIT");
  assert.equal(sobrante.cliente_id, 21, "el de #21 queda con la ficha archivada");
});

test("--aplicar no toca a los dudosos: no se fusionan ni se archivan", async () => {
  const base = escenario();

  const resultado = await ejecutarUnificacion({ db: base.db, aplicar: true });

  assert.equal(resultado.plan.dudosos.length, 1);
  for (const id of [30, 31, 32, 40]) {
    assert.deepEqual([ficha(base, id).deleted_at, ficha(base, id).fusionado_en_id], [null, null], `#${id}`);
  }
  assert.ok(base.filas("cliente_fusiones").every((f) => ![30, 31, 32, 40].includes(f.origen_id) && ![30, 31, 32, 40].includes(f.destino_id)));
  assert.equal(base.filas("chat_estado").find((c) => c.id === 4).cliente_id, 32);
});

test("la prueba y --aplicar cuentan lo mismo: el plan, lo que se normaliza y qué tiene cada ficha", async () => {
  const prueba = await ejecutarUnificacion({ db: escenario().db, aplicar: false });
  const aplicada = await ejecutarUnificacion({ db: escenario().db, aplicar: true });

  for (const campo of ["fichasVigentes", "plan", "normalizado", "fichas", "canales"]) {
    assert.deepEqual(prueba[campo], aplicada[campo], campo);
  }
});

test("una fusión que no se puede hacer se informa y no corta las otras", async () => {
  const base = baseFalsa({
    clientes: [
      { id: 60, canal: "web", nombre: "Beto", telefono: "3511111111", dni: "20111333" },
      { id: 61, canal: "whatsapp" },
      { id: 62, canal: "web", telefono: "351 111-1111" },
      { id: 63, canal: "web", nombre: "Carla", telefono: "3512222222", dni: "20999888" },
      { id: 64, canal: "whatsapp" },
    ],
    cliente_canales: [canal(1, 61, "5493511111111"), canal(2, 64, "5493512222222")],
    // Titular y cónyuge del mismo ingreso: la fusión de #61 en #60 no es posible.
    consignacion_ingresos: [{ id: 801, cliente_id: 60, conyuge_cliente_id: 61 }],
  });

  const resultado = await ejecutarUnificacion({ db: base.db, aplicar: true });

  assert.deepEqual(resultado.plan.grupos, [
    { destinoId: 60, origenes: [{ id: 61, motivo: "mismo_telefono" }, { id: 62, motivo: "mismo_telefono" }] },
    { destinoId: 63, origenes: [{ id: 64, motivo: "mismo_telefono" }] },
  ]);
  assert.equal(resultado.errores.length, 1);
  assert.deepEqual(
    { origenId: resultado.errores[0].origenId, destinoId: resultado.errores[0].destinoId, motivo: resultado.errores[0].motivo, status: resultado.errores[0].status },
    { origenId: 61, destinoId: 60, motivo: "mismo_telefono", status: 409 }
  );
  assert.match(resultado.errores[0].mensaje, /cónyuge/);
  assert.deepEqual(resultado.fusiones.map((f) => f.origenId), [62, 64], "las demás siguen, también las de otros grupos");
  assert.equal(ficha(base, 61).deleted_at, null, "la que falló queda vigente");
  assert.ok(ficha(base, 62).deleted_at && ficha(base, 64).deleted_at);
});

test("una fusión que falla a la mitad se deshace entera y no corta las otras", async () => {
  const base = baseFalsa({
    clientes: [
      { id: 70, canal: "web", nombre: "Dora", telefono: "3513333333", dni: "20444555" },
      { id: 71, canal: "whatsapp" },
      { id: 72, canal: "web", telefono: "3513333333" },
    ],
    cliente_canales: [canal(1, 71, "5493513333333")],
    chat_estado: [{ id: 910, cliente_id: 71 }],
    senas: [{ id: 900, cliente_id: 71 }],
  });
  base.antes("senas.updateMany", () => {
    throw new Error("se cayó la conexión");
  });

  const resultado = await ejecutarUnificacion({ db: base.db, aplicar: true });

  assert.deepEqual(resultado.errores.map((e) => [e.origenId, e.mensaje]), [[71, "se cayó la conexión"]]);
  assert.deepEqual(resultado.fusiones.map((f) => f.origenId), [72]);
  assert.equal(base.transacciones.revertidas, 1);
  assert.deepEqual([ficha(base, 71).deleted_at, ficha(base, 71).fusionado_en_id], [null, null], "el origen no quedó a medio archivar");
  assert.equal(base.filas("chat_estado")[0].cliente_id, 71, "ni sus consultas a medio mover");
  assert.equal(base.filas("cliente_canales")[0].cliente_id, 71);
});

test("una fusión que falla con algo que no es un Error se informa igual, con su texto y sin estado", async () => {
  const base = baseFalsa({
    clientes: [
      { id: 70, canal: "web", telefono: "3513333333", dni: "20444555" },
      { id: 72, canal: "web", telefono: "3513333333" },
    ],
    senas: [{ id: 900, cliente_id: 72 }],
  });
  base.antes("senas.updateMany", () => {
    throw "se cortó la red"; // a propósito: un texto, no un Error
  });

  const resultado = await ejecutarUnificacion({ db: base.db, aplicar: true });

  assert.deepEqual(
    resultado.errores.map(({ origenId, destinoId, status, mensaje }) => ({ origenId, destinoId, status, mensaje })),
    [{ origenId: 72, destinoId: 70, status: null, mensaje: "se cortó la red" }]
  );
  assert.equal(ficha(base, 72).deleted_at, null);
});

test("es repetible: la segunda vez no encuentra nada que hacer", async () => {
  const base = escenario();
  await ejecutarUnificacion({ db: base.db, aplicar: true });
  const despuesDeLaPrimera = estado(base);

  const segunda = await ejecutarUnificacion({ db: base.db, aplicar: true });

  assert.deepEqual(segunda.plan.grupos, []);
  assert.deepEqual(segunda.normalizado, { telefonos: [], dnis: [] });
  assert.deepEqual([segunda.fusiones, segunda.errores], [[], []]);
  assert.deepEqual(
    segunda.canales,
    { omitido: false, sinVincular: [], enOtraFicha: [], vinculados: [], omitidos: [] },
    "las fichas archivadas por la fusión conservan su canal_id: no son un caso nuevo cada vez"
  );
  assert.deepEqual(estado(base), despuesDeLaPrimera);
});

test("nunca borra: ninguna fila desaparece y la base falsa ni siquiera tiene delete", async () => {
  const base = escenario();
  const filasAntes = Object.fromEntries(MODELOS.map((m) => [m, base.filas(m).length]));
  for (const modelo of Object.values(base.tx)) {
    assert.equal(modelo.delete, undefined);
    assert.equal(modelo.deleteMany, undefined);
  }

  const resultado = await ejecutarUnificacion({ db: base.db, aplicar: true });

  assert.deepEqual(resultado.errores, [], "un delete en medio de una fusión aparecería como error");
  for (const modelo of MODELOS) {
    const ahora = base.filas(modelo).length;
    assert.ok(ahora >= filasAntes[modelo], `${modelo}: ${filasAntes[modelo]} → ${ahora}`);
  }
  assert.equal(base.filas("clientes").length, filasAntes.clientes);
});

test("el resultado se puede guardar como JSON tal cual: sin BigInt ni valores que se pierdan", async () => {
  const base = escenario();

  const resultado = await ejecutarUnificacion({ db: base.db, aplicar: true });

  assert.deepEqual(JSON.parse(JSON.stringify(resultado)), resultado);
});

// ── Paso 0: vincular los canales que quedaron sin fila ──

// Eva: la ficha web #80 y la de WhatsApp #81, que el backend viejo creó sin fila en cliente_canales.
// También hay un Instagram sin vincular (#82) y varias fichas que no hay que vincular.
function escenarioDeCanales() {
  return baseFalsa({
    clientes: [
      { id: 80, canal: "web", canal_id: "3514444444", nombre: "Eva", telefono: "3514444444", dni: "20555666" },
      { id: 81, canal: "whatsapp", canal_id: "5493514444444" },
      { id: 82, canal: "instagram", canal_id: "ig_eva", nombre: "Eva IG" },
      { id: 83, canal: "whatsapp", canal_id: "5493515555555", nombre: "Ya vinculada" },
      { id: 84, canal: "web", canal_id: "web-sesion-1", nombre: "Web" },
      { id: 85, canal: "whatsapp", canal_id: null },
      { id: 86, canal: "whatsapp", canal_id: "" },
      { id: 87, canal: "whatsapp", canal_id: "5493516666666", deleted_at: FECHA, fusionado_en_id: 80 },
    ],
    cliente_canales: [canal(1, 83, "5493515555555"), canal(2, 80, "5493516666666")],
  });
}

const A_VINCULAR = [
  { cliente_id: 81, canal: "whatsapp", identificador: "5493514444444" },
  { cliente_id: 82, canal: "instagram", identificador: "ig_eva" },
];
const vinculos = (base) => base.filas("cliente_canales").map(({ cliente_id, canal: tipo, identificador }) => ({ cliente_id, canal: tipo, identificador }));

test("la prueba informa cuántos canales vincularía y no escribe nada", async () => {
  const base = escenarioDeCanales();
  const antes = estado(base);

  const { canales } = await ejecutarUnificacion({ db: base.db, aplicar: false });

  assert.deepEqual(canales, { omitido: false, sinVincular: A_VINCULAR, enOtraFicha: [], vinculados: [], omitidos: [] });
  assert.deepEqual(base.escrituras(), []);
  assert.deepEqual(estado(base), antes);
});

test("solo vincula WhatsApp, Facebook e Instagram con canal_id que nadie tiene vinculado: ni web, ni vacíos, ni los ya vinculados", async () => {
  const { canales } = await ejecutarUnificacion({ db: escenarioDeCanales().db });

  const ids = canales.sinVincular.map((v) => v.cliente_id);
  assert.deepEqual(ids, [81, 82]);
  assert.ok(!ids.includes(83), "ya tiene su fila");
  assert.ok(!ids.includes(84), "web no es un canal de mensajería");
  assert.ok(!ids.includes(85) && !ids.includes(86), "sin identificador");
  assert.ok(!ids.includes(87), "su número ya está vinculado a la ficha en la que se fusionó");
  assert.deepEqual(canales.enOtraFicha, [], "la archivada que se fusionó (#87) tampoco es un caso: su número pasó a #80 a propósito");
});

test("un mismo identificador en otro canal no cuenta como ya vinculado: lo único es el par canal + identificador", async () => {
  const base = baseFalsa({
    clientes: [{ id: 1, canal: "whatsapp", canal_id: "12345" }, { id: 2, canal: "instagram" }],
    cliente_canales: [canal(1, 2, "12345", "instagram")],
  });

  const { canales } = await ejecutarUnificacion({ db: base.db });

  assert.deepEqual(canales.sinVincular, [{ cliente_id: 1, canal: "whatsapp", identificador: "12345" }]);
});

test("--aplicar vincula primero: el número entra en la ficha que se fusiona y termina en el destino", async () => {
  const base = escenarioDeCanales();

  const resultado = await ejecutarUnificacion({ db: base.db, aplicar: true });

  assert.deepEqual(resultado.canales.vinculados, A_VINCULAR);
  assert.deepEqual(resultado.errores, []);
  assert.deepEqual(resultado.plan.grupos, [{ destinoId: 80, origenes: [{ id: 81, motivo: "mismo_telefono" }] }], "el número recién vinculado alcanza para reconocerla");
  assert.deepEqual(resultado.normalizado.telefonos, [
    { id: 81, antes: null, despues: "3514444444" },
    { id: 83, antes: null, despues: "3515555555" },
  ]);
  assert.deepEqual(vinculos(base), [
    { cliente_id: 83, canal: "whatsapp", identificador: "5493515555555" },
    { cliente_id: 80, canal: "whatsapp", identificador: "5493516666666" },
    { cliente_id: 80, canal: "whatsapp", identificador: "5493514444444" },
    { cliente_id: 82, canal: "instagram", identificador: "ig_eva" },
  ]);
});

test("la prueba cuenta lo mismo que --aplicar aunque haya canales sin vincular", async () => {
  const prueba = await ejecutarUnificacion({ db: escenarioDeCanales().db, aplicar: false });
  const aplicada = await ejecutarUnificacion({ db: escenarioDeCanales().db, aplicar: true });

  assert.deepEqual(prueba.plan, aplicada.plan);
  assert.deepEqual(prueba.normalizado, aplicada.normalizado);
  assert.deepEqual(prueba.fichas, aplicada.fichas);
  assert.deepEqual(prueba.canales.sinVincular, aplicada.canales.sinVincular);
});

test("vincular se puede repetir sin duplicar nada", async () => {
  const base = escenarioDeCanales();
  await ejecutarUnificacion({ db: base.db, aplicar: true });
  const filas = base.filas("cliente_canales").length;

  const segunda = await ejecutarUnificacion({ db: base.db, aplicar: true });

  assert.deepEqual(segunda.canales, { omitido: false, sinVincular: [], enOtraFicha: [], vinculados: [], omitidos: [] });
  assert.equal(base.filas("cliente_canales").length, filas);
});

test("si otro proceso vincula el mismo número mientras tanto, ese se informa como omitido y la ficha se une con la que lo tiene", async () => {
  const base = escenarioDeCanales();
  base.antes("cliente_canales.create", async () => {
    await base.tx.cliente_canales.create({ data: { cliente_id: 80, canal: "whatsapp", identificador: "5493514444444" } });
  });

  const resultado = await ejecutarUnificacion({ db: base.db, aplicar: true });

  assert.deepEqual(resultado.canales.vinculados.map((v) => v.cliente_id), [82]);
  assert.deepEqual(resultado.canales.omitidos, [{ cliente_id: 81, canal: "whatsapp", identificador: "5493514444444" }]);
  assert.equal(base.filas("cliente_canales").filter((c) => c.identificador === "5493514444444").length, 1);
  assert.deepEqual(resultado.errores, []);
  assert.deepEqual(
    resultado.plan.grupos,
    [{ destinoId: 80, origenes: [{ id: 81, motivo: "mismo_telefono" }] }],
    "el número de la omitida cuenta como su WhatsApp: sin eso perdería su única llave cuando la 074 saque canal_id"
  );
});

test("un error que no es de duplicado al vincular corta antes de normalizar o fusionar", async () => {
  const base = escenarioDeCanales();
  base.antes("cliente_canales.create", () => {
    throw new Error("se cayó la conexión");
  });

  await assert.rejects(ejecutarUnificacion({ db: base.db, aplicar: true }), /se cayó la conexión/);

  assert.deepEqual(base.escrituras().map((e) => `${e.modelo}.${e.metodo}`), ["cliente_canales.create"]);
});

test("si la 074 ya sacó canal_id, el paso se saltea solo y lo demás sigue andando", async () => {
  const base = baseFalsa(
    {
      clientes: [
        { id: 90, canal: "web", nombre: "Fer", telefono: "3516666666", dni: "20777888" },
        { id: 91, canal: "whatsapp" },
      ],
      cliente_canales: [canal(1, 91, "5493516666666")],
    },
    { columnaCanalId: false }
  );

  const prueba = await ejecutarUnificacion({ db: base.db, aplicar: false });
  const aplicada = await ejecutarUnificacion({ db: base.db, aplicar: true });

  for (const resultado of [prueba, aplicada]) {
    assert.deepEqual(resultado.canales, { omitido: true, sinVincular: [], enOtraFicha: [], vinculados: [], omitidos: [] });
    assert.deepEqual(resultado.plan.grupos, [{ destinoId: 90, origenes: [{ id: 91, motivo: "mismo_telefono" }] }]);
  }
  assert.deepEqual(aplicada.errores, []);
  assert.equal(ficha(base, 91).fusionado_en_id, 90);
});

// Producción, entre el backend nuevo (su Prisma ya no conoce canal_id) y la 074 (la columna sigue en la base).
test("el paso de canales anda con el Prisma del esquema final: lee canal_id con SQL directo y deja los ids como números", async () => {
  const base = baseFalsa({
    clientes: [
      { id: 90, canal: "web", nombre: "Fer", telefono: "3516666666", dni: "20777888" },
      { id: 91, canal: "whatsapp", canal_id: "5493516666666" },
    ],
  });

  const resultado = await ejecutarUnificacion({ db: base.db, aplicar: true });

  assert.deepEqual(resultado.canales.vinculados, [{ cliente_id: 91, canal: "whatsapp", identificador: "5493516666666" }]);
  assert.equal(typeof resultado.canales.vinculados[0].cliente_id, "number", "un BigInt no entra en el informe JSON");
  assert.deepEqual(resultado.plan.grupos, [{ destinoId: 90, origenes: [{ id: 91, motivo: "mismo_telefono" }] }]);
  assert.deepEqual(resultado.errores, []);
  assert.deepEqual(vinculos(base), [{ cliente_id: 90, canal: "whatsapp", identificador: "5493516666666" }]);
});

// ── Paso 0: la ficha que se quedaría sin llave ──

// #100: la ficha de WhatsApp que el bot viejo creó entre la 073 y el backend nuevo. Tiene el número en canal_id,
// pero ni teléfono ni fila en cliente_canales. #101: la que el backend nuevo creó después para el mismo número, ya
// vinculada. El paso 0 no puede vincular a #100 (el par ya es de #101) y, sin teléfono, el plan no las une: la 074
// le sacaría a #100 su única llave y las dos quedarían duplicadas para siempre.
function escenarioFichaSinLlave(cambios = {}) {
  return baseFalsa({
    clientes: [
      { id: 100, canal: "whatsapp", canal_id: WA },
      { id: 101, canal: "whatsapp", nombre: "Joel", telefono: TEL },
    ],
    cliente_canales: [canal(1, 101, WA)],
    chat_estado: [{ id: 1, cliente_id: 100 }, { id: 2, cliente_id: 101 }],
    ...cambios,
  });
}

const SIN_LLAVE = { cliente_id: 100, canal: "whatsapp", identificador: WA, vinculado_a: 101 };
const UNIDAS = [{ origenId: 101, destinoId: 100, motivo: "mismo_telefono" }];

test("la prueba detecta la ficha cuyo número ya es de otra, lo cuenta como su WhatsApp y las une por teléfono, sin escribir nada", async () => {
  const base = escenarioFichaSinLlave();
  const antes = estado(base);

  const resultado = await ejecutarUnificacion({ db: base.db });

  assert.deepEqual(resultado.canales, { omitido: false, sinVincular: [], enOtraFicha: [SIN_LLAVE], vinculados: [], omitidos: [] });
  assert.deepEqual(resultado.normalizado.telefonos, [{ id: 100, antes: null, despues: TEL }], "recibe su teléfono de 10 dígitos");
  assert.deepEqual(resultado.plan.grupos, [{ destinoId: 100, origenes: [{ id: 101, motivo: "mismo_telefono" }] }]);
  assert.deepEqual(base.escrituras(), []);
  assert.deepEqual(estado(base), antes);
});

test("--aplicar las deja unidas: la ficha recibe el teléfono y la llave de la otra pasa a ella", async () => {
  const base = escenarioFichaSinLlave();

  const resultado = await ejecutarUnificacion({ db: base.db, aplicar: true });

  assert.deepEqual(resultado.errores, []);
  assert.deepEqual(resultado.fusiones.map(({ origenId, destinoId, motivo }) => ({ origenId, destinoId, motivo })), UNIDAS);
  assert.deepEqual([ficha(base, 100).telefono, ficha(base, 100).nombre], [TEL, "Joel"]);
  assert.ok(ficha(base, 101).deleted_at instanceof Date);
  assert.equal(ficha(base, 101).fusionado_en_id, 100);
  assert.deepEqual(base.filas("cliente_canales").map((c) => [c.cliente_id, c.canal, c.identificador]), [[100, "whatsapp", WA]], "la llave quedó en la ficha vigente");
  assert.deepEqual(base.filas("chat_estado").map((c) => c.cliente_id), [100, 100]);
});

test("la prueba cuenta lo mismo que --aplicar con una ficha sin llave", async () => {
  const prueba = await ejecutarUnificacion({ db: escenarioFichaSinLlave().db, aplicar: false });
  const aplicada = await ejecutarUnificacion({ db: escenarioFichaSinLlave().db, aplicar: true });

  assert.equal(prueba.plan.grupos.length, 1, "hay algo que contar: la ficha sin llave se une con la otra");
  assert.equal(prueba.canales.enOtraFicha.length, 1);
  for (const campo of ["fichasVigentes", "plan", "normalizado", "fichas", "canales"]) {
    assert.deepEqual(prueba[campo], aplicada[campo], campo);
  }
});

test("con una ficha sin llave --aplicar es repetible: la segunda vez no encuentra nada que hacer", async () => {
  const base = escenarioFichaSinLlave();
  await ejecutarUnificacion({ db: base.db, aplicar: true });
  const despuesDeLaPrimera = estado(base);

  const segunda = await ejecutarUnificacion({ db: base.db, aplicar: true });

  assert.deepEqual(segunda.canales, { omitido: false, sinVincular: [], enOtraFicha: [], vinculados: [], omitidos: [] });
  assert.deepEqual(segunda.plan, { grupos: [], dudosos: [], revisar: [] });
  assert.deepEqual(segunda.normalizado, { telefonos: [], dnis: [] });
  assert.deepEqual([segunda.fusiones, segunda.errores], [[], []]);
  assert.deepEqual(estado(base), despuesDeLaPrimera);
});

test("la ficha sin llave respeta la regla de dudosos: si el teléfono tiene dos DNI distintos no se une nada", async () => {
  const base = escenarioFichaSinLlave({
    clientes: [
      { id: 100, canal: "whatsapp", canal_id: WA },
      { id: 101, canal: "whatsapp", nombre: "Joel", telefono: TEL, dni: "30125678" },
      { id: 102, canal: "presencial", nombre: "Hijo", telefono: TEL, dni: "47544582" },
    ],
  });

  const resultado = await ejecutarUnificacion({ db: base.db, aplicar: true });

  assert.deepEqual(resultado.plan.grupos, []);
  assert.deepEqual(resultado.plan.dudosos.map((d) => [d.telefono, d.fichas.map((f) => f.id)]), [[TEL, [100, 101, 102]]]);
  assert.deepEqual([resultado.fusiones, resultado.errores], [[], []]);
  assert.equal(ficha(base, 100).telefono, TEL, "queda a la vista entre los dudosos, no perdida");
  assert.deepEqual(base.filas("cliente_canales").map((c) => c.cliente_id), [101]);
});

test("solo cuentan las fichas de mensajería vigentes: una web con el mismo canal_id o una archivada no son un caso", async () => {
  const base = baseFalsa({
    clientes: [
      { id: 1, canal: "web", canal_id: WA, nombre: "Web", telefono: "3511111111" },
      { id: 2, canal: "whatsapp", canal_id: WA, deleted_at: FECHA },
      { id: 3, canal: "whatsapp", nombre: "Joel", telefono: TEL },
    ],
    cliente_canales: [canal(1, 3, WA)],
  });

  const { canales } = await ejecutarUnificacion({ db: base.db });

  assert.deepEqual([canales.sinVincular, canales.enOtraFicha], [[], []]);
});

test("con una ficha sin llave el resultado también se guarda como JSON tal cual", async () => {
  const resultado = await ejecutarUnificacion({ db: escenarioFichaSinLlave().db, aplicar: true });

  assert.deepEqual(JSON.parse(JSON.stringify(resultado)), resultado);
});

test("los WhatsApp de las fichas se leen una sola vez para los teléfonos: el plan no arma su propio mapa", async () => {
  const base = escenario();

  await ejecutarUnificacion({ db: base.db });

  const lecturas = base.llamadas.filter((l) => l.modelo === "cliente_canales" && l.metodo === "findMany" && l.args?.where?.canal === "whatsapp");
  assert.equal(lecturas.length, 1);
});

// ── Fichas con un DNI que no es un DNI ──

// #1 y #2 tienen el mismo "S/D" y #4 un pasaporte: sin el índice de la 074 (que esos dos repetidos romperían,
// y lo cubre la migración) conviven con #3, que comparte teléfono con #1.
function escenarioARevisar() {
  return baseFalsa(
    {
      clientes: [
        { id: 1, canal: "web", nombre: "Sin Datos", telefono: TEL, dni: "S/D" },
        { id: 2, canal: "presencial", nombre: "Otro Sin Datos", telefono: "3511111111", dni: "S/D" },
        { id: 3, canal: "web", nombre: "Joel", telefono: TEL },
        { id: 4, canal: "presencial", nombre: "Extranjero", telefono: "3512222222", dni: "AB123456" },
      ],
    },
    { indiceDni: false }
  );
}

test("las fichas con un DNI que no es un DNI van aparte, a revisar: no se unen por nada y no se tocan", async () => {
  const base = escenarioARevisar();
  const antes = estado(base);

  const resultado = await ejecutarUnificacion({ db: base.db, aplicar: true });

  assert.deepEqual(resultado.plan, {
    grupos: [],
    dudosos: [],
    revisar: [
      { id: 1, motivo: "dni_no_valido" },
      { id: 2, motivo: "dni_no_valido" },
      { id: 4, motivo: "dni_no_valido" },
    ],
  });
  assert.deepEqual([resultado.fusiones, resultado.errores, resultado.fichas], [[], [], {}]);
  assert.deepEqual(estado(base), antes, "ni siquiera se les normaliza nada: ya estaban en su forma de comparar");
});

test("el informe de las fichas a revisar muestra solo sus ids, nunca el valor del documento", async () => {
  const resultado = await ejecutarUnificacion({ db: escenarioARevisar().db });

  const texto = textoDelInforme(resultado);

  assert.match(texto, /A revisar a mano: 3 \(el DNI no es de 7 a 9 dígitos; no se une nada por ellas\)/);
  assert.match(texto, /^ {2}#1, #2, #4$/m);
  assert.doesNotMatch(texto, /S\/D|AB123456/);
  assert.doesNotMatch(JSON.stringify(resultado.plan.revisar), /S\/D|AB123456/);
});

test("el informe sin fichas a revisar lo dice, y con muchas muestra unas y cuenta las demás", async () => {
  const sinNada = textoDelInforme(await ejecutarUnificacion({ db: baseFalsa().db }));
  assert.match(sinNada, /A revisar a mano: 0/);

  const clientes = Array.from({ length: 25 }, (_, i) => ({ id: i + 1, canal: "web", dni: "S/D" }));
  const resultado = await ejecutarUnificacion({ db: baseFalsa({ clientes }, { indiceDni: false }).db });
  const texto = textoDelInforme(resultado);

  assert.match(texto, /A revisar a mano: 25/);
  assert.match(texto, /^ {2}#1, #2, #3,.*#20$/m);
  assert.match(texto, /… y 5 más/);
  assert.equal(resultado.plan.revisar.length, 25, "el JSON las trae todas");
});

// ── El informe en texto ──

test("el texto de la prueba muestra los grupos con su motivo y su contenido, los dudosos y lo que normalizaría", async () => {
  const resultado = await ejecutarUnificacion({ db: escenario().db });

  const texto = textoDelInforme(resultado, { base: "localhost:3306/agencia" });

  assert.match(texto, /^PRUEBA: no se escribió nada en la base \(localhost:3306\/agencia\)\./);
  assert.match(texto, /Fichas vigentes: 8/);
  assert.match(texto, /Grupos a unificar: 2/);
  assert.match(texto, /#10 ← #11 \(mismo_telefono\)/);
  assert.match(texto, /#20 ← #21 \(mismo_dni\)/);
  assert.match(texto, /destino #10 Ana \[web\] tel 3887000101 DNI 30000101: consultas 1, financiaciones 1, trámites 0, señas 0/);
  assert.match(texto, /origen #11 \(sin nombre\) \[whatsapp\] tel 3887000101 sin DNI: consultas 2, financiaciones 0, trámites 0, señas 0/);
  assert.match(texto, /Dudosos: 1/);
  assert.match(texto, new RegExp(`tel ${TEL}`));
  assert.match(texto, /#31 Hijo de Marta \[presencial\] tel 3884708347 DNI 47544582/);
  assert.match(texto, /Se normalizarían 3 teléfonos y 1 DNI\./);
  assert.match(texto, /teléfono #21: 5493884001122 → 3884001122/);
  assert.match(texto, /DNI #20: 30\.111\.222 → 30111222/);
  assert.match(texto, /Canales por vincular: 0/);
  assert.match(texto, /Canales ya vinculados a otra ficha: 0/);
  assert.match(texto, /A revisar a mano: 0/);
  assert.doesNotMatch(texto, /omitidos/, "en la prueba no se intenta vincular, así que no hay nada que omitir");
  assert.doesNotMatch(texto, /Fusiones/);
});

test("el texto dice cuántas fichas tienen su número en otra ficha, con un ejemplo, y que las une por teléfono", async () => {
  const resultado = await ejecutarUnificacion({ db: escenarioFichaSinLlave().db });

  const texto = textoDelInforme(resultado);

  assert.match(texto, /Canales ya vinculados a otra ficha: 1 \(cuentan como el WhatsApp de la ficha para unirla por teléfono\)/);
  assert.match(texto, /^ {2}#100 whatsapp 5493884708347 \(ya vinculado a #101\)$/m);
  assert.match(texto, /#100 ← #101 \(mismo_telefono\)/);
});

test("el texto muestra pocos ejemplos de las fichas con su número en otra y dice cuántas más hay", async () => {
  const numero = (i) => `388500000${i}`;
  const sinLlave = Array.from({ length: 7 }, (_, i) => ({ id: 100 + i, canal: "whatsapp", canal_id: `549${numero(i)}` }));
  const duenias = sinLlave.map((_, i) => ({ id: 200 + i, canal: "whatsapp", telefono: numero(i) }));
  const base = baseFalsa({
    clientes: [...sinLlave, ...duenias],
    cliente_canales: duenias.map((duenia, i) => canal(i + 1, duenia.id, `549${numero(i)}`)),
  });

  const resultado = await ejecutarUnificacion({ db: base.db });
  const texto = textoDelInforme(resultado);

  assert.equal(resultado.canales.enOtraFicha.length, 7);
  assert.match(texto, /Canales ya vinculados a otra ficha: 7/);
  assert.equal(texto.split("\n").filter((l) => /^ {2}#\d+ whatsapp \d+ \(ya vinculado a #\d+\)$/.test(l)).length, 5);
  assert.match(texto, /… y 2 más/);
});

test("el texto de --aplicar dice cuántos canales se omitieron porque otro proceso los vinculó antes", async () => {
  const base = escenarioDeCanales();
  base.antes("cliente_canales.create", async () => {
    await base.tx.cliente_canales.create({ data: { cliente_id: 80, canal: "whatsapp", identificador: "5493514444444" } });
  });
  const aplicada = await ejecutarUnificacion({ db: base.db, aplicar: true });
  const sinOmitidos = await ejecutarUnificacion({ db: escenarioFichaSinLlave().db, aplicar: true });

  const texto = textoDelInforme(aplicada);

  assert.match(texto, /Canales vinculados: 1 de 2/);
  assert.match(texto, /Canales omitidos \(otro proceso los vinculó antes\): 1/);
  assert.match(texto, /^ {2}#81 whatsapp 5493514444444$/m);
  assert.match(textoDelInforme(sinOmitidos), /Canales omitidos \(otro proceso los vinculó antes\): 0/);
});

test("el texto muestra un guion donde la ficha del grupo no tiene teléfono y 'sin nombre' donde no tiene nombre", async () => {
  const base = baseFalsa({ clientes: [{ id: 1, canal: "presencial", dni: "30125678" }, { id: 2, canal: "web", dni: "30.125.678" }] });

  const texto = textoDelInforme(await ejecutarUnificacion({ db: base.db }));

  assert.match(texto, /destino #1 \(sin nombre\) \[presencial\] tel — DNI 30125678: /);
  assert.match(texto, /origen #2 \(sin nombre\) \[web\] tel — DNI 30125678: /);
});

test("el texto de la prueba dice cuántos canales vincularía, con unos ejemplos", async () => {
  const resultado = await ejecutarUnificacion({ db: escenarioDeCanales().db });

  const texto = textoDelInforme(resultado, { base: "localhost:3306/agencia" });

  assert.match(texto, /Canales por vincular: 2 \(se vincularían con --aplicar\)/);
  assert.match(texto, /#81 whatsapp 5493514444444/);
  assert.match(texto, /#82 instagram ig_eva/);
});

test("el texto de --aplicar dice qué se hizo: vínculos, normalizados, fusiones con su id y las que fallaron", async () => {
  const base = baseFalsa({
    clientes: [
      { id: 60, canal: "web", nombre: "Beto", telefono: "3511111111", dni: "20111333" },
      { id: 61, canal: "whatsapp", canal_id: "5493511111111" },
      { id: 62, canal: "web", telefono: "351 111-1111" },
    ],
    consignacion_ingresos: [{ id: 801, cliente_id: 60, conyuge_cliente_id: 61 }],
  });
  const resultado = await ejecutarUnificacion({ db: base.db, aplicar: true });

  const texto = textoDelInforme(resultado, { base: "localhost:3306/agencia" });

  assert.match(texto, /^APLICADO en la base localhost:3306\/agencia\./);
  assert.match(texto, /Canales vinculados: 1 de 1/);
  assert.match(texto, /Normalizados: 2 teléfonos y 0 DNIs\./);
  assert.match(texto, /Fusiones hechas: 1 · fallidas: 1/);
  assert.match(texto, /#62 → #60 \(mismo_telefono\): fusión 1000/);
  assert.match(texto, /ERROR #61 → #60 \(mismo_telefono\): Las fichas son titular y cónyuge/);
});

test("el texto avisa cuando el paso de canales se omite porque la columna ya no existe", async () => {
  const resultado = await ejecutarUnificacion({ db: baseFalsa({}, { columnaCanalId: false }).db });

  const texto = textoDelInforme(resultado);

  assert.match(texto, /Canales por vincular: se omite \(la columna canal_id ya no existe\)\./);
});

test("el texto muestra pocos ejemplos de lo normalizado y dice cuántos más hay", async () => {
  const clientes = Array.from({ length: 8 }, (_, i) => ({ id: i + 1, canal: "web", dni: `${i + 1}.000.000` }));
  const resultado = await ejecutarUnificacion({ db: baseFalsa({ clientes }).db });

  const texto = textoDelInforme(resultado);

  assert.match(texto, /Se normalizarían 0 teléfonos y 8 DNIs\./);
  assert.equal(texto.split("\n").filter((l) => l.startsWith("  DNI #")).length, 5);
  assert.match(texto, /… y 3 más/);
});

test("nombreDelInforme arma el nombre con la fecha y la hora locales", () => {
  assert.equal(nombreDelInforme(new Date(2026, 9, 18, 21, 5, 9)), "unificacion-clientes-20261018-210509.json");
  assert.equal(nombreDelInforme(new Date(2027, 0, 2, 3, 4, 5)), "unificacion-clientes-20270102-030405.json");
});

// ── El informe en archivo ──

// Una carpeta temporal para el archivo (la que usa el script, `backups/`, es la del proyecto).
function conCarpetaTemporal(prueba) {
  const raiz = mkdtempSync(join(tmpdir(), "unificar-clientes-"));
  return Promise.resolve(prueba(join(raiz, "backups"))).finally(() => rmSync(raiz, { recursive: true, force: true }));
}

test("guardarInforme escribe el plan, lo normalizado, cada fusión con su id y los dudosos, en un JSON con la fecha en el nombre", () =>
  conCarpetaTemporal(async (carpeta) => {
    const resultado = await ejecutarUnificacion({ db: escenario().db, aplicar: true });
    const ahora = new Date(2026, 9, 18, 21, 5, 9);

    const ruta = guardarInforme(resultado, { carpeta, base: "localhost:3306/agencia", ahora });

    assert.equal(ruta, join(carpeta, "unificacion-clientes-20261018-210509.json"));
    const informe = JSON.parse(readFileSync(ruta, "utf8"));
    assert.deepEqual(informe, { generado: ahora.toISOString(), base: "localhost:3306/agencia", ...resultado });
    assert.deepEqual(informe.plan.grupos, GRUPOS_ESCENARIO);
    assert.equal(informe.plan.dudosos.length, 1);
    assert.equal(informe.normalizado.telefonos.length, 3);
    assert.deepEqual(informe.fusiones.map((f) => f.fusionId), [1000, 1001]);
  }));

test("guardarInforme crea la carpeta si falta y no pisa un informe que ya existe", () =>
  conCarpetaTemporal(async (carpeta) => {
    const resultado = await ejecutarUnificacion({ db: baseFalsa().db, aplicar: true });
    const ahora = new Date(2026, 9, 18, 21, 5, 9);

    guardarInforme(resultado, { carpeta, base: "a", ahora });

    assert.throws(() => guardarInforme(resultado, { carpeta, base: "b", ahora }), (e) => e.code === "EEXIST");
    assert.deepEqual(readdirSync(carpeta), ["unificacion-clientes-20261018-210509.json"]);
    assert.equal(JSON.parse(readFileSync(join(carpeta, readdirSync(carpeta)[0]), "utf8")).base, "a", "el primero queda como estaba");
  }));

// El informe tiene nombres, teléfonos y DNI: solo lo lee quien lo guardó. Los permisos de un archivo no se ven
// igual en Windows (no hay modo POSIX), así que se mira con qué opciones se escribe, y en POSIX además el modo real.
test("guardarInforme escribe con permisos 0o600 y sin pisar (wx): el informe tiene datos personales", () =>
  conCarpetaTemporal(async (carpeta) => {
    const resultado = await ejecutarUnificacion({ db: baseFalsa().db, aplicar: true });
    const escribir = fs.writeFileSync;
    const espia = mock.method(fs, "writeFileSync", (...argumentos) => escribir(...argumentos));
    syncBuiltinESMExports(); // el servicio importó `writeFileSync` por nombre: que vea el espía
    let ruta;
    try {
      ruta = guardarInforme(resultado, { carpeta, base: "a", ahora: new Date(2026, 9, 18, 21, 5, 9) });
    } finally {
      espia.mock.restore();
      syncBuiltinESMExports();
    }

    assert.equal(espia.mock.calls.length, 1);
    assert.deepEqual(espia.mock.calls[0].arguments[2], { flag: "wx", mode: 0o600 });
    if (process.platform !== "win32") assert.equal(statSync(ruta).mode & 0o777, 0o600);
  }));
