import { test } from "node:test";
import assert from "node:assert/strict";
import { registrarPersona, buscarPersonas } from "./personas.service.js";

// El titular de un trámite presencial pasa por la puerta única de alta de clientes
// (`resolverCliente`): si la persona ya escribió por WhatsApp o tiene una
// financiación web, se reutiliza su ficha en vez de duplicarla.

const TEL = "3884708347";
const ARCHIVADA = new Date("2026-10-10T12:00:00Z");

const enMinusculas = (valor) => String(valor ?? "").toLowerCase();

function coincide(fila, where = {}) {
  return Object.entries(where).every(([campo, esperado]) => {
    if (esperado === undefined) throw new Error(`Prisma ignora undefined: "${campo}" no filtraría nada`);
    if (campo === "OR") return esperado.some((condicion) => coincide(fila, condicion));
    if (esperado !== null && typeof esperado === "object") {
      if ("not" in esperado) return fila[campo] !== esperado.not;
      // MySQL compara sin distinguir mayúsculas.
      if ("contains" in esperado) return enMinusculas(fila[campo]).includes(enMinusculas(esperado.contains));
      throw new Error(`Filtro no soportado por la base falsa: ${JSON.stringify(esperado)}`);
    }
    return (fila[campo] ?? null) === esperado;
  });
}

// Base falsa en memoria. `tx` no tiene `$transaction`, como el de Prisma dentro de
// una transacción. Ningún modelo tiene delete ni deleteMany.
function baseFalsa({ clientes = [] } = {}) {
  const tablas = {
    clientes: clientes.map((c) => ({ nombre: null, telefono: null, dni: null, email: null, deleted_at: null, ...c })),
    cliente_perfiles: [],
  };
  let siguienteId = 100;
  const llamadas = [];

  const tx = {
    clientes: {
      findFirst: async (args) => {
        llamadas.push({ clave: "clientes.findFirst", args });
        return tablas.clientes.find((fila) => coincide(fila, args.where)) ?? null;
      },
      findMany: async (args) => {
        llamadas.push({ clave: "clientes.findMany", args });
        const filas = tablas.clientes.filter((fila) => coincide(fila, args.where));
        const sentido = args.orderBy?.id === "desc" ? -1 : 1;
        return filas
          .sort((a, b) => (a.id - b.id) * sentido)
          .slice(0, args.take ?? filas.length)
          .map((fila) => ({ ...fila }));
      },
      create: async (args) => {
        llamadas.push({ clave: "clientes.create", args });
        const fila = { nombre: null, telefono: null, dni: null, email: null, deleted_at: null, id: siguienteId++, ...args.data };
        tablas.clientes.push(fila);
        return { ...fila };
      },
      update: async (args) => {
        llamadas.push({ clave: "clientes.update", args });
        const fila = tablas.clientes.find((c) => c.id === args.where.id);
        Object.assign(fila, args.data);
        return { ...fila };
      },
    },
    cliente_perfiles: {
      upsert: async (args) => {
        llamadas.push({ clave: "cliente_perfiles.upsert", args });
        const actual = tablas.cliente_perfiles.find((p) => p.cliente_id === args.where.cliente_id);
        if (actual) Object.assign(actual, args.update);
        else tablas.cliente_perfiles.push({ ...args.create });
      },
    },
  };

  return {
    tx,
    filas: (nombre) => tablas[nombre].map((fila) => ({ ...fila })),
    pedidos: (clave) => llamadas.filter((l) => l.clave === clave).map((l) => l.args),
    escrituras: () => llamadas.map((l) => l.clave).filter((clave) => /\.(create|update|upsert)$/.test(clave)),
  };
}

const titular = (extra = {}) => ({ dni: "30125678", nombre: "Joel Pérez", ...extra });

// ── registrarPersona: a quién se reconoce ──

test("con el DNI de alguien que ya existe usa su ficha y solo le completa lo que falta", async () => {
  const base = baseFalsa({ clientes: [{ id: 4, canal: "whatsapp", nombre: "Joel", dni: "30125678" }] });

  const id = await registrarPersona(titular({ dni: "30.125.678", nombre: "Otro Nombre", telefono: "388 470-8347", email: "joel@x.com" }), base.tx);

  assert.equal(id, 4);
  assert.equal(base.filas("clientes").length, 1);
  const [ficha] = base.filas("clientes");
  assert.deepEqual([ficha.nombre, ficha.telefono, ficha.email], ["Joel", TEL, "joel@x.com"], "el nombre que ya tenía no se pisa");
});

test("con el teléfono de una ficha de WhatsApp sin DNI le completa el DNI y no crea otra", async () => {
  const base = baseFalsa({ clientes: [{ id: 5, canal: "whatsapp", nombre: "Joel ✨", telefono: TEL }] });

  const id = await registrarPersona(titular({ dni: "47544582", telefono: "+54 9 388 470-8347" }), base.tx);

  assert.equal(id, 5);
  assert.equal(base.filas("clientes").length, 1);
  const [ficha] = base.filas("clientes");
  assert.deepEqual(
    [ficha.dni, ficha.nombre, ficha.telefono],
    ["47544582", "Joel Pérez", TEL],
    "como la ficha no tenía DNI, el nombre que tipeó el personal reemplaza al del perfil de WhatsApp"
  );
});

test("con un teléfono que ya es de alguien con otro DNI crea una ficha nueva y deja la otra como estaba", async () => {
  const base = baseFalsa({ clientes: [{ id: 6, canal: "web", nombre: "Ana", telefono: TEL, dni: "30125678" }] });
  const antes = base.filas("clientes");

  const id = await registrarPersona(titular({ dni: "47544582", nombre: "Joel", telefono: TEL }), base.tx);

  assert.notEqual(id, 6);
  const [original, nueva] = base.filas("clientes");
  assert.deepEqual(original, antes[0]);
  assert.deepEqual([nueva.id, nueva.canal, nueva.dni, nueva.telefono, nueva.nombre], [id, "presencial", "47544582", TEL, "Joel"]);
});

test("una persona nueva queda como presencial, con el teléfono normalizado y sin canal_id", async () => {
  const base = baseFalsa();

  const id = await registrarPersona(titular({ telefono: "0388 15 470-8347", email: " joel@x.com " }), base.tx);

  const [ficha] = base.filas("clientes");
  assert.equal(ficha.id, id);
  assert.deepEqual(
    [ficha.canal, ficha.dni, ficha.telefono, ficha.nombre, ficha.email],
    ["presencial", "30125678", TEL, "Joel Pérez", "joel@x.com"]
  );
  assert.ok(!("canal_id" in base.pedidos("clientes.create")[0].data), "canal_id ya no se escribe");
});

test("no reutiliza una ficha archivada: el DNI y el teléfono se buscan solo entre vigentes", async () => {
  const base = baseFalsa({ clientes: [{ id: 3, canal: "web", dni: "30125678", telefono: TEL, deleted_at: ARCHIVADA }] });

  const id = await registrarPersona(titular({ telefono: TEL }), base.tx);

  assert.notEqual(id, 3);
  assert.deepEqual(base.filas("clientes").find((c) => c.id === 3).deleted_at, ARCHIVADA);
});

test("el mismo titular en dos trámites usa la misma ficha", async () => {
  const base = baseFalsa();

  const primero = await registrarPersona(titular({ telefono: TEL }), base.tx);
  const segundo = await registrarPersona(titular({ telefono: "+54 9 388 470-8347" }), base.tx);

  assert.equal(segundo, primero);
  assert.equal(base.filas("clientes").length, 1);
});

// ── registrarPersona: validación y perfil ──

for (const [caso, extra] of [
  ["un DNI corto", { dni: "123456" }],
  ["un DNI largo", { dni: "1234567890" }],
  ["un DNI vacío", { dni: "" }],
  ["un DNI ausente", { dni: undefined }],
  ["un DNI en 0", { dni: "0" }],
  ["un DNI con letras", { dni: "AB123456" }],
  ["un DNI con todos los dígitos iguales", { dni: "11111111" }],
  ["un DNI que es un objeto", { dni: { not: "x" } }],
  ["un nombre vacío", { nombre: "   " }],
  ["un CUIT que no tiene 11 dígitos", { cuit: "123" }],
  ["un CBU que no tiene 22 dígitos", { cbu: "123" }],
  ["un email inválido", { email: "no-es-un-mail" }],
  ["un teléfono alternativo sin vínculo", { contactoAltTelefono: "3884001122" }],
  ["un vínculo que no existe", { contactoAltTelefono: "3884001122", contactoAltVinculo: "vecino" }],
]) {
  test(`con ${caso} responde 400 y no escribe nada`, async () => {
    const base = baseFalsa();

    await assert.rejects(registrarPersona(titular(extra), base.tx), (e) => e.status === 400);

    assert.deepEqual(base.escrituras(), []);
  });
}

test("el DNI se valida con los mismos mensajes que en el resto del panel", async () => {
  const mensajeDe = async (dni) => {
    const e = await registrarPersona(titular({ dni }), baseFalsa().tx).catch((falla) => falla);
    return [e.status, e.message];
  };

  assert.deepEqual(await mensajeDe(""), [400, "El DNI es obligatorio."]);
  assert.deepEqual(await mensajeDe("AB123456"), [400, "El DNI lleva solo números."]);
  assert.deepEqual(await mensajeDe("123456"), [400, "El DNI debe tener entre 7 y 9 dígitos."]);
  assert.deepEqual(await mensajeDe("11111111"), [400, "El DNI no es válido."]);
});

test("el DNI se acepta de 7 a 9 dígitos, con puntos o como número, y se guarda solo con dígitos", async () => {
  for (const [escrito, guardado] of [["1234567", "1234567"], ["30.125.678", "30125678"], [" 30 125 678 ", "30125678"], [30125678, "30125678"], ["123456789", "123456789"]]) {
    const base = baseFalsa();

    await registrarPersona(titular({ dni: escrito }), base.tx);

    assert.equal(base.filas("clientes")[0].dni, guardado, String(escrito));
  }
});

test("un DNI de relleno no junta a dos titulares distintos en la misma ficha", async () => {
  const base = baseFalsa({ clientes: [{ id: 7, canal: "presencial", nombre: "Ana", dni: "0", telefono: "3511234567" }] });

  await assert.rejects(registrarPersona(titular({ dni: "0", nombre: "Joel" }), base.tx), (e) => e.status === 400);

  assert.deepEqual(base.escrituras(), []);
});

test("el perfil se escribe sobre la ficha reutilizada y solo con los campos que llegan", async () => {
  const base = baseFalsa({ clientes: [{ id: 4, canal: "whatsapp", nombre: "Joel", dni: "30125678" }] });

  await registrarPersona(titular({ apellido: "Pérez", cuit: "20-30125678-9" }), base.tx);

  const [upsert] = base.pedidos("cliente_perfiles.upsert");
  assert.deepEqual(upsert.where, { cliente_id: 4 });
  assert.deepEqual(upsert.create, { cliente_id: 4, apellido: "Pérez", cuit: "20301256789" });
  assert.deepEqual(upsert.update, { apellido: "Pérez", cuit: "20301256789", deleted_at: null });
});

test("con reemplazarPerfil el perfil se escribe entero: lo que viene vacío se borra", async () => {
  const base = baseFalsa({ clientes: [{ id: 4, canal: "whatsapp", nombre: "Joel", dni: "30125678" }] });

  await registrarPersona(titular({ apellido: "Pérez" }), base.tx, { reemplazarPerfil: true });

  const [upsert] = base.pedidos("cliente_perfiles.upsert");
  assert.deepEqual(Object.keys(upsert.update).sort(), [
    "alias_cbu", "apellido", "banco_cbu", "cbu", "contacto_alt_telefono", "contacto_alt_vinculo",
    "cuit", "deleted_at", "domicilio", "localidad", "provincia",
  ]);
  assert.deepEqual([upsert.update.apellido, upsert.update.cuit, upsert.update.cbu], ["Pérez", null, null]);
});

test("sin datos de perfil y sin reemplazarPerfil no toca cliente_perfiles", async () => {
  const base = baseFalsa();

  await registrarPersona(titular(), base.tx);

  assert.deepEqual(base.pedidos("cliente_perfiles.upsert"), []);
});

// ── buscarPersonas ──

const idsEncontrados = async (base, q) => (await buscarPersonas(q, 8, base.tx)).map((p) => p.id);

test("buscarPersonas no trae las fichas archivadas, la busque por nombre, por DNI o por teléfono", async () => {
  const base = baseFalsa({
    clientes: [
      { id: 1, canal: "web", nombre: "Joel Pérez", dni: "30125678", telefono: TEL },
      { id: 2, canal: "whatsapp", nombre: "Joel", dni: "30125678", telefono: TEL, deleted_at: ARCHIVADA },
    ],
  });

  for (const q of ["joel", "30125678", "30.125.678", "388 470-8347"]) {
    assert.deepEqual(await idsEncontrados(base, q), [1], q);
  }
});

test("buscarPersonas encuentra el teléfono guardado de 10 dígitos aunque se pegue con el 54, el 9 o el 0 y el 15", async () => {
  const base = baseFalsa({
    clientes: [
      { id: 1, canal: "web", nombre: "Joel", telefono: TEL },
      { id: 2, canal: "web", nombre: "Ana", telefono: "3884000002" },
    ],
  });

  for (const q of ["+54 9 388 470-8347", "5493884708347", "0388 15 470-8347", "388 470-8347", TEL]) {
    assert.deepEqual(await idsEncontrados(base, q), [1], q);
  }
});

test("buscarPersonas con otro número no trae a quien solo comparte el prefijo", async () => {
  const base = baseFalsa({ clientes: [{ id: 1, canal: "web", nombre: "Joel", telefono: TEL }] });

  assert.deepEqual(await idsEncontrados(base, "+54 9 388 470-8348"), []);
});

test("buscarPersonas con pocos dígitos busca solo por nombre: un 500 suelto no trae a quien lo tiene en el teléfono o el DNI", async () => {
  const base = baseFalsa({ clientes: [{ id: 1, canal: "web", nombre: "Joel", telefono: "3885001234", dni: "30500123" }] });

  assert.deepEqual(await idsEncontrados(base, "Fiat 500"), []);
  assert.deepEqual(await idsEncontrados(base, "500"), []);
});

test("buscarPersonas con menos de 3 caracteres no consulta la base", async () => {
  const base = baseFalsa({ clientes: [{ id: 1, canal: "web", nombre: "Joel" }] });

  assert.deepEqual(await buscarPersonas("jo", 8, base.tx), []);
  assert.deepEqual(await buscarPersonas(undefined, 8, base.tx), []);
  assert.deepEqual(base.pedidos("clientes.findMany"), []);
});

test("buscarPersonas devuelve primero a las más nuevas y respeta el límite", async () => {
  const base = baseFalsa({
    clientes: [1, 2, 3].map((id) => ({ id, canal: "web", nombre: `Joel ${id}` })),
  });

  assert.deepEqual((await buscarPersonas("joel", 2, base.tx)).map((p) => p.id), [3, 2]);
});

test("buscarPersonas devuelve a cada persona con los datos de su perfil", async () => {
  const perfil = { apellido: "Pérez", cuit: "20301256789", contacto_alt_telefono: "3884001122", contacto_alt_vinculo: "pareja" };
  const base = baseFalsa({ clientes: [{ id: 1, canal: "web", nombre: "Joel", dni: "30125678", cliente_perfiles: perfil }] });

  const [persona] = await buscarPersonas("joel", 8, base.tx);

  assert.deepEqual(
    [persona.nombre, persona.apellido, persona.cuit, persona.contactoAlternativo],
    ["Joel", "Pérez", "20301256789", { telefono: "3884001122", vinculo: "pareja" }]
  );
});
