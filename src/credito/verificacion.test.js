import { test } from "node:test";
import assert from "node:assert/strict";
import { registrarConsentimiento, verificarSituacion, estadoCredito, permisoAnticipado } from "./verificacion.js";

const AHORA = new Date("2026-11-01T15:00:00Z");
const INICIO = new Date("2026-11-01T14:00:00Z"); // sesion_inicio de la consulta en curso
const DIA_MS = 24 * 3_600_000;
const CUIL = "20123456786"; // DNI 12345678
const OTRO_CUIL = "27301256782";
const FINANCIA = { id: 7, pago_tipo: "financiado", credito_ok: 1, sesion_inicio: INICIO };
const AVISO = "¿Me pasás tu CUIL? Así el asesor puede consultar tu situación en la Central de Deudores del BCRA.";

// Base en memoria con lo que usa la verificación. findFirst devuelve el último que cumple.
// `historial`: mensajes del cliente { direccion, mensaje, created_at } (el aviso se busca acá).
function baseFalsa({ terminos = [{ id: 3 }], sesion = FINANCIA, cliente = { id: 1, dni: null, cuil: null }, otrosClientes = [], consentimientos = [], consultas = [], historial = [] } = {}) {
  const estado = { consentimientos, consultas, cliente, actualizacionesDeSesion: 0 };
  const ultimo = (filas, cumple) => filas.filter(cumple).at(-1) ?? null;
  const db = {
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
    historial_mensajes: {
      findMany: async ({ where }) =>
        historial.filter(
          (h) =>
            (where.cliente_id === undefined || where.cliente_id === 1) &&
            (!where.direccion || h.direccion === where.direccion) &&
            (!where.created_at?.gte || h.created_at >= where.created_at.gte) &&
            (!where.created_at?.lt || h.created_at < where.created_at.lt)
        ),
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
const negado = { ...aceptado, acepta: false };
const ctx = (db, bcra, extra = {}) => ({ db, clienteId: 1, sesionId: 7, ahora: AHORA, bcra, ...extra });
// El aviso que mandó el bot en un turno anterior de esta consulta.
const avisoAntes = (mensaje = AVISO, created_at = new Date(AHORA - 60_000)) => ({ direccion: "saliente", mensaje, created_at });
// Los mensajes del cliente que se responden en este turno.
const conCuilEnElMensaje = (texto = `mi cuil es ${CUIL.slice(0, 2)}-${CUIL.slice(2, 10)}-${CUIL.slice(10)}`, wamid = "wamid.DEL_CUIL") => ({ entrantes: [{ texto, wamid }] });

test("sin política publicada no se consulta", async () => {
  const { db } = baseFalsa({ terminos: [], consentimientos: [aceptado], historial: [avisoAntes()] });
  const bcra = bcraFalso();
  assert.equal((await verificarSituacion(ctx(db, bcra, conCuilEnElMensaje()), CUIL)).consultado, false);
  assert.equal((await registrarConsentimiento(ctx(db), false)).registrado, false);
  assert.equal(await estadoCredito({ db, clienteId: 1, sesion: FINANCIA, ahora: AHORA }), null);
  assert.equal(bcra.llamadas, 0);
});

test("sin términos, estadoCredito y permisoAnticipado no piden el CUIL", async () => {
  const { db } = baseFalsa({ terminos: [] });
  assert.equal(await estadoCredito({ db, clienteId: 1, sesion: FINANCIA, ahora: AHORA }), null);
  assert.equal(await permisoAnticipado({ db, clienteId: 1, sesion: { ...FINANCIA, credito_ok: null }, ahora: AHORA }), null);
});

test("con la política publicada está activa: no depende de ninguna configuración", async () => {
  const { db } = baseFalsa();
  assert.equal(db.configuracion, undefined, "la base falsa no tiene configuración: leerla rompería");
  assert.equal(await estadoCredito({ db, clienteId: 1, sesion: FINANCIA, ahora: AHORA }), "pedir_cuil");
});

test("el consentimiento se guarda con la versión vigente de los términos", async () => {
  // El "no": lo guarda la herramienta, con el wamid del mensaje en que lo dijo.
  const no = baseFalsa({ terminos: [{ id: 2 }, { id: 3 }] });
  assert.deepEqual(await registrarConsentimiento({ ...ctx(no.db), wamid: "wamid.DEL_NO" }, false), { registrado: true });
  assert.deepEqual(no.estado.consentimientos, [
    { id: 1, cliente_id: 1, terminos_version_id: 3, finalidad: "consulta_crediticia", acepta: false, wamid: "wamid.DEL_NO", created_at: AHORA },
  ]);
  // El "sí": lo guarda la verificación al recibir el CUIL, con el wamid del mensaje que lo trae.
  const si = baseFalsa({ terminos: [{ id: 2 }, { id: 3 }], historial: [avisoAntes()] });
  await verificarSituacion(ctx(si.db, bcraFalso(), conCuilEnElMensaje()), CUIL);
  assert.deepEqual(si.estado.consentimientos, [
    { id: 1, cliente_id: 1, terminos_version_id: 3, finalidad: "consulta_crediticia", acepta: true, wamid: "wamid.DEL_CUIL", created_at: AHORA },
  ]);
});

// ── Pasar el CUIL es la autorización ──

test("sin aviso ni un sí vigente no se consulta al BCRA ni se guarda nada", async () => {
  for (const consentimientos of [[], [negado]]) {
    const { db, estado } = baseFalsa({ consentimientos });
    const bcra = bcraFalso();
    const r = await verificarSituacion(ctx(db, bcra, conCuilEnElMensaje()), CUIL);
    assert.equal(r.consultado, false);
    assert.equal(bcra.llamadas, 0);
    assert.equal(estado.consentimientos.length, consentimientos.length, "no se guarda ningún sí");
    assert.equal(estado.cuilInformado, undefined, "ni el CUIL informado");
  }
});

test("con el aviso en un turno anterior, el CUIL en el mensaje guarda el sí con el wamid de ese mensaje y recién después consulta", async () => {
  const { db, estado } = baseFalsa({ historial: [avisoAntes()] });
  const bcra = bcraFalso();
  const r = await verificarSituacion(ctx(db, bcra, conCuilEnElMensaje()), "20-12345678-6");
  assert.deepEqual(r, { consultado: true });
  assert.equal(bcra.llamadas, 1);
  assert.deepEqual(estado.consentimientos.map((c) => [c.acepta, c.wamid]), [[true, "wamid.DEL_CUIL"]]);
  assert.equal(estado.consultas[0].consentimiento_id, 1, "la consulta queda atada a ese sí");
  assert.equal(estado.cliente.cuil, CUIL);
});

test("en un lote de varios mensajes, el sí queda con el wamid del mensaje que trae el CUIL", async () => {
  const { db, estado } = baseFalsa({ historial: [avisoAntes()] });
  const entrantes = [
    { texto: `Dale, ${CUIL}`, wamid: "wamid.PRIMERO" },
    { texto: "y otra cosa, ¿tienen el Onix en blanco?", wamid: "wamid.SEGUNDO" },
  ];
  assert.equal((await verificarSituacion(ctx(db, bcraFalso(), { entrantes }), CUIL)).consultado, true);
  assert.equal(estado.consentimientos[0].wamid, "wamid.PRIMERO");

  // El CUIL en el segundo mensaje del lote: el wamid es el del segundo.
  const otro = baseFalsa({ historial: [avisoAntes()] });
  const alReves = [
    { texto: "Hola, perdón la demora", wamid: "wamid.PRIMERO" },
    { texto: `${CUIL.slice(0, 2)} ${CUIL.slice(2, 10)} ${CUIL.slice(10)}`, wamid: "wamid.SEGUNDO" },
  ];
  assert.equal((await verificarSituacion(ctx(otro.db, bcraFalso(), { entrantes: alReves }), CUIL)).consultado, true);
  assert.equal(otro.estado.consentimientos[0].wamid, "wamid.SEGUNDO");
});

test("el aviso tiene que ser de un turno anterior de esta consulta y nombrar el CUIL y el BCRA", async () => {
  const casos = [
    ["del mismo turno (ahora + 1 ms)", [avisoAntes(AVISO, new Date(AHORA.getTime() + 1))]],
    ["de una consulta anterior", [avisoAntes(AVISO, new Date(INICIO - DIA_MS))]],
    ["un mensaje que nombra el BCRA pero no el CUIL", [avisoAntes("El asesor puede ver tu situación en la Central de Deudores del BCRA.")]],
    ["un mensaje que nombra el CUIL pero no el BCRA ni la Central de Deudores", [avisoAntes("¿Me pasás tu CUIL? Así el asesor te arma las opciones.")]],
    ["un mensaje del cliente", [{ direccion: "entrante", mensaje: AVISO, created_at: new Date(AHORA - 60_000) }]],
  ];
  for (const [caso, historial] of casos) {
    const { db, estado } = baseFalsa({ historial });
    const bcra = bcraFalso();
    const r = await verificarSituacion(ctx(db, bcra, conCuilEnElMensaje()), CUIL);
    assert.equal(r.consultado, false, caso);
    assert.equal(bcra.llamadas, 0, caso);
    assert.equal(estado.consentimientos.length, 0, caso);
  }
});

test("un CUIL antes del aviso no se consulta ni se guarda, y el motivo pide decir para qué es y que lo vuelva a mandar", async () => {
  const { db, estado } = baseFalsa();
  const bcra = bcraFalso();
  const r = await verificarSituacion(ctx(db, bcra, conCuilEnElMensaje(`Tengo recibo, mi cuil ${CUIL}`)), CUIL);
  assert.equal(r.consultado, false);
  assert.match(r.motivo, /para qué/);
  assert.match(r.motivo, /vuelva a mandar/);
  assert.equal(bcra.llamadas, 0);
  assert.equal(estado.consentimientos.length, 0);
  assert.equal(estado.cuilInformado, undefined);
});

test("un CUIL viejo de la charla no se consulta sin un sí vigente, aunque haya aviso", async () => {
  // El mensaje que se responde no trae el CUIL: la IA lo tomó de la charla.
  const { db, estado } = baseFalsa({ historial: [avisoAntes()] });
  const bcra = bcraFalso();
  const r = await verificarSituacion(ctx(db, bcra, { entrantes: [{ texto: "sí", wamid: "wamid.SI_SUELTO" }] }), CUIL);
  assert.equal(r.consultado, false);
  assert.match(r.motivo, /vuelva a mandar/);
  assert.equal(bcra.llamadas, 0);
  assert.equal(estado.consentimientos.length, 0);
  assert.equal(estado.cuilInformado, undefined);
});

test("un CUIL antes de lo del recibo no se guarda y el motivo dice que siga el recorrido", async () => {
  const { db, estado } = baseFalsa({ sesion: { ...FINANCIA, credito_ok: null }, historial: [avisoAntes()] });
  const bcra = bcraFalso();
  const r = await verificarSituacion(ctx(db, bcra, conCuilEnElMensaje()), CUIL);
  assert.equal(r.consultado, false);
  assert.match(r.motivo, /seguí con el recorrido/);
  assert.match(r.motivo, /vuelva a mandar/);
  assert.equal(bcra.llamadas, 0);
  assert.equal(estado.consentimientos.length, 0);
  assert.equal(estado.cuilInformado, undefined);
});

test("después de un no de otra consulta, un CUIL sin aviso en esta consulta no se consulta", async () => {
  const { db, estado } = baseFalsa({ consentimientos: [negado], historial: [avisoAntes(AVISO, new Date(INICIO - 5 * DIA_MS))] });
  const bcra = bcraFalso();
  const r = await verificarSituacion(ctx(db, bcra, conCuilEnElMensaje()), CUIL);
  assert.equal(r.consultado, false);
  assert.match(r.motivo, /vuelva a mandar/);
  assert.equal(bcra.llamadas, 0);
  assert.equal(estado.consentimientos.length, 1, "sigue solo el no");
});

test("después de un no, el CUIL en el mensaje tras el aviso crea un sí nuevo y consulta (sí, no, CUIL: tres registros)", async () => {
  const { db, estado } = baseFalsa({ consentimientos: [aceptado, { ...negado, id: 2 }], historial: [avisoAntes()] });
  const bcra = bcraFalso();
  assert.equal((await verificarSituacion(ctx(db, bcra, conCuilEnElMensaje()), CUIL)).consultado, true);
  assert.deepEqual(estado.consentimientos.map((c) => c.acepta), [true, false, true]);
  assert.equal(estado.consentimientos[2].wamid, "wamid.DEL_CUIL");
  assert.equal(estado.consultas[0].consentimiento_id, 3);
  assert.equal(bcra.llamadas, 1);
});

test("con el aviso, un CUIL inválido no guarda nada y uno ajeno guarda solo el CUIL informado, sin sí", async () => {
  const invalido = baseFalsa({ historial: [avisoAntes()] });
  const r1 = await verificarSituacion(ctx(invalido.db, bcraFalso(), conCuilEnElMensaje("20123456787")), "20123456787");
  assert.equal(r1.consultado, false);
  assert.match(r1.motivo, /de nuevo/);
  assert.equal(invalido.estado.consentimientos.length, 0);
  assert.equal(invalido.estado.cuilInformado, undefined);

  const ajeno = baseFalsa({ cliente: { id: 1, dni: "87654321", cuil: null }, historial: [avisoAntes()] });
  const bcra = bcraFalso();
  const r2 = await verificarSituacion(ctx(ajeno.db, bcra, conCuilEnElMensaje()), CUIL);
  assert.equal(r2.consultado, false);
  assert.match(r2.motivo, /vendedor/);
  assert.equal(ajeno.estado.consentimientos.length, 0, "un CUIL ajeno no deja un sí");
  assert.deepEqual(ajeno.estado.cuilInformado, { sesionId: 7, cuil: CUIL });
  assert.equal(bcra.llamadas, 0);
});

test("un sí del permiso anterior sigue valiendo: el CUIL se consulta sin aviso nuevo, y con un no viejo no se pide", async () => {
  const conSi = baseFalsa({ consentimientos: [aceptado] });
  const bcra = bcraFalso();
  assert.equal((await verificarSituacion(ctx(conSi.db, bcra, conCuilEnElMensaje()), CUIL)).consultado, true);
  assert.equal(conSi.estado.consentimientos.length, 1, "sin aviso nuevo no se guarda otro sí");
  assert.equal(conSi.estado.consultas[0].consentimiento_id, 1);
  // Antes del CUIL, con ese sí el contexto pide el CUIL (no un permiso).
  assert.equal(await estadoCredito({ db: baseFalsa({ consentimientos: [aceptado] }).db, clienteId: 1, sesion: FINANCIA, ahora: AHORA }), "pedir_cuil");
  // Con ese sí, un CUIL inválido no lo borra.
  const otro = baseFalsa({ consentimientos: [aceptado] });
  await verificarSituacion(ctx(otro.db, bcraFalso(), conCuilEnElMensaje("123")), "123");
  assert.deepEqual(otro.estado.consentimientos, [aceptado]);

  const conNo = baseFalsa({ consentimientos: [negado] });
  assert.equal(await estadoCredito({ db: conNo.db, clienteId: 1, sesion: FINANCIA, ahora: AHORA }), null);
});

test("registrarConsentimiento guarda el no, pero un sí pedido por la herramienta no se guarda", async () => {
  const { db, estado } = baseFalsa({ historial: [avisoAntes()] });
  const si = await registrarConsentimiento({ ...ctx(db), wamid: "wamid.X" }, true);
  assert.equal(si.registrado, false);
  assert.match(si.motivo, /CUIL/);
  assert.equal(estado.consentimientos.length, 0);
  assert.deepEqual(await registrarConsentimiento({ ...ctx(db), wamid: "wamid.NO" }, false), { registrado: true });
  assert.deepEqual(estado.consentimientos.map((c) => [c.acepta, c.wamid]), [[false, "wamid.NO"]]);
});

test("el no se guarda con la versión vigente y deja de pedir el CUIL", async () => {
  const { db, estado } = baseFalsa();
  await registrarConsentimiento({ ...ctx(db), wamid: "wamid.NO" }, false);
  assert.equal(estado.consentimientos[0].terminos_version_id, 3);
  assert.equal(await estadoCredito({ db, clienteId: 1, sesion: FINANCIA, ahora: AHORA }), null);
  const bcra = bcraFalso();
  assert.equal((await verificarSituacion(ctx(db, bcra), CUIL)).consultado, false);
  assert.equal(bcra.llamadas, 0);
});

test("un no posterior revoca el sí", async () => {
  const { db } = baseFalsa({ consentimientos: [aceptado] });
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
    const { db } = baseFalsa({ sesion: { id: 7, sesion_inicio: INICIO, ...sesion }, consentimientos: [aceptado] });
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

test("estadoCredito: pide el CUIL si no lo pasó y no dijo que no; nada si dijo que no, ya se consultó o el BCRA falló hace menos de una hora", async () => {
  const estadoCon = (opciones, sesion = FINANCIA) => {
    const { db } = baseFalsa(opciones);
    return estadoCredito({ db, clienteId: 1, sesion, ahora: AHORA });
  };
  assert.equal(await estadoCon({}), "pedir_cuil", "sin respuesta: el CUIL directo, sin permiso aparte");
  assert.equal(await estadoCon({ consentimientos: [aceptado] }), "pedir_cuil");
  assert.equal(await estadoCon({ consentimientos: [negado] }), null);
  assert.equal(await estadoCon({ consentimientos: [aceptado], consultas: [{ cliente_id: 1, estado: "ok", consultado_at: AHORA }] }), null);
  assert.equal(await estadoCon({ consentimientos: [aceptado], consultas: [{ cliente_id: 1, estado: "error", consultado_at: AHORA }] }), null);
  // Un error de hace más de una hora no bloquea: se puede volver a pedir el CUIL.
  const errorViejo = { cliente_id: 1, estado: "error", consultado_at: new Date(AHORA - 2 * 3_600_000) };
  assert.equal(await estadoCon({ consultas: [errorViejo] }), "pedir_cuil");
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
    { consentimientos: [negado], cuil: CUIL },
  ];
  for (const { consentimientos, cuil } of casos) {
    const { db, estado } = baseFalsa({ consentimientos });
    await verificarSituacion(ctx(db, bcraFalso()), cuil);
    assert.equal(estado.cuilInformado, undefined);
  }
});

// ── La autorización se guarda una sola vez ──

test("el CUIL mandado dos veces deja un solo sí con el wamid del primero", async () => {
  const { db, estado } = baseFalsa({ historial: [avisoAntes()] });
  await verificarSituacion(ctx(db, bcraFalso(), conCuilEnElMensaje(CUIL, "wamid.PRIMER_CUIL")), CUIL);
  await verificarSituacion(ctx(db, bcraFalso(), conCuilEnElMensaje(`te lo paso de nuevo ${CUIL}`, "wamid.SEGUNDO_CUIL")), CUIL);
  assert.equal(estado.consentimientos.length, 1);
  assert.equal(estado.consentimientos[0].wamid, "wamid.PRIMER_CUIL");
});

test("con un sí vigente de la misma versión, el CUIL en el mensaje tras el aviso consulta sin crear otro sí ni cambiar su wamid", async () => {
  const previo = { ...aceptado, wamid: "wamid.SI_ANTERIOR" };
  const { db, estado } = baseFalsa({ consentimientos: [previo], historial: [avisoAntes()] });
  const bcra = bcraFalso();
  assert.equal((await verificarSituacion(ctx(db, bcra, conCuilEnElMensaje()), CUIL)).consultado, true);
  assert.deepEqual(estado.consentimientos, [previo]);
  assert.equal(estado.consultas[0].consentimiento_id, 1);
  assert.equal(bcra.llamadas, 1);
});

test("el mismo no repetido tampoco crea otro registro", async () => {
  const { db, estado } = baseFalsa();
  await registrarConsentimiento(ctx(db), false);
  assert.deepEqual(await registrarConsentimiento(ctx(db), false), { registrado: true, repetido: true });
  assert.equal(estado.consentimientos.length, 1);
});

test("si cambia de respuesta (sí y después no), se guarda un registro nuevo que revoca el anterior", async () => {
  const { db, estado } = baseFalsa({ historial: [avisoAntes()] });
  await verificarSituacion(ctx(db, bcraFalso(), conCuilEnElMensaje()), CUIL);
  await registrarConsentimiento(ctx(db), false);
  assert.deepEqual(estado.consentimientos.map((c) => c.acepta), [true, false]);
  const bcra = bcraFalso();
  assert.equal((await verificarSituacion(ctx(db, bcra), CUIL)).consultado, false);
  assert.equal(bcra.llamadas, 0);
});

test("el mismo sí pero con una versión nueva de los términos se guarda otra vez", async () => {
  const { db, estado } = baseFalsa({ terminos: [{ id: 3 }], consentimientos: [{ id: 1, cliente_id: 1, terminos_version_id: 2, acepta: true }], historial: [avisoAntes()] });
  await verificarSituacion(ctx(db, bcraFalso(), conCuilEnElMensaje()), CUIL);
  assert.equal(estado.consentimientos.length, 2);
  assert.equal(estado.consentimientos[1].terminos_version_id, 3);
  assert.equal(estado.consentimientos[1].wamid, "wamid.DEL_CUIL");
});

// ── El CUIL en el orden desde antes del recibo ──

test("permisoAnticipado: si financia y todavía no dijo lo del recibo, avisa que el CUIL va justo después (sin habilitar pedirlo ahora)", async () => {
  const antes = { id: 7, pago_tipo: "financiado", credito_ok: null, sesion_inicio: INICIO };
  const estadoCon = (opciones, sesion = antes) => permisoAnticipado({ db: baseFalsa(opciones).db, clienteId: 1, sesion, ahora: AHORA });
  assert.equal(await estadoCon({}), "pedir_cuil_tras_el_recibo");
  // estadoCredito sigue sin pedir nada antes del recibo.
  assert.equal(await estadoCredito({ db: baseFalsa({}).db, clienteId: 1, sesion: antes, ahora: AHORA }), null);
});

test("permisoAnticipado: no aplica si paga de contado, ya dijo lo del recibo, dijo que no, ya se consultó o no hay términos", async () => {
  const antes = { id: 7, pago_tipo: "financiado", credito_ok: null, sesion_inicio: INICIO };
  const estadoCon = (opciones, sesion = antes) => permisoAnticipado({ db: baseFalsa(opciones).db, clienteId: 1, sesion, ahora: AHORA });
  assert.equal(await estadoCon({}, { id: 7, pago_tipo: "contado", credito_ok: null }), null);
  assert.equal(await estadoCon({}, { id: 7, pago_tipo: null, credito_ok: null }), null);
  assert.equal(await estadoCon({}, { id: 7, pago_tipo: "financiado", credito_ok: 1 }), null);
  assert.equal(await estadoCon({}, { id: 7, pago_tipo: "financiado", credito_ok: 0 }), null);
  assert.equal(await estadoCon({ consentimientos: [negado] }), null);
  assert.equal(await estadoCon({ terminos: [] }), null);
  assert.equal(await estadoCon({ consultas: [{ cliente_id: 1, estado: "ok", consultado_at: AHORA }] }), null);
  // Con un sí del permiso anterior, el CUIL sigue pendiente: va después del recibo.
  assert.equal(await estadoCon({ consentimientos: [aceptado] }), "pedir_cuil_tras_el_recibo");
});
