import { test } from "node:test";
import assert from "node:assert/strict";
import { registrarConsentimiento, verificarSituacion, estadoCredito, CLAVE_CONFIG } from "./verificacion.js";

const AHORA = new Date("2026-11-01T15:00:00Z");
const DIA_MS = 24 * 3_600_000;
const CUIL = "20123456786"; // DNI 12345678
const OTRO_CUIL = "27301256782";
const FINANCIA = { id: 7, pago_tipo: "financiado", credito_ok: 1 };

// Base en memoria con lo que usa la verificación. findFirst devuelve el último que cumple.
function baseFalsa({ activa = true, terminos = [{ id: 3 }], sesion = FINANCIA, cliente = { id: 1, dni: null, cuil: null }, otrosClientes = [], consentimientos = [], consultas = [] } = {}) {
  const estado = { consentimientos, consultas, cliente, actualizacionesDeSesion: 0 };
  const ultimo = (filas, cumple) => filas.filter(cumple).at(-1) ?? null;
  const db = {
    configuracion: { findUnique: async ({ where }) => (activa && where.clave === CLAVE_CONFIG ? { clave: CLAVE_CONFIG, valor: "1" } : null) },
    terminos_versiones: { findFirst: async () => terminos.at(-1) ?? null },
    consentimientos: {
      findFirst: async ({ where }) => ultimo(estado.consentimientos, (c) => c.cliente_id === where.cliente_id),
      create: async ({ data }) => {
        const fila = { id: estado.consentimientos.length + 1, ...data };
        estado.consentimientos = [...estado.consentimientos, fila];
        return fila;
      },
    },
    chat_estado: {
      findUnique: async () => sesion,
      update: async ({ where, data }) => {
        const { cuil_informado, ...calificacion } = data;
        if (cuil_informado) estado.cuilInformado = { sesionId: where.id, cuil: cuil_informado };
        if (Object.keys(calificacion).length) estado.actualizacionesDeSesion += 1;
      },
    },
    clientes: {
      findUnique: async () => estado.cliente,
      findFirst: async ({ where }) => ultimo(otrosClientes, (c) => c.cuil === where.cuil && c.id !== where.id.not),
      update: async ({ data }) => {
        estado.cliente = { ...estado.cliente, ...data };
        return estado.cliente;
      },
    },
    consultas_crediticias: {
      findFirst: async ({ where }) =>
        ultimo(estado.consultas, (c) => c.cliente_id === where.cliente_id && c.consultado_at >= where.consultado_at.gte && (!where.estado || c.estado === where.estado)),
      create: async ({ data }) => {
        estado.consultas = [...estado.consultas, { id: estado.consultas.length + 1, ...data }];
      },
    },
  };
  return { db, estado };
}

function bcraFalso(respuesta = { estado: "ok", deudas: null, cheques: null }) {
  const bcra = { llamadas: 0, consultar: async () => ((bcra.llamadas += 1), respuesta) };
  return bcra;
}

const aceptado = { id: 1, cliente_id: 1, terminos_version_id: 3, acepta: true };
const ctx = (db, bcra) => ({ db, clienteId: 1, sesionId: 7, ahora: AHORA, bcra });

test("con la verificación apagada no se consulta", async () => {
  for (const apagada of [{ activa: false }, { terminos: [] }]) {
    const { db } = baseFalsa({ ...apagada, consentimientos: [aceptado] });
    const bcra = bcraFalso();
    assert.equal((await verificarSituacion(ctx(db, bcra), CUIL)).consultado, false);
    assert.equal((await registrarConsentimiento(ctx(db), true)).registrado, false);
    assert.equal(await estadoCredito({ db, clienteId: 1, sesion: FINANCIA, ahora: AHORA }), null);
    assert.equal(bcra.llamadas, 0);
  }
});

test("el consentimiento se guarda con la versión vigente de los términos", async () => {
  const { db, estado } = baseFalsa({ terminos: [{ id: 2 }, { id: 3 }] });
  assert.deepEqual(await registrarConsentimiento({ ...ctx(db), wamid: "wamid.DEL_SI" }, true), { registrado: true });
  // El wamid es la prueba: el mensaje de WhatsApp en que el cliente dijo que sí.
  assert.deepEqual(estado.consentimientos, [
    { id: 1, cliente_id: 1, terminos_version_id: 3, finalidad: "consulta_crediticia", acepta: true, wamid: "wamid.DEL_SI", created_at: AHORA },
  ]);
});

test("sin un sí vigente no se consulta al BCRA", async () => {
  for (const consentimientos of [[], [{ ...aceptado, acepta: false }]]) {
    const { db } = baseFalsa({ consentimientos });
    const bcra = bcraFalso();
    assert.equal((await verificarSituacion(ctx(db, bcra), CUIL)).consultado, false);
    assert.equal(bcra.llamadas, 0);
  }
});

test("un no posterior revoca el sí", async () => {
  const { db } = baseFalsa();
  await registrarConsentimiento(ctx(db), true);
  await registrarConsentimiento(ctx(db), false);
  const bcra = bcraFalso();
  assert.equal((await verificarSituacion(ctx(db, bcra), CUIL)).consultado, false);
  assert.equal(bcra.llamadas, 0);
});

test("solo se consulta si financia y ya dijo lo del recibo o garante", async () => {
  const casos = [
    [{ pago_tipo: "contado", credito_ok: null }, 0],
    [{ pago_tipo: "financiado", credito_ok: null }, 0],
    [{ pago_tipo: null, credito_ok: null }, 0],
    // Sin recibo sigue financiando: el semáforo le sirve igual al asesor.
    [{ pago_tipo: "financiado", credito_ok: 0 }, 1],
    [{ pago_tipo: "financiado", credito_ok: 1 }, 1],
  ];
  for (const [sesion, llamadas] of casos) {
    const { db } = baseFalsa({ sesion: { id: 7, ...sesion }, consentimientos: [aceptado] });
    const bcra = bcraFalso();
    await verificarSituacion(ctx(db, bcra), CUIL);
    assert.equal(bcra.llamadas, llamadas, JSON.stringify(sesion));
  }
});

test("un CUIL que no es el de la ficha no se consulta", async () => {
  const casos = [
    { cliente: { id: 1, dni: "87654321", cuil: null } },
    { cliente: { id: 1, dni: null, cuil: OTRO_CUIL } },
    { otrosClientes: [{ id: 2, cuil: CUIL }] },
  ];
  for (const caso of casos) {
    const { db, estado } = baseFalsa({ ...caso, consentimientos: [aceptado] });
    const bcra = bcraFalso();
    const r = await verificarSituacion(ctx(db, bcra), CUIL);
    assert.equal(r.consultado, false);
    assert.match(r.motivo, /vendedor/);
    assert.equal(bcra.llamadas, 0);
    assert.notEqual(estado.cliente.cuil, CUIL, "no se guarda en la ficha");
  }

  const invalido = baseFalsa({ consentimientos: [aceptado] });
  const r = await verificarSituacion(ctx(invalido.db, bcraFalso()), "20123456787");
  assert.equal(r.consultado, false);
  assert.match(r.motivo, /de nuevo/);

  // El de la ficha: se guarda solo con números.
  const propio = baseFalsa({ cliente: { id: 1, dni: "12.345.678", cuil: null }, consentimientos: [aceptado] });
  assert.equal((await verificarSituacion(ctx(propio.db, bcraFalso()), "20-12345678-6")).consultado, true);
  assert.equal(propio.estado.cliente.cuil, CUIL);
});

test("una consulta de los últimos 30 días se reutiliza", async () => {
  const reciente = { cliente_id: 1, estado: "ok", semaforo: "verde", consultado_at: new Date(AHORA - 10 * DIA_MS) };
  const { db } = baseFalsa({ consentimientos: [aceptado], consultas: [reciente] });
  const bcra = bcraFalso();
  assert.deepEqual(await verificarSituacion(ctx(db, bcra), CUIL), { consultado: true });
  assert.equal(bcra.llamadas, 0);

  const vieja = baseFalsa({ consentimientos: [aceptado], consultas: [{ ...reciente, consultado_at: new Date(AHORA - 31 * DIA_MS) }] });
  const otra = bcraFalso();
  await verificarSituacion(ctx(vieja.db, otra), CUIL);
  assert.equal(otra.llamadas, 1);
});

test("se guarda solo el resumen de la consulta", async () => {
  const deudas = { denominacion: "  PEREZ JUAN CARLOS ", periodos: [{ periodo: "202609", entidades: [{ situacion: 3 }, { situacion: 1 }] }] };
  const { db, estado } = baseFalsa({ consentimientos: [aceptado] });
  const r = await verificarSituacion(ctx(db, bcraFalso({ estado: "ok", deudas, cheques: null })), CUIL);
  assert.deepEqual(r, { consultado: true });
  assert.deepEqual(estado.consultas, [
    // El nombre que da el BCRA, para que el asesor verifique en persona que es quien escribió (decisión del 01/11).
    { id: 1, cliente_id: 1, sesion_id: 7, consentimiento_id: 1, estado: "ok", semaforo: "rojo", peor_situacion: 3, periodo: "202609", nombre_bcra: "PEREZ JUAN CARLOS", consultado_at: AHORA },
  ]);
  assert.equal(estado.actualizacionesDeSesion, 0, "el semáforo no toca la calificación");
});

test("si el BCRA falla queda registrado como error y la charla sigue", async () => {
  const { db, estado } = baseFalsa({ consentimientos: [aceptado] });
  const r = await verificarSituacion(ctx(db, bcraFalso({ estado: "error", motivo: "http_500" })), CUIL);
  assert.equal(r.consultado, false);
  assert.match(r.motivo, /seguí/);
  assert.equal(estado.consultas[0].estado, "error");
  assert.equal(estado.consultas[0].semaforo, null);
});

test("estadoCredito: pide el permiso, después el CUIL, y nada más si dijo que no o ya se consultó", async () => {
  const estadoCon = (opciones, sesion = FINANCIA) => {
    const { db } = baseFalsa(opciones);
    return estadoCredito({ db, clienteId: 1, sesion, ahora: AHORA });
  };
  assert.equal(await estadoCon({}), "pedir_consentimiento");
  assert.equal(await estadoCon({ consentimientos: [aceptado] }), "pedir_cuil");
  assert.equal(await estadoCon({ consentimientos: [{ ...aceptado, acepta: false }] }), null);
  assert.equal(await estadoCon({ consentimientos: [aceptado], consultas: [{ cliente_id: 1, estado: "error", consultado_at: AHORA }] }), null);
  // Un error de hace más de una hora no bloquea: se puede volver a pedir el CUIL.
  const errorViejo = { cliente_id: 1, estado: "error", consultado_at: new Date(AHORA - 2 * 3_600_000) };
  assert.equal(await estadoCon({ consentimientos: [aceptado], consultas: [errorViejo] }), "pedir_cuil");
  assert.equal(await estadoCon({}, { id: 7, pago_tipo: "contado", credito_ok: null }), null);
  assert.equal(await estadoCon({}, { id: 7, pago_tipo: "financiado", credito_ok: null }), null);
});

test("un error de la última hora no se reintenta; uno más viejo sí", async () => {
  const errorDe = (horas) => ({ cliente_id: 1, estado: "error", consultado_at: new Date(AHORA - horas * 3_600_000) });

  const reciente = baseFalsa({ consentimientos: [aceptado], consultas: [errorDe(0.5)] });
  const bcra = bcraFalso();
  const r = await verificarSituacion(ctx(reciente.db, bcra), CUIL);
  assert.equal(r.consultado, false);
  assert.match(r.motivo, /seguí/);
  assert.equal(bcra.llamadas, 0);

  const viejo = baseFalsa({ consentimientos: [aceptado], consultas: [errorDe(2)] });
  const otro = bcraFalso();
  assert.equal((await verificarSituacion(ctx(viejo.db, otro), CUIL)).consultado, true);
  assert.equal(otro.llamadas, 1);
});

test("el CUIL que informa la persona queda en la consulta, aunque no coincida con la ficha", async () => {
  const { db, estado } = baseFalsa({ cliente: { id: 1, dni: null, cuil: OTRO_CUIL }, consentimientos: [aceptado] });
  const bcra = bcraFalso();

  const r = await verificarSituacion(ctx(db, bcra), CUIL);

  assert.equal(r.consultado, false);
  assert.deepEqual(estado.cuilInformado, { sesionId: 7, cuil: CUIL });
  assert.equal(estado.cliente.cuil, OTRO_CUIL, "la ficha conserva el suyo");
  assert.equal(bcra.llamadas, 0);
});

test("un CUIL inválido o sin permiso no queda en la consulta", async () => {
  const casos = [
    { consentimientos: [aceptado], cuil: "123" },
    { consentimientos: [], cuil: CUIL },
    { consentimientos: [{ ...aceptado, acepta: false }], cuil: CUIL },
  ];
  for (const { consentimientos, cuil } of casos) {
    const { db, estado } = baseFalsa({ consentimientos });
    await verificarSituacion(ctx(db, bcraFalso()), cuil);
    assert.equal(estado.cuilInformado, undefined);
  }
});
