import { test } from "node:test";
import assert from "node:assert/strict";
import { VIGENTE_CLIENTE, resolverCliente, fusionarClientes, planDeUnificacion, normalizarTelefonos, normalizarDnis } from "./clientes.service.js";

// ── Base falsa en memoria ──
// Hace cumplir lo que la base real exige y estas reglas necesitan: DNI único entre
// vigentes (074), un identificador por canal (073), un perfil por cliente, "fusionado
// implica archivado" y cónyuge distinto del titular. Ningún modelo tiene delete ni
// deleteMany: un borrado físico revienta el test.
// Simula también el `updated_at ... ON UPDATE CURRENT_TIMESTAMP` que MySQL tiene en tres
// tablas: todo UPDATE que no asigne `updated_at` lo pone en la hora de la escritura.

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
const ULTIMA_ACTIVIDAD = new Date("2026-10-05T08:00:00Z"); // el `updated_at` con el que nacen las filas de las tres tablas
const CON_ACTUALIZACION_AUTOMATICA = ["chat_estado", "consignacion_ingresos", "cliente_perfiles"];

const DEFECTOS = {
  clientes: { nombre: null, telefono: null, dni: null, cuil: null, email: null, deleted_at: null, fusionado_en_id: null, created_at: CREADA },
  chat_estado: { updated_at: ULTIMA_ACTIVIDAD },
  cliente_perfiles: {
    apellido: null, cuit: null, domicilio: null, localidad: null, provincia: null,
    cbu: null, alias_cbu: null, banco_cbu: null, contacto_alt_telefono: null, contacto_alt_vinculo: null,
    updated_at: ULTIMA_ACTIVIDAD,
  },
  consignacion_ingresos: { conyuge_cliente_id: null, updated_at: ULTIMA_ACTIVIDAD },
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
    if (campo === "canal_identificador") return fila.canal === esperado.canal && fila.identificador === esperado.identificador;
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

function baseFalsa(semilla = {}) {
  const tablas = Object.fromEntries(MODELOS.map((m) => [m, (semilla[m] ?? []).map((fila) => ({ ...DEFECTOS[m], ...fila }))]));
  const siguiente = Object.fromEntries(MODELOS.map((m) => [m, 1000]));
  const ganchos = new Map();
  const llamadas = [];
  const transacciones = { abiertas: 0, confirmadas: 0, revertidas: 0, opciones: [] };
  let segundos = Date.parse("2026-10-18T12:00:00Z");
  const reloj = () => new Date((segundos += 1000)); // cada escritura llega un segundo después de la anterior

  function validar(modelo, fila, actual) {
    const claves = CLAVES_UNICAS[modelo];
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
    const paso = async (metodo, args) => {
      llamadas.push({ modelo: nombre, metodo, args, enTransaccion: diario !== null });
      const clave = `${nombre}.${metodo}`;
      const gancho = ganchos.get(clave);
      ganchos.delete(clave);
      await gancho?.();
    };
    const aplicar = (fila, data, select) => {
      // Como MySQL: si el UPDATE no asigna `updated_at`, lo pisa con la hora; si lo asigna, respeta lo asignado.
      const cambios = CON_ACTUALIZACION_AUTOMATICA.includes(nombre) && !("updated_at" in data) ? { ...data, updated_at: reloj() } : data;
      validar(nombre, { ...fila, ...cambios }, fila);
      const antes = { ...fila };
      Object.assign(fila, cambios);
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
    $transaction: async (tarea, opciones) => {
      transacciones.abiertas += 1;
      transacciones.opciones.push(opciones);
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
    // Corre `gancho` justo antes de la próxima llamada a "modelo.metodo": para simular a otro pedido ganando la carrera.
    antes: (clave, gancho) => ganchos.set(clave, gancho),
    filas: (nombre) => tablas[nombre].map((fila) => ({ ...fila })),
    escrituras: () => llamadas.filter((l) => ESCRITURAS.includes(l.metodo)),
  };
}

const estado = (base) => Object.fromEntries(MODELOS.map((m) => [m, base.filas(m)]));

const WA = "5493884708347"; // wa_id del número de la prueba real
const TEL = "3884708347"; // el mismo número, como se guarda
const FECHA = new Date("2026-10-10T12:00:00Z");
const canalWhatsapp = (id, cliente_id, identificador = WA) => ({ id, cliente_id, canal: "whatsapp", identificador });

test("la base falsa exige el DNI único entre vigentes y no tiene borrado físico", async () => {
  const base = baseFalsa({ clientes: [{ id: 1, dni: "30125678" }, { id: 2 }, { id: 3, dni: "30125678", deleted_at: FECHA }] });
  await assert.rejects(base.tx.clientes.update({ where: { id: 2 }, data: { dni: "30125678" } }), (e) => e.code === "P2002");
  for (const modelo of Object.values(base.tx)) {
    assert.equal(modelo.delete, undefined);
    assert.equal(modelo.deleteMany, undefined);
  }
});

test("la base falsa pisa updated_at en los UPDATE que no lo asignan, solo en las tres tablas con ON UPDATE", async () => {
  const base = baseFalsa({
    chat_estado: [{ id: 1, cliente_id: 11 }, { id: 2, cliente_id: 11 }],
    cliente_perfiles: [{ id: 1, cliente_id: 11 }],
    consignacion_ingresos: [{ id: 1, cliente_id: 11 }],
    senas: [{ id: 1, cliente_id: 11, updated_at: ULTIMA_ACTIVIDAD }],
  });
  const FIJADA = new Date("2020-01-01T00:00:00Z");

  await base.tx.chat_estado.update({ where: { id: 1 }, data: { cliente_id: 10 } });
  await base.tx.chat_estado.update({ where: { id: 2 }, data: { cliente_id: 10, updated_at: FIJADA } });
  await base.tx.cliente_perfiles.updateMany({ where: { cliente_id: 11 }, data: { cliente_id: 10 } });
  await base.tx.consignacion_ingresos.update({ where: { id: 1 }, data: { cliente_id: 10 } });
  await base.tx.senas.update({ where: { id: 1 }, data: { cliente_id: 10 } });

  const [pisada, asignada] = base.filas("chat_estado");
  assert.ok(pisada.updated_at > ULTIMA_ACTIVIDAD, "sin asignar, MySQL pone la hora de la escritura");
  assert.deepEqual(asignada.updated_at, FIJADA, "si se asigna, se respeta");
  assert.ok(base.filas("cliente_perfiles")[0].updated_at > ULTIMA_ACTIVIDAD && base.filas("consignacion_ingresos")[0].updated_at > ULTIMA_ACTIVIDAD);
  assert.deepEqual(base.filas("senas")[0].updated_at, ULTIMA_ACTIVIDAD, "las demás tablas no lo pisan");
});

test("VIGENTE_CLIENTE deja afuera a las fichas archivadas", () => {
  assert.deepEqual(VIGENTE_CLIENTE, { deleted_at: null });
});

// ── resolverCliente ──

test("resolverCliente rechaza datos sin canal válido o con valores imposibles, y no escribe nada", async () => {
  const base = baseFalsa();
  const invalidos = [
    undefined,
    null,
    "whatsapp",
    {},
    { canal: "telegram" },
    { canal: "whatsapp", identificador: "1".repeat(121) },
    { canal: "web", dni: "1".repeat(21) },
    // El DNI es texto o número: cualquier otra cosa no se guarda convertida en texto ("[OBJECTOBJECT]").
    { canal: "web", dni: { not: "x" } },
    { canal: "web", dni: ["30125678"] },
    { canal: "web", dni: true },
    { canal: "web", dni: Number.NaN },
    { canal: "web", dni: -30125678 },
    { canal: "web", dni: 30125678.5 },
  ];
  for (const datos of invalidos) {
    await assert.rejects(resolverCliente(datos, base.db), (e) => e.status === 400, JSON.stringify(datos));
  }
  assert.deepEqual(base.escrituras(), []);
});

test("un número de WhatsApp nuevo crea la ficha con el teléfono normalizado y su canal, todo en una transacción", async () => {
  const base = baseFalsa();

  const { cliente, creado } = await resolverCliente({ canal: "whatsapp", identificador: WA, nombre: "  Joel   Perez " }, base.db);

  assert.equal(creado, true);
  assert.equal(cliente.canal, "whatsapp");
  assert.equal(cliente.nombre, "Joel Perez");
  assert.equal(cliente.telefono, TEL);
  assert.deepEqual(base.filas("cliente_canales").map(({ cliente_id, canal, identificador }) => ({ cliente_id, canal, identificador })), [
    { cliente_id: cliente.id, canal: "whatsapp", identificador: WA },
  ]);
  const altas = base.escrituras();
  assert.deepEqual(altas.map((a) => `${a.modelo}.${a.metodo}`), ["clientes.create", "cliente_canales.create"]);
  assert.ok(altas.every((a) => a.enTransaccion), "cliente y canal van juntos en la transacción");
  assert.equal(base.transacciones.confirmadas, 1);
  assert.ok(!("canal_id" in altas[0].args.data), "canal_id ya no se escribe");
});

test("el mismo número de WhatsApp vuelve a su ficha sin crear ni pisar nada", async () => {
  const base = baseFalsa({
    clientes: [{ id: 5, canal: "whatsapp", nombre: "Joel", telefono: TEL }],
    cliente_canales: [canalWhatsapp(1, 5)],
  });

  const { cliente, creado } = await resolverCliente({ canal: "whatsapp", identificador: WA, nombre: "Otro nombre de perfil" }, base.db);

  assert.equal(creado, false);
  assert.equal(cliente.id, 5);
  assert.equal(cliente.nombre, "Joel");
  assert.deepEqual(base.escrituras(), []);
});

test("si la ficha del canal está archivada, sigue fusionado_en_id hasta la vigente", async () => {
  const base = baseFalsa({
    clientes: [
      { id: 1, canal: "web", nombre: "Ana", telefono: TEL },
      { id: 2, canal: "whatsapp", deleted_at: FECHA, fusionado_en_id: 3 },
      { id: 3, canal: "web", deleted_at: FECHA, fusionado_en_id: 1 },
    ],
    cliente_canales: [canalWhatsapp(1, 2)],
  });

  const { cliente, creado } = await resolverCliente({ canal: "whatsapp", identificador: WA }, base.db);

  assert.equal(cliente.id, 1);
  assert.equal(creado, false);
  assert.deepEqual(base.escrituras(), []);
});

test("una ficha archivada sin a quién seguir, o una cadena en ciclo, es un conflicto: no se crea otra ficha", async () => {
  const sinDestino = baseFalsa({
    clientes: [{ id: 2, canal: "whatsapp", deleted_at: FECHA }],
    cliente_canales: [canalWhatsapp(1, 2)],
  });
  const enCiclo = baseFalsa({
    clientes: [
      { id: 2, canal: "whatsapp", deleted_at: FECHA, fusionado_en_id: 3 },
      { id: 3, canal: "web", deleted_at: FECHA, fusionado_en_id: 2 },
    ],
    cliente_canales: [canalWhatsapp(1, 2)],
  });

  for (const base of [sinDestino, enCiclo]) {
    await assert.rejects(resolverCliente({ canal: "whatsapp", identificador: WA }, base.db), (e) => e.status === 409);
    assert.deepEqual(base.escrituras(), []);
  }
});

test("con DNI encuentra la ficha vigente sin importar cómo venga escrito y le completa lo que le falta", async () => {
  for (const dni of ["30.125.678", " 30125678 ", 30125678]) {
    const base = baseFalsa({ clientes: [{ id: 7, canal: "web", dni: "30125678" }] });

    const { cliente, creado } = await resolverCliente(
      { canal: "presencial", dni, telefono: "388 470-8347", nombre: "Joel", email: "joel@x.com" },
      base.db
    );

    assert.equal(creado, false, `falló con ${dni}`);
    assert.deepEqual(
      { id: cliente.id, dni: cliente.dni, telefono: cliente.telefono, nombre: cliente.nombre, email: cliente.email },
      { id: 7, dni: "30125678", telefono: TEL, nombre: "Joel", email: "joel@x.com" }
    );
  }
});

test("el DNI solo se busca entre vigentes: una ficha archivada no resucita", async () => {
  const base = baseFalsa({ clientes: [{ id: 4, canal: "web", dni: "30125678", deleted_at: FECHA }] });

  const { cliente, creado } = await resolverCliente({ canal: "presencial", dni: "30125678", nombre: "Joel" }, base.db);

  assert.equal(creado, true);
  assert.notEqual(cliente.id, 4);
  assert.deepEqual(base.filas("clientes").find((c) => c.id === 4).deleted_at, FECHA);
});

test("el DNI se busca antes que el teléfono, y a esa ficha se le vincula el identificador", async () => {
  const base = baseFalsa({
    clientes: [
      { id: 1, canal: "web", nombre: "Joel", dni: "30125678", telefono: "3511234567" },
      { id: 2, canal: "whatsapp", telefono: TEL },
    ],
  });

  const { cliente, creado } = await resolverCliente({ canal: "whatsapp", identificador: WA, dni: "30125678" }, base.db);

  assert.equal(creado, false);
  assert.equal(cliente.id, 1);
  assert.equal(cliente.telefono, "3511234567", "no se pisa el teléfono que ya tenía");
  assert.deepEqual(base.filas("cliente_canales").map((c) => [c.cliente_id, c.canal, c.identificador]), [[1, "whatsapp", WA]]);
  assert.equal(base.filas("clientes").find((c) => c.id === 2).dni, null, "la otra ficha no se toca");
});

test("con DNI, el teléfono sirve solo si hay una única ficha y todavía no tiene DNI: ahí se le completa", async () => {
  const base = baseFalsa({ clientes: [{ id: 3, canal: "web", telefono: TEL }] });

  const { cliente, creado } = await resolverCliente({ canal: "presencial", dni: "47544582", telefono: "+54 9 388 470-8347", nombre: "Joel" }, base.db);

  assert.equal(creado, false);
  assert.equal(cliente.id, 3);
  assert.equal(cliente.dni, "47544582");
  assert.equal(cliente.nombre, "Joel");
});

test("con DNI, si el teléfono tiene otro DNI o hay varias fichas sin DNI no se adivina: se crea una ficha nueva", async () => {
  const casos = {
    "una ficha con otro DNI (un familiar con el mismo número)": [{ id: 3, canal: "web", telefono: TEL, dni: "30125678" }],
    "dos fichas sin DNI": [
      { id: 3, canal: "web", telefono: TEL },
      { id: 4, canal: "whatsapp", telefono: TEL },
    ],
    "una sin DNI y otra con otro DNI": [
      { id: 3, canal: "web", telefono: TEL },
      { id: 4, canal: "web", telefono: TEL, dni: "30125678" },
    ],
  };
  for (const [descripcion, clientes] of Object.entries(casos)) {
    const base = baseFalsa({ clientes });
    const antes = base.filas("clientes");

    const { cliente, creado } = await resolverCliente({ canal: "presencial", dni: "47544582", telefono: TEL, nombre: "Familiar" }, base.db);

    assert.equal(creado, true, descripcion);
    assert.deepEqual([cliente.dni, cliente.telefono, cliente.nombre], ["47544582", TEL, "Familiar"], descripcion);
    assert.deepEqual(base.filas("clientes").slice(0, antes.length), antes, `${descripcion}: las existentes quedan como estaban`);
  }
});

test("sin DNI, el teléfono sirve si hay una única ficha (tenga o no DNI) y se le vincula el canal", async () => {
  for (const dni of [null, "30125678"]) {
    const base = baseFalsa({ clientes: [{ id: 3, canal: "web", nombre: "Joel", telefono: TEL, dni }] });

    const { cliente, creado } = await resolverCliente({ canal: "whatsapp", identificador: WA }, base.db);

    assert.equal(creado, false);
    assert.deepEqual([cliente.id, cliente.dni], [3, dni]);
    assert.deepEqual(base.filas("cliente_canales").map((c) => [c.cliente_id, c.identificador]), [[3, WA]]);
  }
});

test("sin DNI, si hay más de una ficha con ese teléfono no se adivina: se crea una nueva", async () => {
  const base = baseFalsa({
    clientes: [
      { id: 3, canal: "web", telefono: TEL, dni: "30125678" },
      { id: 4, canal: "presencial", telefono: TEL, dni: "47544582" },
    ],
  });
  const antes = base.filas("clientes");

  const { cliente, creado } = await resolverCliente({ canal: "whatsapp", identificador: WA }, base.db);

  assert.equal(creado, true);
  assert.equal(cliente.telefono, TEL);
  assert.deepEqual(base.filas("cliente_canales").map((c) => c.cliente_id), [cliente.id]);
  assert.deepEqual(base.filas("clientes").slice(0, 2), antes);
});

test("el bot reconoce a quien ya cargó la financiación por web: el wa_id lleva a la misma ficha sin pisarle el nombre", async () => {
  const base = baseFalsa({ clientes: [{ id: 8, canal: "web", nombre: "Ana Gómez", telefono: "3887000101", dni: "30000101" }] });

  const { cliente, creado } = await resolverCliente({ canal: "whatsapp", identificador: "5493887000101", nombre: "ana ✨" }, base.db);

  assert.equal(creado, false);
  assert.equal(cliente.id, 8);
  assert.equal(cliente.nombre, "Ana Gómez");
  assert.deepEqual(base.filas("cliente_canales").map((c) => [c.cliente_id, c.identificador]), [[8, "5493887000101"]]);
});

test("el teléfono solo se busca entre vigentes", async () => {
  const base = baseFalsa({ clientes: [{ id: 3, canal: "web", telefono: TEL, deleted_at: FECHA }] });

  const { cliente, creado } = await resolverCliente({ canal: "whatsapp", identificador: WA }, base.db);

  assert.equal(creado, true);
  assert.notEqual(cliente.id, 3);
});

test("un identificador de Facebook o Instagram no se lee como teléfono", async () => {
  for (const canal of ["facebook", "instagram"]) {
    const base = baseFalsa({ clientes: [{ id: 3, canal: "web", telefono: TEL }] });

    const { cliente, creado } = await resolverCliente({ canal, identificador: WA }, base.db);

    assert.equal(creado, true, canal);
    assert.equal(cliente.telefono, null, canal);
    assert.deepEqual(base.filas("cliente_canales").map((c) => [c.cliente_id, c.canal, c.identificador]), [[cliente.id, canal, WA]]);
  }
});

test("nunca se pisa un valor que la ficha ya tiene", async () => {
  const base = baseFalsa({ clientes: [{ id: 5, canal: "web", nombre: "Joel", telefono: "3511234567", dni: "30125678", email: "joel@x.com" }] });

  const { cliente } = await resolverCliente(
    { canal: "presencial", dni: "30125678", nombre: "Otro", telefono: TEL, email: "otro@x.com" },
    base.db
  );

  assert.deepEqual([cliente.nombre, cliente.telefono, cliente.email], ["Joel", "3511234567", "joel@x.com"]);
  assert.deepEqual(base.escrituras(), []);
});

test("solo se completan los huecos: lo que falta se llena y lo demás queda", async () => {
  const base = baseFalsa({ clientes: [{ id: 5, canal: "web", nombre: "Joel", dni: "30125678" }] });

  const { cliente } = await resolverCliente(
    { canal: "presencial", dni: "30125678", nombre: "Otro", telefono: "0388 15 470-8347", email: "otro@x.com" },
    base.db
  );

  const [escritura] = base.escrituras();
  assert.equal(base.escrituras().length, 1);
  assert.deepEqual(escritura.args.data, { telefono: TEL, email: "otro@x.com" });
  assert.deepEqual([cliente.nombre, cliente.telefono, cliente.email], ["Joel", TEL, "otro@x.com"]);
});

test("al crear guarda el teléfono normalizado; si no se puede, los dígitos; si no hay, null", async () => {
  const casos = [
    ["0388 15 470-8347", TEL],
    ["+54 9 388 470 8347", TEL],
    ["+1 415 555 0123", "14155550123"],
    ["12345", "12345"],
    ["sin teléfono", null],
    ["", null],
    [undefined, null],
    ["1".repeat(31), null],
  ];
  for (const [telefono, esperado] of casos) {
    const { cliente } = await resolverCliente({ canal: "web", telefono, nombre: "Prueba" }, baseFalsa().db);
    assert.equal(cliente.telefono, esperado, `con ${JSON.stringify(telefono)}`);
  }
});

test("el DNI no se completa si otra ficha vigente ya lo tiene (no choca con el índice único)", async () => {
  const base = baseFalsa({
    clientes: [
      { id: 1, canal: "whatsapp", telefono: TEL },
      { id: 2, canal: "web", dni: "30125678", telefono: "3511234567" },
    ],
    cliente_canales: [canalWhatsapp(1, 1)],
  });

  const { cliente, creado } = await resolverCliente({ canal: "whatsapp", identificador: WA, dni: "30125678" }, base.db);

  assert.equal(creado, false);
  assert.equal(cliente.id, 1);
  assert.equal(cliente.dni, null);
  assert.deepEqual(base.escrituras(), []);
});

test("limpia el nombre y el email, y recorta el nombre al largo de la columna", async () => {
  const { cliente } = await resolverCliente(
    { canal: "web", dni: "30125678", nombre: "  Ana\n   María  ", email: "  ana@x.com  " },
    baseFalsa().db
  );
  assert.deepEqual([cliente.nombre, cliente.email], ["Ana María", "ana@x.com"]);

  const largo = await resolverCliente({ canal: "web", dni: "30125679", nombre: "x".repeat(200) }, baseFalsa().db);
  assert.equal(largo.cliente.nombre.length, 120);
});

test("el nombre y el email pierden los caracteres de control y de formato (el override RTL, el espacio de ancho cero, el NUL)", async () => {
  const sucio = "‮Joel‬​  Pé\u0000rez­";

  const { cliente } = await resolverCliente({ canal: "web", dni: "30125678", nombre: sucio, email: "  jo​el@x.com " }, baseFalsa().db);

  assert.equal(cliente.nombre, "Joel Pérez");
  assert.equal(cliente.email, "joel@x.com");
});

test("un salto de línea o un tab entre palabras sigue siendo un espacio; un nombre solo de caracteres invisibles queda vacío", async () => {
  const { cliente } = await resolverCliente({ canal: "web", dni: "30125678", nombre: "Ana\nMaría\tGómez" }, baseFalsa().db);
  assert.equal(cliente.nombre, "Ana María Gómez");

  const invisible = await resolverCliente({ canal: "web", dni: "30125679", nombre: "‮​\u0000" }, baseFalsa().db);
  assert.equal(invisible.cliente.nombre, null);
});

// ── DNI con letras (A5) ──

test("un DNI con letras (un pasaporte) se guarda entero: no se confunde con otro que comparte los dígitos", async () => {
  const base = baseFalsa();

  const primera = await resolverCliente({ canal: "presencial", dni: "ab 123.456", nombre: "Ana" }, base.db);
  const segunda = await resolverCliente({ canal: "presencial", dni: "CD123456", nombre: "Bea" }, base.db);
  const repetida = await resolverCliente({ canal: "web", dni: "AB-123456" }, base.db);

  assert.deepEqual([primera.cliente.dni, segunda.cliente.dni], ["AB123456", "CD123456"]);
  assert.deepEqual([primera.creado, segunda.creado, repetida.creado], [true, true, false]);
  assert.notEqual(segunda.cliente.id, primera.cliente.id);
  assert.equal(repetida.cliente.id, primera.cliente.id, "el mismo documento escrito distinto es la misma persona");
});

// ── Teléfonos de otro país (A7) ──

test("un wa_id extranjero no se lee como teléfono argentino: se guardan sus dígitos y no cruza con una ficha de acá", async () => {
  // 93704123456 es Afganistán: sin el 54, un 9 al frente y el área 3704 lo harían pasar por un móvil de Formosa.
  const base = baseFalsa({ clientes: [{ id: 3, canal: "web", nombre: "Formoseña", telefono: "3704123456" }] });

  const { cliente, creado } = await resolverCliente(
    { canal: "whatsapp", identificador: "93704123456", telefono: "93704123456", nombre: "Hamid" },
    base.db
  );

  assert.equal(creado, true);
  assert.notEqual(cliente.id, 3);
  assert.equal(cliente.telefono, "93704123456");
  assert.deepEqual(base.filas("cliente_canales").map((c) => [c.cliente_id, c.identificador]), [[cliente.id, "93704123456"]]);
  assert.equal(base.filas("clientes").find((c) => c.id === 3).telefono, "3704123456", "la ficha de Formosa queda como estaba");
});

test("el wa_id argentino (con el 54) se normaliza y lo tipeado en web o presencial también", async () => {
  const casos = [
    [{ canal: "whatsapp", identificador: WA }, TEL],
    [{ canal: "whatsapp", identificador: "543884708347" }, TEL],
    [{ canal: "web", telefono: "0388 15 470-8347" }, TEL],
    [{ canal: "presencial", telefono: "0388 15 470-8347" }, TEL],
    [{ canal: "web", telefono: "+54 9 388 470-8347" }, TEL],
    [{ canal: "presencial", telefono: "93884708347" }, TEL],
  ];
  for (const [datos, esperado] of casos) {
    const { cliente } = await resolverCliente({ nombre: "Prueba", ...datos }, baseFalsa().db);
    assert.equal(cliente.telefono, esperado, JSON.stringify(datos));
  }
});

// ── Nombre de perfil contra nombre legal (A8) ──

test("el nombre que tipea el personal (web o presencial) reemplaza al de perfil de un chat mientras la ficha no tiene DNI", async () => {
  for (const canalDeLaFicha of ["whatsapp", "facebook", "instagram"]) {
    for (const canal of ["web", "presencial"]) {
      const base = baseFalsa({ clientes: [{ id: 5, canal: canalDeLaFicha, nombre: "ana ✨", telefono: TEL }] });

      const { cliente, creado } = await resolverCliente({ canal, telefono: TEL, dni: "30125678", nombre: "Ana Gómez" }, base.db);

      const etiqueta = `${canalDeLaFicha} ← ${canal}`;
      assert.equal(creado, false, etiqueta);
      assert.deepEqual([cliente.id, cliente.nombre, cliente.dni], [5, "Ana Gómez", "30125678"], etiqueta);
      assert.deepEqual(base.escrituras().map((e) => e.args.data), [{ nombre: "Ana Gómez", dni: "30125678" }], etiqueta);
    }
  }
});

test("el nombre de perfil no pisa un nombre legal: la ficha con DNI, la que no es de mensajería y la entrada de mensajería quedan como estaban", async () => {
  const casos = {
    "ficha de WhatsApp que ya tiene DNI": {
      ficha: { id: 5, canal: "whatsapp", nombre: "ana ✨", telefono: TEL, dni: "30125678" },
      entrada: { canal: "presencial", dni: "30125678", nombre: "Ana Gómez" },
      esperado: "ana ✨",
    },
    "ficha web sin DNI: solo se llenan huecos": {
      ficha: { id: 5, canal: "web", nombre: "Ana G.", telefono: TEL },
      entrada: { canal: "presencial", telefono: TEL, nombre: "Ana Gómez" },
      esperado: "Ana G.",
    },
    "entrada de mensajería sobre ficha de mensajería": {
      ficha: { id: 5, canal: "whatsapp", nombre: "ana ✨", telefono: TEL },
      entrada: { canal: "facebook", identificador: "fb-123", telefono: TEL, nombre: "Ana FB" },
      esperado: "ana ✨",
    },
    "entrada web sin nombre": {
      ficha: { id: 5, canal: "whatsapp", nombre: "ana ✨", telefono: TEL },
      entrada: { canal: "web", telefono: TEL },
      esperado: "ana ✨",
    },
  };
  for (const [descripcion, { ficha, entrada, esperado }] of Object.entries(casos)) {
    const base = baseFalsa({ clientes: [ficha] });

    const { cliente, creado } = await resolverCliente(entrada, base.db);

    assert.deepEqual([creado, cliente.id, cliente.nombre], [false, 5, esperado], descripcion);
  }
});

test("el nombre de perfil se completa si la ficha no tenía ninguno, y con el mismo nombre tipeado no se escribe nada", async () => {
  const sinNombre = baseFalsa({ clientes: [{ id: 5, canal: "whatsapp", telefono: TEL }] });
  const completada = await resolverCliente({ canal: "whatsapp", identificador: WA, nombre: "ana ✨" }, sinNombre.db);
  assert.equal(completada.cliente.nombre, "ana ✨", "llenar un hueco sigue valiendo para el nombre de perfil");

  const igual = baseFalsa({ clientes: [{ id: 5, canal: "whatsapp", nombre: "Ana Gómez", telefono: TEL }] });
  await resolverCliente({ canal: "web", telefono: TEL, nombre: "Ana Gómez" }, igual.db);
  assert.deepEqual(igual.escrituras(), []);
});

// ── completar atómico (A10) ──

test("completar es atómico con el cliente raíz: si falla el vínculo, tampoco queda lo que se había completado", async () => {
  const base = baseFalsa({ clientes: [{ id: 3, canal: "web", telefono: TEL }] });
  base.antes("cliente_canales.create", () => {
    throw new Error("se cayó la conexión");
  });

  await assert.rejects(resolverCliente({ canal: "whatsapp", identificador: WA, dni: "30125678", nombre: "Joel" }, base.db), /se cayó la conexión/);

  const [ficha] = base.filas("clientes");
  assert.deepEqual([ficha.nombre, ficha.dni], [null, null], "el update se deshizo junto con el vínculo");
  assert.equal(base.filas("cliente_canales").length, 0);
  assert.equal(base.transacciones.revertidas, 1);
});

test("completar escribe lo completado y el vínculo en una sola transacción, y no abre ninguna si no hay nada que escribir", async () => {
  const conEscrituras = baseFalsa({ clientes: [{ id: 3, canal: "web", telefono: TEL }] });
  await resolverCliente({ canal: "whatsapp", identificador: WA, nombre: "Joel" }, conEscrituras.db);
  assert.equal(conEscrituras.transacciones.confirmadas, 1);
  assert.deepEqual(conEscrituras.escrituras().map((e) => `${e.modelo}.${e.metodo}:${e.enTransaccion}`), ["clientes.update:true", "cliente_canales.create:true"]);

  const sinEscrituras = baseFalsa({ clientes: [{ id: 5, canal: "whatsapp", nombre: "Joel", telefono: TEL }], cliente_canales: [canalWhatsapp(1, 5)] });
  await resolverCliente({ canal: "whatsapp", identificador: WA, nombre: "Otro" }, sinEscrituras.db);
  assert.equal(sinEscrituras.transacciones.abiertas, 0, "el camino de cada mensaje del bot no abre una transacción de balde");
});

test("un canal de mensajería sin identificador igual crea la ficha, y por DNI se la reconoce después", async () => {
  for (const canal of ["whatsapp", "facebook", "instagram"]) {
    const base = baseFalsa();

    const primera = await resolverCliente({ canal, dni: "30125678", nombre: "Joel" }, base.db);
    const segunda = await resolverCliente({ canal, dni: "30125678" }, base.db);

    assert.deepEqual([primera.creado, segunda.creado, segunda.cliente.id], [true, false, primera.cliente.id], canal);
    assert.equal(base.filas("cliente_canales").length, 0, canal);
  }
});

test("en web y presencial el identificador no se usa: no hay canal de mensajería que vincular", async () => {
  for (const canal of ["web", "presencial"]) {
    const base = baseFalsa();

    const { cliente, creado } = await resolverCliente({ canal, identificador: WA, dni: "30125678" }, base.db);

    assert.equal(creado, true);
    assert.equal(cliente.telefono, null, "el wa_id no se convierte en teléfono fuera de WhatsApp");
    assert.ok(base.llamadas.every((l) => l.modelo !== "cliente_canales"), canal);
  }
});

test("si otro pedido gana la carrera por el mismo número, la transacción se revierte y se devuelve la ficha ganadora", async () => {
  const base = baseFalsa();
  let ganadora;
  base.antes("cliente_canales.create", async () => {
    ganadora = await base.tx.clientes.create({ data: { canal: "whatsapp", telefono: TEL } });
    await base.tx.cliente_canales.create({ data: { cliente_id: ganadora.id, canal: "whatsapp", identificador: WA } });
  });

  const { cliente, creado } = await resolverCliente({ canal: "whatsapp", identificador: WA, nombre: "Joel" }, base.db);

  assert.equal(creado, false);
  assert.equal(cliente.id, ganadora.id);
  assert.deepEqual(base.filas("clientes").map((c) => c.id), [ganadora.id], "no queda una ficha huérfana");
  assert.equal(base.filas("cliente_canales").length, 1);
  assert.equal(base.transacciones.revertidas, 1);
});

test("dos mensajes simultáneos de un número nuevo terminan en una sola ficha", async () => {
  const base = baseFalsa();

  const resultados = await Promise.all([
    resolverCliente({ canal: "whatsapp", identificador: WA, nombre: "Joel" }, base.db),
    resolverCliente({ canal: "whatsapp", identificador: WA, nombre: "Joel" }, base.db),
  ]);

  assert.equal(base.filas("clientes").length, 1);
  assert.equal(base.filas("cliente_canales").length, 1);
  assert.equal(resultados[0].cliente.id, resultados[1].cliente.id);
  assert.deepEqual(resultados.map((r) => r.creado).sort(), [false, true]);
});

test("si otro pedido vincula el mismo número a la ficha mientras tanto, se devuelve esa ficha", async () => {
  const base = baseFalsa({ clientes: [{ id: 3, canal: "web", telefono: TEL }] });
  base.antes("cliente_canales.create", async () => {
    await base.tx.cliente_canales.create({ data: { cliente_id: 3, canal: "whatsapp", identificador: WA } });
  });

  const { cliente, creado } = await resolverCliente({ canal: "whatsapp", identificador: WA }, base.db);

  assert.equal(creado, false);
  assert.equal(cliente.id, 3);
  assert.equal(base.filas("cliente_canales").length, 1);
  assert.equal(base.filas("clientes").length, 1);
});

test("si db ya es una transacción (sin $transaction) la usa directo", async () => {
  const base = baseFalsa();

  const { cliente, creado } = await resolverCliente({ canal: "whatsapp", identificador: WA, nombre: "Joel" }, base.tx);

  assert.equal(creado, true);
  assert.equal(base.transacciones.abiertas, 0);
  assert.deepEqual(base.filas("cliente_canales").map((c) => c.cliente_id), [cliente.id]);
});

test("ante el UNIQUE de DNI (carrera) vuelve a buscar una vez y devuelve la ficha existente, completándole los huecos", async () => {
  const base = baseFalsa();
  base.antes("clientes.create", async () => {
    await base.tx.clientes.create({ data: { canal: "web", dni: "30125678", nombre: "Ganadora" } });
  });

  const { cliente, creado } = await resolverCliente({ canal: "presencial", dni: "30125678", nombre: "Perdedora", email: "p@x.com" }, base.db);

  assert.equal(creado, false);
  assert.deepEqual([cliente.nombre, cliente.email], ["Ganadora", "p@x.com"]);
  assert.equal(base.filas("clientes").length, 1);
});

test("dentro de la transacción de quien llama (un tx) no reintenta ante el UNIQUE: lanza 409 para que vuelva a intentar", async () => {
  // En REPEATABLE READ la búsqueda del reintento correría en el snapshot de esa transacción y no vería la ficha del otro pedido.
  const base = baseFalsa();
  base.antes("clientes.create", async () => {
    await base.tx.clientes.create({ data: { canal: "web", dni: "30125678", nombre: "Ganadora" } });
  });

  await assert.rejects(
    resolverCliente({ canal: "presencial", dni: "30125678", nombre: "Perdedora" }, base.tx),
    (e) => e.status === 409 && e.message === "Esa persona se acaba de cargar desde otro pedido. Volvé a intentar."
  );

  assert.equal(base.llamadas.filter((l) => l.modelo === "clientes" && l.metodo === "findFirst").length, 1, "no hubo segunda búsqueda");
  assert.equal(base.transacciones.abiertas, 0);
});

test("con un tx, si el UNIQUE salta al vincular el número de WhatsApp, también es un 409 y no se reintenta", async () => {
  const base = baseFalsa({ clientes: [{ id: 3, canal: "web", telefono: TEL }] });
  base.antes("cliente_canales.create", async () => {
    await base.tx.cliente_canales.create({ data: { cliente_id: 3, canal: "whatsapp", identificador: WA } });
  });

  await assert.rejects(resolverCliente({ canal: "whatsapp", identificador: WA }, base.tx), (e) => e.status === 409 && /Volvé a intentar/.test(e.message));

  assert.equal(base.llamadas.filter((l) => l.modelo === "cliente_canales" && l.metodo === "findUnique").length, 1, "no hubo segunda búsqueda por canal");
});

test("con el cliente raíz sí reintenta ante el UNIQUE: el otro pedido ya confirmó y se ve", async () => {
  const base = baseFalsa();
  base.antes("clientes.create", async () => {
    await base.tx.clientes.create({ data: { canal: "web", dni: "30125678", nombre: "Ganadora" } });
  });

  const { cliente, creado } = await resolverCliente({ canal: "presencial", dni: "30125678", nombre: "Perdedora" }, base.db);

  assert.deepEqual([creado, cliente.nombre], [false, "Ganadora"]);
  assert.equal(base.llamadas.filter((l) => l.modelo === "clientes" && l.metodo === "findFirst").length, 2, "buscó otra vez");
});

test("si tras el P2002 la ficha no aparece, se relanza el error original; los demás errores no se reintentan", async () => {
  const p2002 = Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
  const sinGanadora = baseFalsa();
  sinGanadora.antes("clientes.create", () => {
    throw p2002;
  });
  await assert.rejects(resolverCliente({ canal: "presencial", dni: "30125678" }, sinGanadora.db), (e) => e === p2002);

  const caida = new Error("conexión perdida");
  const conCaida = baseFalsa();
  conCaida.antes("clientes.create", () => {
    throw caida;
  });
  await assert.rejects(resolverCliente({ canal: "presencial", dni: "30125678" }, conCaida.db), (e) => e === caida);
  assert.equal(conCaida.llamadas.filter((l) => l.modelo === "clientes" && l.metodo === "findFirst").length, 1, "no hubo segunda búsqueda");
});

// ── fusionarClientes ──

// Destino 10 (vigente, con DNI), origen 11 (el del bot), 12 (ajena) y 13 (ya fusionada en el origen).
function escenarioFusion(cambios = {}) {
  return baseFalsa({
    clientes: [
      { id: 10, canal: "web", nombre: "Joel Prueba", telefono: TEL, dni: "30125678" },
      { id: 11, canal: "whatsapp", nombre: "Joel" },
      { id: 12, canal: "presencial", nombre: "Otra Persona", telefono: "3511234567", dni: "20111222" },
      { id: 13, canal: "whatsapp", deleted_at: FECHA, fusionado_en_id: 11 },
    ],
    cliente_canales: [canalWhatsapp(1, 11), canalWhatsapp(2, 12, "5493511234567")],
    chat_estado: [{ id: 1, cliente_id: 11 }, { id: 2, cliente_id: 11 }, { id: 3, cliente_id: 10 }, { id: 4, cliente_id: 12 }],
    historial_mensajes: [{ id: 100n, cliente_id: 11 }, { id: 101n, cliente_id: 11 }, { id: 102n, cliente_id: 12 }],
    ia_consumos: [{ id: 200n, cliente_id: 11 }, { id: 201n, cliente_id: null }],
    verificacion_intentos: [{ id: 300n, cliente_id: 11 }],
    alertas_stock: [{ id: 400, cliente_id: 11 }],
    entregas: [{ id: 500, cliente_id: 11 }, { id: 501, cliente_id: 12 }],
    senas: [{ id: 600, cliente_id: 11 }],
    financiaciones: [{ id: 700, cliente_id: 11 }],
    consignacion_ingresos: [{ id: 800, cliente_id: 11 }, { id: 801, cliente_id: 12, conyuge_cliente_id: 11 }],
    consentimientos: [{ id: 900, cliente_id: 11 }],
    consultas_crediticias: [{ id: 950, cliente_id: 11 }, { id: 951, cliente_id: 12 }],
    ...cambios,
  });
}

const columna = (base, tabla, campo = "cliente_id") => base.filas(tabla).map((f) => [Number(f.id), f[campo]]);
const fichaDe = (base, id) => base.filas("clientes").find((c) => c.id === id);

test("fusionarClientes valida los ids, que sean distintos y el motivo, antes de tocar nada", async () => {
  const base = escenarioFusion();
  const invalidos = [
    { origenId: 0, destinoId: 10 },
    { origenId: "abc", destinoId: 10 },
    { origenId: 11 },
    { origenId: 11, destinoId: 11 },
    { origenId: 11, destinoId: 10, motivo: "porque_si" },
  ];
  for (const args of invalidos) {
    await assert.rejects(fusionarClientes(args, base.db), (e) => e.status === 400, JSON.stringify(args));
  }
  assert.deepEqual(base.escrituras(), []);
});

test("las dos fichas tienen que existir (404) y estar vigentes (409)", async () => {
  const base = escenarioFusion();
  const antes = estado(base);

  await assert.rejects(fusionarClientes({ origenId: 999, destinoId: 10 }, base.db), (e) => e.status === 404);
  await assert.rejects(fusionarClientes({ origenId: 11, destinoId: 999 }, base.db), (e) => e.status === 404);
  await assert.rejects(fusionarClientes({ origenId: 13, destinoId: 10 }, base.db), (e) => e.status === 409);
  await assert.rejects(fusionarClientes({ origenId: 11, destinoId: 13 }, base.db), (e) => e.status === 409);

  assert.deepEqual(estado(base), antes);
});

test("dos fichas con DNI distinto no se fusionan nunca (409); con el mismo DNI escrito distinto sí", async () => {
  const distintos = escenarioFusion();
  await assert.rejects(fusionarClientes({ origenId: 12, destinoId: 10 }, distintos.db), (e) => e.status === 409 && /DNI/.test(e.message));
  assert.deepEqual(distintos.escrituras(), []);

  const mismo = escenarioFusion({
    clientes: [
      { id: 10, canal: "web", dni: "30125678" },
      { id: 11, canal: "presencial", dni: "30.125.678" },
    ],
  });
  await fusionarClientes({ origenId: 11, destinoId: 10, motivo: "mismo_dni" }, mismo.db);
  assert.equal(fichaDe(mismo, 11).fusionado_en_id, 10);
  assert.equal(fichaDe(mismo, 10).dni, "30125678");
});

test("la fusión pasa el CUIL del origen si el destino no tiene; con CUIL distintos no se fusionan (409)", async () => {
  const completa = escenarioFusion({ clientes: [{ id: 10, canal: "web" }, { id: 11, canal: "presencial", cuil: "20123456786" }] });
  await fusionarClientes({ origenId: 11, destinoId: 10, motivo: "manual" }, completa.db);
  assert.equal(fichaDe(completa, 10).cuil, "20123456786");

  const distintos = escenarioFusion({ clientes: [{ id: 10, canal: "web", cuil: "20123456786" }, { id: 11, canal: "presencial", cuil: "27301256782" }] });
  await assert.rejects(fusionarClientes({ origenId: 11, destinoId: 10 }, distintos.db), (e) => e.status === 409 && /CUIL/.test(e.message));
  assert.deepEqual(distintos.escrituras(), []);
});

test("dos documentos con letras que comparten los dígitos no son la misma persona (409); el mismo escrito distinto sí", async () => {
  const distintos = escenarioFusion({
    clientes: [
      { id: 10, canal: "web", dni: "AB123456" },
      { id: 11, canal: "presencial", dni: "CD123456" },
    ],
  });
  await assert.rejects(fusionarClientes({ origenId: 11, destinoId: 10 }, distintos.db), (e) => e.status === 409 && /DNI/.test(e.message));
  assert.deepEqual(distintos.escrituras(), []);

  const mismo = escenarioFusion({
    clientes: [
      { id: 10, canal: "web", dni: "AB123456" },
      { id: 11, canal: "presencial", dni: "ab-123 456" },
    ],
  });
  await fusionarClientes({ origenId: 11, destinoId: 10, motivo: "mismo_dni" }, mismo.db);
  assert.equal(fichaDe(mismo, 11).fusionado_en_id, 10);
});

test("un DNI hecho solo de separadores cuenta como vacío: no choca con el del otro", async () => {
  const base = escenarioFusion({
    clientes: [
      { id: 10, canal: "web", dni: "30125678" },
      { id: 11, canal: "presencial", dni: " - . " },
    ],
  });

  await fusionarClientes({ origenId: 11, destinoId: 10, motivo: "manual" }, base.db);

  assert.equal(fichaDe(base, 11).fusionado_en_id, 10);
});

test("si las dos fichas son titular y cónyuge de un mismo ingreso, no se fusionan (409) y no se toca nada", async () => {
  for (const ingreso of [{ id: 802, cliente_id: 11, conyuge_cliente_id: 10 }, { id: 802, cliente_id: 10, conyuge_cliente_id: 11 }]) {
    const base = escenarioFusion({ consignacion_ingresos: [ingreso] });
    await assert.rejects(fusionarClientes({ origenId: 11, destinoId: 10 }, base.db), (e) => e.status === 409 && /cónyuge/.test(e.message));
    assert.deepEqual(base.escrituras(), []);
  }
});

test("pasan al destino todas las filas hijas del origen, y las de otras personas quedan donde estaban", async () => {
  const base = escenarioFusion();

  await fusionarClientes({ origenId: 11, destinoId: 10, motivo: "mismo_telefono" }, base.db);

  assert.deepEqual(columna(base, "chat_estado"), [[1, 10], [2, 10], [3, 10], [4, 12]]);
  assert.deepEqual(columna(base, "historial_mensajes"), [[100, 10], [101, 10], [102, 12]]);
  assert.deepEqual(columna(base, "ia_consumos"), [[200, 10], [201, null]]);
  assert.deepEqual(columna(base, "verificacion_intentos"), [[300, 10]]);
  assert.deepEqual(columna(base, "alertas_stock"), [[400, 10]]);
  assert.deepEqual(columna(base, "entregas"), [[500, 10], [501, 12]]);
  assert.deepEqual(columna(base, "senas"), [[600, 10]]);
  assert.deepEqual(columna(base, "financiaciones"), [[700, 10]]);
  assert.deepEqual(columna(base, "consignacion_ingresos"), [[800, 10], [801, 12]]);
  assert.deepEqual(columna(base, "consignacion_ingresos", "conyuge_cliente_id"), [[800, null], [801, 10]]);
  assert.deepEqual(columna(base, "cliente_canales"), [[1, 10], [2, 12]]);
});

test("las fichas ya fusionadas en el origen pasan a apuntar al destino (la cadena queda plana)", async () => {
  const base = escenarioFusion();

  await fusionarClientes({ origenId: 11, destinoId: 10, motivo: "mismo_telefono" }, base.db);

  assert.deepEqual(columna(base, "clientes", "fusionado_en_id"), [[10, null], [11, 10], [12, null], [13, 10]]);
});

test("el origen se archiva con la fecha de la fusión y ninguna fila se borra", async () => {
  const base = escenarioFusion();
  const antes = new Date();

  await fusionarClientes({ origenId: 11, destinoId: 10, motivo: "mismo_telefono" }, base.db);

  const origen = fichaDe(base, 11);
  assert.ok(origen.deleted_at instanceof Date && origen.deleted_at >= antes && origen.deleted_at <= new Date());
  assert.equal(origen.fusionado_en_id, 10);
  assert.deepEqual(base.filas("clientes").map((c) => c.id), [10, 11, 12, 13]);
  assert.equal(fichaDe(base, 10).deleted_at, null);
});

test("archiva el origen antes de completar el DNI del destino (el índice único de DNI entre vigentes lo exige)", async () => {
  const base = escenarioFusion({
    clientes: [
      { id: 10, canal: "web", nombre: "Joel", telefono: TEL },
      { id: 11, canal: "presencial", nombre: "Joel P.", dni: "30125678" },
    ],
  });

  const resumen = await fusionarClientes({ origenId: 11, destinoId: 10, motivo: "mismo_dni" }, base.db);

  assert.equal(fichaDe(base, 10).dni, "30125678");
  assert.equal(fichaDe(base, 11).fusionado_en_id, 10);
  assert.deepEqual(resumen.completados, { dni: "30125678" });
});

test("al destino solo se le completan los huecos (el teléfono, normalizado) y nunca se le pisa un valor", async () => {
  const conHuecos = escenarioFusion({
    clientes: [
      { id: 10, canal: "web" },
      { id: 11, canal: "whatsapp", nombre: "Joel", telefono: WA, dni: "30125678", email: "joel@x.com" },
    ],
  });
  const resumen = await fusionarClientes({ origenId: 11, destinoId: 10, motivo: "mismo_telefono" }, conHuecos.db);
  const esperado = { nombre: "Joel", telefono: TEL, dni: "30125678", email: "joel@x.com" };
  assert.deepEqual(resumen.completados, esperado);
  assert.deepEqual(
    (({ nombre, telefono, dni, email }) => ({ nombre, telefono, dni, email }))(fichaDe(conHuecos, 10)),
    esperado
  );

  const completo = escenarioFusion({
    clientes: [
      { id: 10, canal: "web", nombre: "Ana", telefono: "3511234567", dni: "30125678", email: "ana@x.com" },
      { id: 11, canal: "whatsapp", nombre: "Joel", telefono: WA, dni: "30125678", email: "joel@x.com" },
    ],
  });
  const sinCambios = await fusionarClientes({ origenId: 11, destinoId: 10, motivo: "mismo_dni" }, completo.db);
  assert.deepEqual(sinCambios.completados, {});
  assert.deepEqual([fichaDe(completo, 10).nombre, fichaDe(completo, 10).telefono, fichaDe(completo, 10).email], ["Ana", "3511234567", "ana@x.com"]);
});

test("al completar el destino no convierte en argentino el teléfono extranjero de una ficha de WhatsApp", async () => {
  const base = escenarioFusion({
    clientes: [
      { id: 10, canal: "web" },
      { id: 11, canal: "whatsapp", telefono: "93704123456" },
    ],
  });

  const resumen = await fusionarClientes({ origenId: 11, destinoId: 10, motivo: "manual" }, base.db);

  assert.deepEqual(resumen.completados, { telefono: "93704123456" });
  assert.equal(fichaDe(base, 10).telefono, "93704123456");
});

test("registra la fusión con los ids movidos por tabla, lo completado, el perfil y una foto del origen", async () => {
  const base = escenarioFusion();

  const resumen = await fusionarClientes({ origenId: 11, destinoId: 10, motivo: "mismo_telefono" }, base.db);

  const [fusion] = base.filas("cliente_fusiones");
  assert.deepEqual([fusion.origen_id, fusion.destino_id, fusion.motivo], [11, 10, "mismo_telefono"]);
  assert.deepEqual(fusion.detalle.movidos, {
    chat_estado: [1, 2],
    historial_mensajes: [100, 101],
    ia_consumos: [200],
    verificacion_intentos: [300],
    alertas_stock: [400],
    entregas: [500],
    senas: [600],
    financiaciones: [700],
    consignacion_ingresos: [800],
    "consignacion_ingresos.conyuge_cliente_id": [801],
    cliente_canales: [1],
    consentimientos: [900],
    consultas_crediticias: [950],
    "clientes.fusionado_en_id": [13],
  });
  assert.deepEqual(fusion.detalle.completados, {});
  assert.deepEqual(fusion.detalle.perfil, { accion: "sin_perfil" });
  assert.deepEqual(
    [fusion.detalle.origen.id, fusion.detalle.origen.nombre, fusion.detalle.origen.canal, fusion.detalle.origen.deleted_at],
    [11, "Joel", "whatsapp", null],
    "la foto es del origen tal como estaba antes de fusionarlo"
  );
  assert.equal(resumen.fusionId, fusion.id);
});

test("devuelve un resumen con la cantidad de filas movidas por tabla", async () => {
  const resumen = await fusionarClientes({ origenId: 11, destinoId: 10, motivo: "mismo_telefono" }, escenarioFusion().db);

  assert.deepEqual(resumen, {
    fusionId: resumen.fusionId,
    origenId: 11,
    destinoId: 10,
    motivo: "mismo_telefono",
    movidos: {
      chat_estado: 2,
      historial_mensajes: 2,
      ia_consumos: 1,
      verificacion_intentos: 1,
      alertas_stock: 1,
      entregas: 1,
      senas: 1,
      financiaciones: 1,
      consignacion_ingresos: 1,
      "consignacion_ingresos.conyuge_cliente_id": 1,
      cliente_canales: 1,
      consentimientos: 1,
      consultas_crediticias: 1,
      "clientes.fusionado_en_id": 1,
    },
    completados: {},
    perfil: "sin_perfil",
  });
});

test("sin motivo la fusión queda como manual", async () => {
  const base = escenarioFusion();

  const resumen = await fusionarClientes({ origenId: 11, destinoId: 10 }, base.db);

  assert.equal(resumen.motivo, "manual");
  assert.equal(base.filas("cliente_fusiones")[0].motivo, "manual");
});

test("perfil: si solo el origen lo tiene, pasa al destino", async () => {
  const base = escenarioFusion({ cliente_perfiles: [{ id: 1, cliente_id: 11, apellido: "Pérez" }] });

  const resumen = await fusionarClientes({ origenId: 11, destinoId: 10 }, base.db);

  assert.deepEqual(columna(base, "cliente_perfiles"), [[1, 10]]);
  assert.equal(resumen.perfil, "movido");
  assert.deepEqual(base.filas("cliente_fusiones")[0].detalle.perfil, { accion: "movido", perfilId: 1 });
});

test("perfil: si no lo tiene el origen, el del destino no se toca", async () => {
  const base = escenarioFusion({ cliente_perfiles: [{ id: 2, cliente_id: 10, apellido: "Gómez" }] });

  const resumen = await fusionarClientes({ origenId: 11, destinoId: 10 }, base.db);

  assert.deepEqual(base.filas("cliente_perfiles"), [{ ...DEFECTOS.cliente_perfiles, id: 2, cliente_id: 10, apellido: "Gómez" }]);
  assert.equal(resumen.perfil, "sin_perfil");
});

test("perfil: si los dos lo tienen se completan los huecos del destino y el del origen queda con el origen archivado", async () => {
  const delOrigen = {
    id: 1, cliente_id: 11, apellido: "Pérez", cuit: "27999999999",
    domicilio: "Calle 2", localidad: "Palpalá", provincia: "Jujuy",
    cbu: "0123456789012345678901", alias_cbu: "joel.mp", banco_cbu: "Mercado Pago",
    contacto_alt_telefono: "3884001122", contacto_alt_vinculo: "pareja",
  };
  const base = escenarioFusion({ cliente_perfiles: [delOrigen, { id: 2, cliente_id: 10, cuit: "20301256789" }] });

  const resumen = await fusionarClientes({ origenId: 11, destinoId: 10, motivo: "mismo_dni" }, base.db);

  const [queda, completado] = base.filas("cliente_perfiles");
  assert.deepEqual(queda, { ...DEFECTOS.cliente_perfiles, ...delOrigen }, "el perfil del origen queda como estaba, con el origen");
  assert.deepEqual(
    completado,
    { ...delOrigen, id: 2, cliente_id: 10, cuit: "20301256789", updated_at: completado.updated_at },
    "el del destino se completa sin pisar el CUIT"
  );
  assert.ok(completado.updated_at > ULTIMA_ACTIVIDAD, "completar es un cambio de datos: updated_at se actualiza");
  assert.equal(resumen.perfil, "completado");
  const { perfil } = base.filas("cliente_fusiones")[0].detalle;
  assert.deepEqual([perfil.accion, perfil.perfilOrigenId, perfil.perfilDestinoId], ["completado", 1, 2]);
  assert.deepEqual(Object.keys(perfil.campos).sort(), [
    "alias_cbu", "apellido", "banco_cbu", "cbu", "contacto_alt_telefono", "contacto_alt_vinculo", "domicilio", "localidad", "provincia",
  ]);
});

test("perfil: los datos que van juntos no se mezclan (cuenta, domicilio, contacto alternativo)", async () => {
  const base = escenarioFusion({
    cliente_perfiles: [
      {
        id: 1, cliente_id: 11, domicilio: "Calle 2", localidad: "Palpalá",
        alias_cbu: "otra.cuenta", banco_cbu: "Otro Banco", contacto_alt_telefono: "3884001122", contacto_alt_vinculo: "hijo_a",
      },
      { id: 2, cliente_id: 10, domicilio: "Calle 1", cbu: "0000000000000000000001" },
    ],
  });

  await fusionarClientes({ origenId: 11, destinoId: 10 }, base.db);

  const [, destino] = base.filas("cliente_perfiles");
  assert.deepEqual(
    [destino.domicilio, destino.localidad, destino.cbu, destino.alias_cbu, destino.banco_cbu],
    ["Calle 1", null, "0000000000000000000001", null, null],
    "con un domicilio o una cuenta ya cargados no se le agregan piezas de otra"
  );
  assert.deepEqual([destino.contacto_alt_telefono, destino.contacto_alt_vinculo], ["3884001122", "hijo_a"], "el contacto alternativo va entero");
});

// ── updated_at (A3) ──
// `chat_estado`, `consignacion_ingresos` y `cliente_perfiles` tienen `updated_at ... ON UPDATE CURRENT_TIMESTAMP`:
// cambiar su `cliente_id` lo pisaría con la hora de la fusión, y `lead.mapper.js` lee
// `chat_estado.updated_at` como la "última actividad" de la consulta.

const ACTIVIDAD = {
  uno: new Date("2026-09-01T10:00:00Z"),
  dos: new Date("2026-09-02T11:00:00Z"),
  tres: new Date("2026-09-03T12:00:00Z"),
  cuatro: new Date("2026-09-04T13:00:00Z"),
  cinco: new Date("2026-09-05T14:00:00Z"),
};
const actividadDe = (base, tabla) => base.filas(tabla).map((f) => [Number(f.id), f.updated_at]);

test("mover las filas de una consulta, un ingreso o un perfil al destino no cambia su updated_at", async () => {
  const base = escenarioFusion({
    chat_estado: [
      { id: 1, cliente_id: 11, updated_at: ACTIVIDAD.uno },
      { id: 2, cliente_id: 11, updated_at: ACTIVIDAD.dos },
      { id: 3, cliente_id: 12, updated_at: ACTIVIDAD.tres },
    ],
    consignacion_ingresos: [
      { id: 800, cliente_id: 11, updated_at: ACTIVIDAD.cuatro },
      { id: 801, cliente_id: 12, conyuge_cliente_id: 11, updated_at: ACTIVIDAD.cinco },
    ],
    cliente_perfiles: [{ id: 1, cliente_id: 11, apellido: "Pérez", updated_at: ACTIVIDAD.uno }],
  });
  const antes = Object.fromEntries(["chat_estado", "consignacion_ingresos", "cliente_perfiles"].map((tabla) => [tabla, actividadDe(base, tabla)]));

  await fusionarClientes({ origenId: 11, destinoId: 10 }, base.db);

  for (const [tabla, esperado] of Object.entries(antes)) {
    assert.deepEqual(actividadDe(base, tabla), esperado, `${tabla}: la hora de la última actividad queda como estaba`);
  }
  assert.deepEqual(columna(base, "chat_estado"), [[1, 10], [2, 10], [3, 12]], "y las filas sí se movieron");
  assert.deepEqual(columna(base, "consignacion_ingresos"), [[800, 10], [801, 12]]);
  assert.deepEqual(columna(base, "consignacion_ingresos", "conyuge_cliente_id"), [[800, null], [801, 10]]);
  assert.deepEqual(columna(base, "cliente_perfiles"), [[1, 10]]);
});

test("mover de a una fila no cambia lo que se registra: los mismos ids por tabla y la misma cantidad", async () => {
  const base = escenarioFusion();

  const resumen = await fusionarClientes({ origenId: 11, destinoId: 10, motivo: "mismo_telefono" }, base.db);

  const { movidos } = base.filas("cliente_fusiones")[0].detalle;
  assert.deepEqual([movidos.chat_estado, movidos.consignacion_ingresos, movidos["consignacion_ingresos.conyuge_cliente_id"]], [[1, 2], [800], [801]]);
  assert.deepEqual([resumen.movidos.chat_estado, resumen.movidos.consignacion_ingresos], [2, 1]);
});

test("un perfil completado sí es un cambio de datos: el del destino actualiza updated_at y el del origen queda como estaba", async () => {
  const base = escenarioFusion({
    cliente_perfiles: [
      { id: 1, cliente_id: 11, apellido: "Pérez", updated_at: ACTIVIDAD.uno },
      { id: 2, cliente_id: 10, cuit: "20301256789", updated_at: ACTIVIDAD.dos },
    ],
  });

  const resumen = await fusionarClientes({ origenId: 11, destinoId: 10 }, base.db);

  const [delOrigen, delDestino] = base.filas("cliente_perfiles");
  assert.equal(resumen.perfil, "completado");
  assert.deepEqual(delOrigen.updated_at, ACTIVIDAD.uno);
  assert.ok(delDestino.updated_at > ACTIVIDAD.dos);
  assert.equal(delDestino.apellido, "Pérez");
});

test("la fusión es todo o nada: si un paso falla se deshace entera", async () => {
  const base = escenarioFusion({ cliente_perfiles: [{ id: 1, cliente_id: 11, apellido: "Pérez" }] });
  const antes = estado(base);
  base.antes("senas.updateMany", () => {
    throw new Error("se cayó la conexión");
  });

  await assert.rejects(fusionarClientes({ origenId: 11, destinoId: 10 }, base.db), /se cayó la conexión/);

  assert.deepEqual(estado(base), antes);
  assert.equal(base.transacciones.revertidas, 1);
});

test("la transacción de la fusión pide más tiempo que los 5 s por defecto: toca una docena de tablas", async () => {
  const base = escenarioFusion();

  await fusionarClientes({ origenId: 11, destinoId: 10 }, base.db);

  assert.equal(base.transacciones.opciones.length, 1);
  assert.ok(base.transacciones.opciones[0].timeout > 5_000);
});

test("si db ya es una transacción (sin $transaction) fusiona directo", async () => {
  const base = escenarioFusion();

  await fusionarClientes({ origenId: 11, destinoId: 10 }, base.tx);

  assert.equal(base.transacciones.abiertas, 0);
  assert.equal(fichaDe(base, 11).fusionado_en_id, 10);
  assert.equal(base.filas("cliente_fusiones").length, 1);
});

// ── planDeUnificacion ──
// Recibe las fichas como las lee Prisma, `{ id, nombre, canal, telefono, dni }`, con el `telefono` que dejó
// `normalizarTelefonos` (10 dígitos nacionales). No lee `canal_id` (la 074 lo saca) ni vuelve a normalizar.

const fichaPlan = (datos) => ({ nombre: null, telefono: null, dni: null, canal: "web", ...datos });
const DNI_NO_VALIDO = "dni_no_valido";

test("un teléfono con dos DNIs distintos es dudoso y no se une nada (caso real de la base local)", () => {
  const plan = planDeUnificacion([
    fichaPlan({ id: 1704, nombre: "Joel Prueba", telefono: TEL, dni: "30125678", canal: "web" }),
    fichaPlan({ id: 1705, nombre: "Joel", telefono: TEL, canal: "whatsapp" }),
    fichaPlan({ id: 1732, nombre: "joel", telefono: TEL, dni: "47544582", canal: "presencial" }),
  ]);

  assert.deepEqual(plan, {
    grupos: [],
    dudosos: [
      {
        telefono: TEL,
        fichas: [
          { id: 1704, dni: "30125678", canal: "web", nombre: "Joel Prueba" },
          { id: 1705, dni: null, canal: "whatsapp", nombre: "Joel" },
          { id: 1732, dni: "47544582", canal: "presencial", nombre: "joel" },
        ],
      },
    ],
    revisar: [],
  });
});

test("la ficha de WhatsApp y la web con el mismo teléfono ya normalizado se unen", () => {
  const plan = planDeUnificacion([
    fichaPlan({ id: 1719, nombre: "Ana", telefono: "3887000101", dni: "30000101" }),
    fichaPlan({ id: 1726, nombre: "Ana", telefono: "3887000101", canal: "whatsapp" }),
  ]);

  assert.deepEqual(plan, { grupos: [{ destinoId: 1719, origenes: [{ id: 1726, motivo: "mismo_telefono" }] }], dudosos: [], revisar: [] });
});

test("el mismo DNI es la misma persona aunque cambie el teléfono; el destino es la de id más bajo", () => {
  const plan = planDeUnificacion([
    fichaPlan({ id: 9, telefono: "3512222222", dni: "30000101", canal: "presencial" }),
    fichaPlan({ id: 3, telefono: "3511111111", dni: "30.000.101" }),
    fichaPlan({ id: 5, telefono: "3513333333", dni: "30000101" }),
  ]);

  assert.deepEqual(plan.grupos, [
    {
      destinoId: 3,
      origenes: [
        { id: 5, motivo: "mismo_dni" },
        { id: 9, motivo: "mismo_dni" },
      ],
    },
  ]);
  assert.deepEqual(plan.dudosos, []);
});

test("dos fichas con el mismo DNI y el mismo teléfono no son un teléfono dudoso: es la misma persona", () => {
  const plan = planDeUnificacion([fichaPlan({ id: 1, telefono: TEL, dni: "30125678" }), fichaPlan({ id: 2, telefono: TEL, dni: "30125678", canal: "presencial" })]);

  assert.deepEqual(plan, { grupos: [{ destinoId: 1, origenes: [{ id: 2, motivo: "mismo_dni" }] }], dudosos: [], revisar: [] });
});

test("sin ningún DNI, el mismo teléfono une las fichas y el destino es la de id más bajo", () => {
  const plan = planDeUnificacion([
    fichaPlan({ id: 20, canal: "whatsapp", telefono: "3884001122" }),
    fichaPlan({ id: 8, telefono: "3884001122" }),
  ]);

  assert.deepEqual(plan.grupos, [{ destinoId: 8, origenes: [{ id: 20, motivo: "mismo_telefono" }] }]);
});

test("el destino es la ficha con DNI aunque tenga un id más alto que otra sin DNI", () => {
  const plan = planDeUnificacion([
    fichaPlan({ id: 5, canal: "whatsapp", telefono: "3884001122" }),
    fichaPlan({ id: 9, telefono: "3884001122", dni: "30000101", canal: "presencial" }),
  ]);

  assert.deepEqual(plan.grupos, [{ destinoId: 9, origenes: [{ id: 5, motivo: "mismo_telefono" }] }]);
});

test("en un mismo grupo cada origen lleva su motivo: mismo DNI o mismo teléfono", () => {
  const plan = planDeUnificacion([
    fichaPlan({ id: 1, telefono: "3884001122", dni: "30000101" }),
    fichaPlan({ id: 2, telefono: "3511111111", dni: "30000101", canal: "presencial" }),
    fichaPlan({ id: 3, canal: "whatsapp", telefono: "3884001122" }),
  ]);

  assert.deepEqual(plan.grupos, [
    {
      destinoId: 1,
      origenes: [
        { id: 2, motivo: "mismo_dni" },
        { id: 3, motivo: "mismo_telefono" },
      ],
    },
  ]);
});

test("el DNI ya unido cuenta una sola vez: un teléfono limpio une, uno con otro DNI queda dudoso", () => {
  const plan = planDeUnificacion([
    fichaPlan({ id: 1, telefono: "3884001122", dni: "30000101" }),
    fichaPlan({ id: 2, telefono: "3511111111", dni: "30000101", canal: "presencial" }),
    fichaPlan({ id: 3, canal: "whatsapp", telefono: "3884001122" }),
    fichaPlan({ id: 4, telefono: "3511111111", dni: "20111222" }),
  ]);

  assert.deepEqual(plan.grupos, [
    {
      destinoId: 1,
      origenes: [
        { id: 2, motivo: "mismo_dni" },
        { id: 3, motivo: "mismo_telefono" },
      ],
    },
  ]);
  assert.deepEqual(plan.dudosos, [
    {
      telefono: "3511111111",
      fichas: [
        { id: 2, dni: "30000101", canal: "presencial", nombre: null },
        { id: 4, dni: "20111222", canal: "web", nombre: null },
      ],
    },
  ]);
});

test("un teléfono con dos DNIs distintos es dudoso también para las fichas sin DNI: no se une ninguna", () => {
  const plan = planDeUnificacion([
    fichaPlan({ id: 1, telefono: TEL, dni: "30125678" }),
    fichaPlan({ id: 2, telefono: TEL, dni: "47544582" }),
    fichaPlan({ id: 3, telefono: TEL }),
  ]);

  assert.deepEqual(plan.grupos, []);
  assert.deepEqual(plan.dudosos.map((d) => [d.telefono, d.fichas.map((f) => f.id)]), [[TEL, [1, 2, 3]]]);
});

test("lo que no se relaciona queda afuera: un teléfono suelto no es grupo y los que no son de 10 dígitos no cruzan con nada", () => {
  const plan = planDeUnificacion([
    fichaPlan({ id: 1, telefono: "3884001122" }),
    fichaPlan({ id: 3, canal: "presencial", dni: "30125678" }),
    fichaPlan({ id: 4, telefono: "+1 415 555 0123" }),
    fichaPlan({ id: 5, telefono: "+1 415 555 0123" }),
    fichaPlan({ id: 6, telefono: "12345" }),
    fichaPlan({ id: 7, telefono: "12345" }),
  ]);

  assert.deepEqual(plan, { grupos: [], dudosos: [], revisar: [] });
});

test("el plan no mira canal_id: una ficha de WhatsApp sin teléfono no se une por un número que solo está ahí", () => {
  const plan = planDeUnificacion([
    fichaPlan({ id: 1, telefono: "3884001122" }),
    fichaPlan({ id: 2, canal: "whatsapp", canal_id: "5493884001122" }),
  ]);

  assert.deepEqual(plan, { grupos: [], dudosos: [], revisar: [] });
});

test("el plan no vuelve a normalizar: un número extranjero que parece argentino no cruza con el de Formosa", () => {
  // 93704123456 es de Afganistán; leído como argentino sería el 3704123456 de Formosa.
  const plan = planDeUnificacion([
    fichaPlan({ id: 1, nombre: "Hamid", telefono: "93704123456", canal: "whatsapp" }),
    fichaPlan({ id: 2, nombre: "Formoseña", telefono: "3704123456" }),
    fichaPlan({ id: 3, telefono: "388 400-1122" }),
    fichaPlan({ id: 4, telefono: "3884001122" }),
  ]);

  assert.deepEqual(plan, { grupos: [], dudosos: [], revisar: [] });
});

test("con varios grupos, salen ordenados por la ficha de destino", () => {
  const plan = planDeUnificacion([
    fichaPlan({ id: 2, canal: "whatsapp", telefono: "3884001122" }),
    fichaPlan({ id: 8, telefono: "3884001122", dni: "30000101" }),
    fichaPlan({ id: 5, telefono: "3511111111", dni: "20111222" }),
    fichaPlan({ id: 6, canal: "whatsapp", telefono: "3511111111" }),
  ]);

  assert.deepEqual(plan.grupos, [
    { destinoId: 5, origenes: [{ id: 6, motivo: "mismo_telefono" }] },
    { destinoId: 8, origenes: [{ id: 2, motivo: "mismo_telefono" }] },
  ]);
});

test("no muta lo que recibe y el resultado no depende del orden de entrada", () => {
  const fichas = [
    fichaPlan({ id: 1704, telefono: TEL, dni: "30125678" }),
    fichaPlan({ id: 1705, canal: "whatsapp", telefono: TEL }),
    fichaPlan({ id: 1719, telefono: "3887000101", dni: "30000101" }),
    fichaPlan({ id: 1726, canal: "whatsapp", telefono: "3887000101" }),
    fichaPlan({ id: 1732, telefono: TEL, dni: "47544582", canal: "presencial" }),
    fichaPlan({ id: 1740, dni: "S/D" }),
  ];
  const congeladas = Object.freeze(fichas.map((f) => Object.freeze({ ...f })));

  const plan = planDeUnificacion(congeladas);

  assert.deepEqual(planDeUnificacion([...fichas].reverse()), plan);
  assert.equal(plan.grupos.length, 1);
  assert.equal(plan.dudosos.length, 1);
  assert.equal(plan.revisar.length, 1);
});

test("sin fichas no hay nada que unificar", () => {
  assert.deepEqual(planDeUnificacion([]), { grupos: [], dudosos: [], revisar: [] });
});

test("con 12.000 fichas el plan da el resultado exacto y no se vuelve cuadrático", () => {
  // 4.000 personas con 3 fichas cada una: dos comparten el DNI y la tercera no tiene ni DNI ni teléfono. El teléfono
  // de la primera se repite entre la persona p y la p + 2000, que tienen DNI distintos: 2.000 teléfonos dudosos.
  const fichas = Array.from({ length: 4000 }, (_, p) =>
    [0, 1, 2].map((k) => fichaPlan({ id: p * 3 + k + 1, telefono: k === 0 ? String(3880000000 + (p % 2000)) : null, dni: k < 2 ? String(20000000 + p) : null }))
  ).flat();

  const desde = performance.now();
  const plan = planDeUnificacion(fichas);
  const milisegundos = performance.now() - desde;

  assert.equal(fichas.length, 12_000);
  assert.equal(plan.grupos.length, 4000);
  assert.ok(plan.grupos.every((g) => g.origenes.length === 1 && g.origenes[0].motivo === "mismo_dni"));
  assert.equal(plan.dudosos.length, 2000);
  assert.deepEqual(plan.revisar, []);
  assert.ok(milisegundos < 2000, `tardó ${Math.round(milisegundos)} ms`);
});

// Documentos con letras (A5) y DNI que no es un DNI (A6)

test("dos documentos con letras que comparten los dígitos no son la misma persona: van a revisar y no se unen", () => {
  const plan = planDeUnificacion([
    fichaPlan({ id: 1, dni: "AB123456", telefono: "3511111111" }),
    fichaPlan({ id: 2, dni: "CD123456", telefono: "3512222222" }),
    fichaPlan({ id: 3, dni: "ab-123456", telefono: "3513333333" }),
  ]);

  assert.deepEqual(plan, {
    grupos: [],
    dudosos: [],
    revisar: [
      { id: 1, motivo: DNI_NO_VALIDO },
      { id: 2, motivo: DNI_NO_VALIDO },
      { id: 3, motivo: DNI_NO_VALIDO },
    ],
  });
});

test("una ficha con un DNI que no es de 7 a 9 dígitos no se une por nada y va aparte, a revisar", () => {
  const plan = planDeUnificacion([
    fichaPlan({ id: 1, dni: "S/D", telefono: TEL }),
    fichaPlan({ id: 2, telefono: TEL }),
    fichaPlan({ id: 5, dni: "30125678", telefono: TEL, canal: "presencial" }),
    fichaPlan({ id: 7, dni: "S/D", telefono: "3511111111" }),
    fichaPlan({ id: 8, dni: "S/D", telefono: "3512222222" }),
  ]);

  assert.deepEqual(plan, {
    grupos: [{ destinoId: 5, origenes: [{ id: 2, motivo: "mismo_telefono" }] }],
    dudosos: [],
    revisar: [
      { id: 1, motivo: DNI_NO_VALIDO },
      { id: 7, motivo: DNI_NO_VALIDO },
      { id: 8, motivo: DNI_NO_VALIDO },
    ],
  });
});

test("el largo del DNI manda: de 7 a 9 dígitos se une por DNI; con menos o con más va a revisar", () => {
  const casos = [["1234567", true], ["12345678", true], ["123456789", true], ["123456", false], ["1234567890", false]];
  for (const [dni, valido] of casos) {
    const plan = planDeUnificacion([fichaPlan({ id: 1, dni }), fichaPlan({ id: 2, dni: ` ${dni} ` })]);

    assert.equal(plan.grupos.length, valido ? 1 : 0, dni);
    assert.deepEqual(plan.revisar.map((r) => r.id), valido ? [] : [1, 2], dni);
  }
});

test("una ficha a revisar no hace dudoso el teléfono de otras ni cuenta como un DNI distinto", () => {
  const plan = planDeUnificacion([
    fichaPlan({ id: 1, dni: "30125678", telefono: TEL }),
    fichaPlan({ id: 2, dni: "PASAPORTE9", telefono: TEL }),
    fichaPlan({ id: 3, telefono: TEL }),
  ]);

  assert.deepEqual(plan.grupos, [{ destinoId: 1, origenes: [{ id: 3, motivo: "mismo_telefono" }] }]);
  assert.deepEqual(plan.dudosos, []);
  assert.deepEqual(plan.revisar, [{ id: 2, motivo: DNI_NO_VALIDO }]);
});

// ── normalizarTelefonos ──

test("normalizarTelefonos deja los 10 dígitos nacionales y devuelve solo lo que cambió", async () => {
  const base = baseFalsa({
    clientes: [
      { id: 1, canal: "web", telefono: "5493884708347" },
      { id: 2, canal: "presencial", telefono: "388 470-8347" },
      { id: 3, canal: "web", telefono: "3511234567" },
      { id: 4, canal: "whatsapp" },
      { id: 5, canal: "web", telefono: "+1 415 555 0123" },
      { id: 6, canal: "web", telefono: "5493884708347", deleted_at: FECHA },
      { id: 7, canal: "whatsapp" },
      { id: 8, canal: "web" },
      { id: 9, canal: "whatsapp" },
    ],
    cliente_canales: [canalWhatsapp(1, 4, "5493887000101"), { id: 2, cliente_id: 9, canal: "facebook", identificador: "5493887000101" }],
  });

  const cambios = await normalizarTelefonos(base.db);

  assert.deepEqual(cambios, [
    { id: 1, antes: "5493884708347", despues: TEL },
    { id: 2, antes: "388 470-8347", despues: TEL },
    { id: 4, antes: null, despues: "3887000101" },
  ]);
  assert.equal(base.escrituras().length, 3, "solo se actualiza lo que cambia");
  assert.deepEqual(
    base.filas("clientes").map((c) => [c.id, c.telefono]),
    [[1, TEL], [2, TEL], [3, "3511234567"], [4, "3887000101"], [5, "+1 415 555 0123"], [6, "5493884708347"], [7, null], [8, null], [9, null]],
    "no se tocan las que no se pueden normalizar, las archivadas ni las que no tienen de dónde"
  );
});

test("normalizarTelefonos no convierte en argentino un número de WhatsApp de otro país, pero sí lo tipeado en web o presencial", async () => {
  // 93704123456 es Afganistán: leído como argentino sería el 3704123456 de Formosa.
  const base = baseFalsa({
    clientes: [
      { id: 1, canal: "whatsapp" },
      { id: 2, canal: "whatsapp", telefono: "93704123456" },
      { id: 3, canal: "whatsapp", telefono: "5493884708347" },
      { id: 4, canal: "whatsapp", telefono: TEL },
      { id: 5, canal: "web", telefono: "0388 15 470-8347" },
      { id: 6, canal: "presencial", telefono: "0388 15 470-8347" },
      { id: 7, canal: "whatsapp" },
    ],
    cliente_canales: [canalWhatsapp(1, 1, "93704123456"), canalWhatsapp(2, 7, "5493887000101")],
  });

  const cambios = await normalizarTelefonos(base.db);

  assert.deepEqual(cambios, [
    { id: 3, antes: "5493884708347", despues: TEL },
    { id: 5, antes: "0388 15 470-8347", despues: TEL },
    { id: 6, antes: "0388 15 470-8347", despues: TEL },
    { id: 7, antes: null, despues: "3887000101" },
  ]);
  assert.deepEqual(
    base.filas("clientes").slice(0, 2).map((c) => c.telefono),
    [null, "93704123456"],
    "el wa_id extranjero no se vuelve teléfono y el guardado con sus dígitos queda como está"
  );
});

test("normalizarTelefonos es repetible: la segunda vez no cambia nada", async () => {
  const base = baseFalsa({ clientes: [{ id: 1, canal: "web", telefono: "03884708347" }] });

  assert.equal((await normalizarTelefonos(base.db)).length, 1);
  const escriturasAntes = base.escrituras().length;
  assert.deepEqual(await normalizarTelefonos(base.db), []);
  assert.equal(base.escrituras().length, escriturasAntes);
});

// ── normalizarDnis ──

test("normalizarDnis deja el DNI en su forma de comparar (sin puntos, espacios ni guiones, en mayúsculas) y devuelve solo lo que cambió", async () => {
  const base = baseFalsa({
    clientes: [
      { id: 1, canal: "presencial", dni: "30.125.678" },
      { id: 2, canal: "web", dni: " 47544582 " },
      { id: 3, canal: "web", dni: "20111222" },
      { id: 4, canal: "web", dni: "DNI 27.333.444" },
      { id: 5, canal: "web", dni: "30.999.888", deleted_at: FECHA },
      { id: 6, canal: "whatsapp" },
      { id: 7, canal: "web", dni: "s/d" },
      { id: 8, canal: "web", dni: "" },
    ],
  });

  const cambios = await normalizarDnis(base.db);

  assert.deepEqual(cambios, [
    { id: 1, antes: "30.125.678", despues: "30125678" },
    { id: 2, antes: " 47544582 ", despues: "47544582" },
    { id: 4, antes: "DNI 27.333.444", despues: "DNI27333444" },
    { id: 7, antes: "s/d", despues: "S/D" },
  ]);
  assert.equal(base.escrituras().length, 4, "solo se actualiza lo que cambia");
  assert.deepEqual(
    base.filas("clientes").map((c) => [c.id, c.dni]),
    [[1, "30125678"], [2, "47544582"], [3, "20111222"], [4, "DNI27333444"], [5, "30.999.888"], [6, null], [7, "S/D"], [8, ""]],
    "no se tocan las archivadas ni las que no tienen DNI; las letras se conservan"
  );
});

test("normalizarDnis no destruye un documento con letras: dos pasaportes con los mismos dígitos siguen siendo distintos", async () => {
  const base = baseFalsa({
    clientes: [
      { id: 1, canal: "presencial", dni: "AB123456" },
      { id: 2, canal: "presencial", dni: "CD123456" },
      { id: 3, canal: "presencial", dni: "ef-123456" },
    ],
  });

  const cambios = await normalizarDnis(base.db);

  assert.deepEqual(cambios, [{ id: 3, antes: "ef-123456", despues: "EF123456" }]);
  assert.deepEqual(base.filas("clientes").map((c) => c.dni), ["AB123456", "CD123456", "EF123456"]);
});

test("normalizarDnis solo escribe el DNI de cada ficha y las recorre por id", async () => {
  const base = baseFalsa({
    clientes: [
      { id: 9, canal: "web", nombre: "Ana", telefono: "5493884708347", dni: "1.111.111" },
      { id: 2, canal: "web", dni: "2.222.222" },
    ],
  });

  const cambios = await normalizarDnis(base.db);

  assert.deepEqual(cambios.map((c) => c.id), [2, 9]);
  assert.deepEqual(base.escrituras().map((e) => e.args), [
    { where: { id: 2 }, data: { dni: "2222222" } },
    { where: { id: 9 }, data: { dni: "1111111" } },
  ]);
  assert.equal(base.filas("clientes").find((c) => c.id === 9).telefono, "5493884708347", "los demás datos no se tocan");
});

test("normalizarDnis es repetible: la segunda vez no cambia nada", async () => {
  const base = baseFalsa({ clientes: [{ id: 1, canal: "web", dni: "30.125.678" }] });

  assert.equal((await normalizarDnis(base.db)).length, 1);
  const escriturasAntes = base.escrituras().length;
  assert.deepEqual(await normalizarDnis(base.db), []);
  assert.equal(base.escrituras().length, escriturasAntes);
});

test("normalizarDnis no borra nada: la base falsa no tiene delete y el resultado son solo actualizaciones", async () => {
  const base = baseFalsa({ clientes: [{ id: 1, canal: "web", dni: "30.125.678" }] });

  await normalizarDnis(base.db);

  assert.deepEqual([...new Set(base.llamadas.filter((l) => l.metodo !== "findMany").map((l) => l.metodo))], ["update"]);
  assert.deepEqual(base.filas("clientes").map((c) => c.id), [1]);
});
