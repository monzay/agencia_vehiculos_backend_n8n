import { test } from "node:test";
import assert from "node:assert/strict";
import { crearFinanciacion } from "./financiaciones.service.js";

// Crear una financiación pasa por la puerta única de alta de clientes
// (`resolverCliente`): la persona se reconoce por DNI o por teléfono y solo se
// crea si no existe. La ficha y el plan van en UNA transacción.

const TEL = "3884708347";
const ARCHIVADA = new Date("2026-10-10T12:00:00Z");
const ALTA = new Date("2026-10-01T12:00:00Z");

const coincide = (fila, where = {}) =>
  Object.entries(where).every(([campo, esperado]) => {
    if (esperado === undefined) throw new Error(`Prisma ignora undefined: "${campo}" no filtraría nada`);
    if (esperado !== null && typeof esperado === "object") {
      if ("not" in esperado) return fila[campo] !== esperado.not;
      throw new Error(`Filtro no soportado por la base falsa: ${JSON.stringify(esperado)}`);
    }
    return (fila[campo] ?? null) === esperado;
  });

// Base falsa en memoria. `db` solo tiene `$transaction`: leer o escribir fuera de
// `tx` revienta. Ningún modelo tiene delete ni deleteMany. `fallas` hace que una
// llamada ("modelo.metodo") lance el error indicado.
function baseFalsa({ clientes = [], fallas = {} } = {}) {
  let tablas = {
    clientes: clientes.map((c) => ({ nombre: null, telefono: null, dni: null, email: null, deleted_at: null, ...c })),
    financiaciones: [],
  };
  const siguiente = { clientes: 100, financiaciones: 500 };
  const llamadas = [];
  const transacciones = { abiertas: 0, confirmadas: 0, revertidas: 0 };

  const registrar = async (clave, args) => {
    llamadas.push({ clave, args });
    if (fallas[clave]) throw fallas[clave];
  };
  const tx = {
    clientes: {
      findFirst: async (args) => {
        await registrar("clientes.findFirst", args);
        return tablas.clientes.find((fila) => coincide(fila, args.where)) ?? null;
      },
      findMany: async (args) => {
        await registrar("clientes.findMany", args);
        return tablas.clientes.filter((fila) => coincide(fila, args.where));
      },
      create: async (args) => {
        await registrar("clientes.create", args);
        const fila = { nombre: null, telefono: null, dni: null, email: null, deleted_at: null, id: siguiente.clientes++, ...args.data };
        tablas.clientes.push(fila);
        return { ...fila };
      },
      update: async (args) => {
        await registrar("clientes.update", args);
        const fila = tablas.clientes.find((c) => c.id === args.where.id);
        Object.assign(fila, args.data);
        return { ...fila };
      },
    },
    financiaciones: {
      create: async (args) => {
        await registrar("financiaciones.create", args);
        const fila = { id: siguiente.financiaciones++, activo: true, created_at: ALTA, deleted_at: null, ...args.data };
        tablas.financiaciones.push(fila);
        return { ...fila, clientes: tablas.clientes.find((c) => c.id === fila.cliente_id), pagos: [] };
      },
    },
  };

  return {
    transacciones,
    // Como la real: si el callback termina bien confirma; si lanza, revierte y propaga el error.
    $transaction: async (tarea) => {
      transacciones.abiertas += 1;
      const antes = Object.fromEntries(Object.entries(tablas).map(([nombre, filas]) => [nombre, filas.map((fila) => ({ ...fila }))]));
      try {
        const resultado = await tarea(tx);
        transacciones.confirmadas += 1;
        return resultado;
      } catch (e) {
        tablas = antes;
        transacciones.revertidas += 1;
        throw e;
      }
    },
    filas: (nombre) => tablas[nombre].map((fila) => ({ ...fila })),
    pedidos: (clave) => llamadas.filter((l) => l.clave === clave).map((l) => l.args),
    escrituras: () => llamadas.map((l) => l.clave).filter((clave) => /\.(create|update)$/.test(clave)),
  };
}

const cuerpo = (extra = {}) => ({
  nombre: "Joel Pérez",
  telefono: "+54 9 388 470-8347",
  dni: "30.125.678",
  email: "joel@x.com",
  cantidadCuotas: 12,
  precioCuota: 1000,
  diaPago: 10,
  telefonoAlt: "388-555-0102",
  ...extra,
});

test("con un teléfono nuevo crea la ficha web con el teléfono de 10 dígitos y el DNI solo con dígitos", async () => {
  const db = baseFalsa();

  const f = await crearFinanciacion(cuerpo(), db);

  assert.equal(db.filas("clientes").length, 1);
  const [ficha] = db.filas("clientes");
  assert.deepEqual(
    { canal: ficha.canal, nombre: ficha.nombre, telefono: ficha.telefono, dni: ficha.dni, email: ficha.email },
    { canal: "web", nombre: "Joel Pérez", telefono: TEL, dni: "30125678", email: "joel@x.com" }
  );
  assert.ok(!("canal_id" in db.pedidos("clientes.create")[0].data), "canal_id ya no se escribe");
  assert.equal(f.clienteVinculado, false);
  assert.equal(f.clienteId, ficha.id);
});

test("con el teléfono de un cliente que ya existe usa esa ficha y no crea otra", async () => {
  const db = baseFalsa({ clientes: [{ id: 7, canal: "whatsapp", nombre: "Joel", telefono: TEL }] });

  const f = await crearFinanciacion(cuerpo(), db);

  assert.equal(f.clienteVinculado, true);
  assert.equal(f.clienteId, 7);
  assert.equal(db.filas("clientes").length, 1);
  assert.equal(db.filas("financiaciones")[0].cliente_id, 7);
  const [ficha] = db.filas("clientes");
  assert.deepEqual(
    [ficha.nombre, ficha.telefono, ficha.dni, ficha.email],
    ["Joel Pérez", TEL, "30125678", "joel@x.com"],
    "se le completan los huecos, y como no tiene DNI el nombre que tipeó el admin reemplaza al del perfil de WhatsApp"
  );
});

test("una ficha que ya tiene DNI conserva su nombre: solo se le completan los huecos", async () => {
  const db = baseFalsa({ clientes: [{ id: 7, canal: "whatsapp", nombre: "Joel ✨", telefono: TEL, dni: "30125678" }] });

  await crearFinanciacion(cuerpo(), db);

  const [ficha] = db.filas("clientes");
  assert.deepEqual([ficha.nombre, ficha.email], ["Joel ✨", "joel@x.com"]);
});

// La persona ya tiene ficha (se la encuentra por el DNI) con otro teléfono.
const fichaConOtroTelefono = (extra = {}) => ({ id: 7, canal: "presencial", nombre: "Joel", dni: "30125678", telefono: "3511234567", ...extra });

test("con el DNI de un cliente que ya existe usa esa ficha aunque el teléfono sea otro", async () => {
  const db = baseFalsa({ clientes: [fichaConOtroTelefono()] });

  const f = await crearFinanciacion(cuerpo({ telefonoAlt: "" }), db);

  assert.deepEqual([f.clienteVinculado, f.clienteId], [true, 7]);
  assert.equal(db.filas("clientes").length, 1);
  assert.equal(db.filas("clientes")[0].telefono, "3511234567", "no se le pisa el teléfono que ya tenía");
  // Los recordatorios de cuota salen a `telefono_alt || telefono`: sin esto irían al número viejo de la ficha.
  assert.equal(db.filas("financiaciones")[0].telefono_alt, TEL, "el teléfono que tipeó el admin queda en el plan");
  assert.deepEqual([f.telefono, f.telefonoAlt], ["3511234567", TEL]);
});

test("si el admin cargó un teléfono alternativo, ese manda: el tipeado no lo pisa", async () => {
  const db = baseFalsa({ clientes: [fichaConOtroTelefono()] });

  await crearFinanciacion(cuerpo({ telefonoAlt: "388-555-0102" }), db);

  assert.equal(db.filas("financiaciones")[0].telefono_alt, "3885550102");
  assert.equal(db.filas("clientes")[0].telefono, "3511234567");
});

test("si el teléfono tipeado es el de la ficha, aunque esté guardado o escrito distinto, no agrega teléfono alternativo", async () => {
  for (const guardado of [TEL, "5493884708347", "+54 9 388 470-8347"]) {
    const db = baseFalsa({ clientes: [fichaConOtroTelefono({ telefono: guardado })] });

    await crearFinanciacion(cuerpo({ telefonoAlt: "" }), db);

    assert.equal(db.filas("financiaciones")[0].telefono_alt, null, `ficha con ${guardado}`);
  }
});

test("el teléfono tipeado queda como alternativo con los 10 dígitos nacionales, venga como venga escrito", async () => {
  for (const tipeado of ["+54 9 388 470-8347", "0388 15 470-8347", "388 470 8347"]) {
    const db = baseFalsa({ clientes: [fichaConOtroTelefono()] });

    await crearFinanciacion(cuerpo({ telefono: tipeado, telefonoAlt: "" }), db);

    assert.equal(db.filas("financiaciones")[0].telefono_alt, TEL, tipeado);
  }
});

test("si la ficha no tenía teléfono se le completa el tipeado y no hace falta un alternativo", async () => {
  const db = baseFalsa({ clientes: [fichaConOtroTelefono({ telefono: null })] });

  await crearFinanciacion(cuerpo({ telefonoAlt: "" }), db);

  assert.equal(db.filas("clientes")[0].telefono, TEL);
  assert.equal(db.filas("financiaciones")[0].telefono_alt, null);
});

test("una persona nueva que no cargó teléfono alternativo no lo lleva", async () => {
  const db = baseFalsa();

  await crearFinanciacion(cuerpo({ telefonoAlt: "" }), db);

  assert.equal(db.filas("financiaciones")[0].telefono_alt, null);
});

test("un teléfono tipeado que no se puede normalizar queda como alternativo con sus dígitos", async () => {
  const db = baseFalsa({ clientes: [fichaConOtroTelefono()] });

  await crearFinanciacion(cuerpo({ telefono: "+1 415 555 0123", telefonoAlt: "" }), db);

  assert.equal(db.filas("financiaciones")[0].telefono_alt, "14155550123");
});

test("un teléfono tipeado más largo que la columna no se guarda como alternativo ni rompe el alta", async () => {
  const db = baseFalsa({ clientes: [fichaConOtroTelefono()] });

  const f = await crearFinanciacion(cuerpo({ telefono: "7".repeat(31), telefonoAlt: "" }), db);

  assert.equal(f.clienteId, 7);
  assert.equal(db.filas("financiaciones")[0].telefono_alt, null);
});

test("un teléfono que ya es de alguien con otro DNI no se vincula: es otra persona y lleva su propia ficha", async () => {
  const db = baseFalsa({ clientes: [{ id: 7, canal: "whatsapp", nombre: "Ana", telefono: TEL, dni: "20111222" }] });

  const f = await crearFinanciacion(cuerpo(), db);

  assert.equal(f.clienteVinculado, false);
  assert.notEqual(f.clienteId, 7);
  assert.deepEqual(db.filas("clientes").map((c) => [c.id, c.dni]), [[7, "20111222"], [f.clienteId, "30125678"]]);
});

test("un teléfono no se vincula por parecido: ni uno corto que otro tiene adentro ni uno con los mismos últimos 8 dígitos", async () => {
  // Antes se buscaba por los últimos 8 dígitos: "123" caía en cualquiera que terminara así.
  const casos = [
    ["123", "3511234123"],
    [TEL, "1184708347"],
  ];
  for (const [telefono, delOtro] of casos) {
    const db = baseFalsa({ clientes: [{ id: 7, canal: "web", nombre: "Otra Persona", telefono: delOtro }] });

    const f = await crearFinanciacion(cuerpo({ telefono }), db);

    assert.equal(f.clienteVinculado, false, telefono);
    assert.notEqual(f.clienteId, 7, telefono);
    assert.equal(db.filas("clientes").find((c) => c.id === 7).dni, null, `${telefono}: la otra ficha no se toca`);
  }
});

test("no reutiliza una ficha archivada: la persona queda con una ficha vigente", async () => {
  const db = baseFalsa({ clientes: [{ id: 3, canal: "web", telefono: TEL, dni: "30125678", deleted_at: ARCHIVADA }] });

  const f = await crearFinanciacion(cuerpo(), db);

  assert.equal(f.clienteVinculado, false);
  assert.notEqual(f.clienteId, 3);
  assert.deepEqual(db.filas("clientes").find((c) => c.id === 3).deleted_at, ARCHIVADA);
});

test("la ficha y la financiación se escriben en una sola transacción, con el plan pedido", async () => {
  const db = baseFalsa();

  const f = await crearFinanciacion(cuerpo(), db);

  assert.deepEqual(db.transacciones, { abiertas: 1, confirmadas: 1, revertidas: 0 });
  assert.deepEqual(db.escrituras(), ["clientes.create", "financiaciones.create"]);
  const [{ data, include }] = db.pedidos("financiaciones.create");
  assert.deepEqual(data, { cliente_id: f.clienteId, cantidad_cuotas: 12, precio_cuota: 1000, dia_pago: 10, telefono_alt: "3885550102" });
  assert.ok(include.clientes && include.pagos, "pide el cliente y los pagos para armar la respuesta");
  assert.deepEqual([f.cantidadCuotas, f.precioCuota, f.diaPago, f.telefono, f.dni], [12, 1000, 10, TEL, "30125678"]);
});

test("si falla la financiación, la ficha nueva se revierte con ella", async () => {
  const falla = new Error("Deadlock found when trying to get lock");
  const db = baseFalsa({ fallas: { "financiaciones.create": falla } });

  await assert.rejects(crearFinanciacion(cuerpo(), db), (e) => e === falla);

  assert.deepEqual(db.filas("clientes"), []);
  assert.deepEqual(db.transacciones, { abiertas: 1, confirmadas: 0, revertidas: 1 });
});

test("un DNI imposible se rechaza con 400 antes de abrir la transacción y no queda nada escrito", async () => {
  const db = baseFalsa();

  await assert.rejects(crearFinanciacion(cuerpo({ dni: "1".repeat(21) }), db), (e) => e.status === 400 && /entre 7 y 9/.test(e.message));

  assert.equal(db.transacciones.abiertas, 0);
  assert.deepEqual(db.filas("clientes"), []);
  assert.deepEqual(db.filas("financiaciones"), []);
});

test("un DNI de relleno no junta a dos personas distintas en la misma ficha", async () => {
  // Antes "0" pasaba: la segunda persona con DNI "0" terminaba en la ficha de la primera.
  const db = baseFalsa({ clientes: [{ id: 7, canal: "presencial", nombre: "Ana", dni: "0", telefono: "3511234567" }] });

  await assert.rejects(crearFinanciacion(cuerpo({ dni: "0" }), db), (e) => e.status === 400);

  assert.deepEqual(db.escrituras(), []);
  assert.equal(db.filas("clientes").length, 1);
});

test("el DNI y el nombre se validan con mensajes claros", async () => {
  const mensajeDe = async (extra) => {
    const e = await crearFinanciacion(cuerpo(extra), baseFalsa()).catch((falla) => falla);
    return [e.status, e.message];
  };

  assert.deepEqual(await mensajeDe({ dni: "" }), [400, "El DNI es obligatorio."]);
  assert.deepEqual(await mensajeDe({ dni: "AB123456" }), [400, "El DNI lleva solo números."]);
  assert.deepEqual(await mensajeDe({ dni: "1" }), [400, "El DNI debe tener entre 7 y 9 dígitos."]);
  assert.deepEqual(await mensajeDe({ dni: "11111111" }), [400, "El DNI no es válido."]);
  assert.deepEqual(await mensajeDe({ nombre: { apellido: "Pérez" } }), [400, "El nombre debe ser un texto"]);
  assert.deepEqual(await mensajeDe({ nombre: "  " }), [400, "El nombre es obligatorio"]);
  assert.deepEqual(await mensajeDe({ nombre: null }), [400, "El nombre es obligatorio"]);
});

test("el DNI se acepta como número o con puntos y se guarda solo con dígitos", async () => {
  for (const dni of [30125678, "30.125.678", " 30 125 678 ", "30-125-678"]) {
    const db = baseFalsa();

    await crearFinanciacion(cuerpo({ dni }), db);

    assert.equal(db.filas("clientes")[0].dni, "30125678", String(dni));
  }
});

for (const [caso, extra] of [
  ["un nombre vacío", { nombre: "   " }],
  ["un nombre que es un objeto", { nombre: { apellido: "Pérez" } }],
  ["un nombre que es un número", { nombre: 123 }],
  ["un nombre que es una lista", { nombre: ["Joel"] }],
  ["un teléfono sin dígitos", { telefono: "abc" }],
  ["un DNI vacío", { dni: "" }],
  ["un DNI sin dígitos", { dni: "sin dni" }],
  ["un DNI en 0", { dni: "0" }],
  ["un DNI de un solo dígito", { dni: "1" }],
  ["un DNI de 6 dígitos", { dni: "123456" }],
  ["un DNI de 10 dígitos", { dni: "1234567890" }],
  ["un DNI con letras", { dni: "AB123456" }],
  ["un DNI con todos los dígitos iguales", { dni: "11111111" }],
  ["un DNI que es un objeto", { dni: { not: "x" } }],
  ["un email vacío", { email: "" }],
  ["un email inválido", { email: "no-es-un-mail" }],
  ["un email que es una lista", { email: ["joel@x.com"] }],
  ["un email que es un objeto", { email: { valor: "joel@x.com" } }],
  ["una cantidad de cuotas en 0", { cantidadCuotas: 0 }],
  ["un precio de cuota negativo", { precioCuota: -1 }],
  ["un día de pago fuera de rango", { diaPago: 32 }],
]) {
  test(`con ${caso} responde 400 y no abre la transacción`, async () => {
    const db = baseFalsa();

    await assert.rejects(crearFinanciacion(cuerpo(extra), db), (e) => e.status === 400);

    assert.equal(db.transacciones.abiertas, 0);
  });
}
