import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fechaAR,
  telefonoWhatsApp,
  cuotasParaAvisar,
  plantillaDeAviso,
  prepararAvisosDelDia,
  registrarResultado,
  avisoReciente,
  esBaja,
  darDeBaja,
  PLANTILLA_CUOTA,
  TEXTO_PLANTILLA_CUOTA,
  proximoAviso,
  conAvisosPrimero,
} from "./avisos-cuotas.service.js";

// 15/10/2026 a las 9:00 de Argentina.
const ahora = new Date("2026-10-15T12:00:00Z");

const cuota = (numero, vencimiento, pagado = false) => ({ numero, vencimiento: `${vencimiento}T03:00:00.000Z`, pagado });

test("la fecha de hoy es la de Argentina, aunque en UTC ya sea mañana", () => {
  assert.equal(fechaAR(new Date("2026-10-16T01:00:00Z")), "2026-10-15");
  assert.equal(fechaAR(ahora), "2026-10-15");
});

test("el teléfono sale como 54 + 10 dígitos, que es como lo acepta WhatsApp", () => {
  assert.equal(telefonoWhatsApp("3885550101"), "543885550101");
  assert.equal(telefonoWhatsApp("03885550101"), "543885550101");
  assert.equal(telefonoWhatsApp("+54 9 388 555-0101"), "543885550101");
  assert.equal(telefonoWhatsApp("543885550101"), "543885550101");
  assert.equal(telefonoWhatsApp("5550101"), null);
  assert.equal(telefonoWhatsApp(""), null);
  assert.equal(telefonoWhatsApp(null), null);
});

test("avisa la cuota impaga que vence en 3 días, mañana u hoy", () => {
  const f = { cronograma: [cuota(1, "2026-09-18", true), cuota(2, "2026-10-18")] };
  assert.deepEqual(cuotasParaAvisar(f, "2026-10-15"), [{ numero: 2, vencimiento: "2026-10-18", diasAntes: 3 }]);
  assert.deepEqual(cuotasParaAvisar(f, "2026-10-17"), [{ numero: 2, vencimiento: "2026-10-18", diasAntes: 1 }]);
  assert.deepEqual(cuotasParaAvisar(f, "2026-10-18"), [{ numero: 2, vencimiento: "2026-10-18", diasAntes: 0 }]);
});

test("a 2 días no avisa: son 3 avisos por cuota (3 días antes, 1 antes y el día)", () => {
  const f = { cronograma: [cuota(2, "2026-10-18")] };
  assert.deepEqual(cuotasParaAvisar(f, "2026-10-16"), []);
});

test("si el admin ya marcó la cuota como paga, no hay seguimiento hasta la del mes que viene", () => {
  const f = { cronograma: [cuota(2, "2026-10-18", true), cuota(3, "2026-11-18")] };
  assert.deepEqual(cuotasParaAvisar(f, "2026-10-15"), []);
  assert.deepEqual(cuotasParaAvisar(f, "2026-11-15"), [{ numero: 3, vencimiento: "2026-11-18", diasAntes: 3 }]);
});

test("una cuota vieja impaga no frena el aviso de la de este mes", () => {
  const f = { cronograma: [cuota(1, "2026-09-18"), cuota(2, "2026-10-18")] };
  assert.deepEqual(cuotasParaAvisar(f, "2026-10-15"), [{ numero: 2, vencimiento: "2026-10-18", diasAntes: 3 }]);
});

test("la plantilla lleva nombre, cuota, cuándo vence, la fecha y el importe", () => {
  const cuerpo = plantillaDeAviso({ telefono: "543885550101", nombre: "Juan Pérez", numero: 8, cuotasTotal: 24, vencimiento: "2026-10-18", diasAntes: 1, importe: 250000 });
  assert.equal(cuerpo.to, "543885550101");
  assert.equal(cuerpo.type, "template");
  assert.equal(cuerpo.template.name, PLANTILLA_CUOTA);
  assert.deepEqual(cuerpo.template.language, { code: "es_AR" });
  const textos = cuerpo.template.components[0].parameters.map((p) => p.text);
  assert.deepEqual(textos, ["Juan", "8", "24", "mañana", "18/10", "250.000"]);
});

test("'en 3 días' y 'hoy' según el aviso", () => {
  const base = { telefono: "543885550101", nombre: "Ana", numero: 1, cuotasTotal: 12, vencimiento: "2026-10-18", importe: 1000.5 };
  const textoCuando = (diasAntes) => plantillaDeAviso({ ...base, diasAntes }).template.components[0].parameters[3].text;
  assert.equal(textoCuando(3), "en 3 días");
  assert.equal(textoCuando(0), "hoy");
  assert.equal(plantillaDeAviso({ ...base, diasAntes: 0 }).template.components[0].parameters[5].text, "1.000,5");
});

// ── Con base ──

function fila({ id = 1, telefono = "3885550101", telefonoAlt = null, pagos = [], creado = "2026-05-10T15:00:00Z", diaPago = 18 } = {}) {
  return {
    id,
    cliente_id: 7,
    cantidad_cuotas: 24,
    precio_cuota: 250000,
    dia_pago: diaPago,
    telefono_alt: telefonoAlt,
    activo: true,
    created_at: new Date(creado),
    clientes: { nombre: "Juan Pérez", telefono, dni: "30111222", email: "j@x.com" },
    pagos: pagos.map((numero) => ({ numero })),
  };
}

function baseFalsa(filas, { avisos = [], alertas = [] } = {}) {
  const estado = { avisos: [...avisos], alertas: [...alertas], financiaciones: filas.map((f) => ({ ...f })) };
  const enEstado = (a, where) => (where.estado?.in ? where.estado.in.includes(a.estado) : a.estado === where.estado);
  const conNumeroEquivocado = (id) => estado.alertas.some((a) => a.financiacion_id === id && a.tipo === "numero_equivocado" && !a.atendida_at);
  const db = {
    estado,
    $transaction: async (fn) => fn(db),
    financiaciones: {
      findMany: async ({ where }) =>
        estado.financiaciones
          .filter((f) => !where.id?.in || where.id.in.includes(f.id))
          .filter((f) => where.avisos_baja_at !== null || !f.avisos_baja_at)
          .filter((f) => !where.NOT?.alertas || !conNumeroEquivocado(f.id)),
      updateMany: async ({ where, data }) => {
        const tocadas = estado.financiaciones.filter((f) => where.id.in.includes(f.id) && !f.avisos_baja_at);
        tocadas.forEach((f) => Object.assign(f, data));
        return { count: tocadas.length };
      },
    },
    financiacion_avisos: {
      create: async ({ data }) => {
        const repetido = estado.avisos.some((a) => a.financiacion_id === data.financiacion_id && a.numero === data.numero && a.dias_antes === data.dias_antes);
        if (repetido) throw Object.assign(new Error("dup"), { code: "P2002" });
        const aviso = { id: estado.avisos.length + 1, created_at: data.created_at ?? new Date(), ...data };
        estado.avisos.push(aviso);
        return aviso;
      },
      findUnique: async ({ where }) => {
        const k = where.financiacion_id_numero_dias_antes;
        return estado.avisos.find((a) => a.financiacion_id === k.financiacion_id && a.numero === k.numero && a.dias_antes === k.dias_antes) ?? null;
      },
      updateMany: async ({ where, data }) => {
        const tocados = estado.avisos.filter((a) => a.id === where.id && a.estado === where.estado);
        tocados.forEach((a) => Object.assign(a, data));
        return { count: tocados.length };
      },
      findFirst: async ({ where }) =>
        estado.avisos
          .filter((a) => a.telefono === where.telefono && enEstado(a, where) && a.created_at >= where.created_at.gte)
          .map((a) => ({ ...a, financiaciones: { cantidad_cuotas: 24, precio_cuota: 250000 } }))
          .at(-1) ?? null,
      findMany: async ({ where }) => estado.avisos.filter((a) => a.telefono === where.telefono && enEstado(a, where)),
    },
    financiacion_alertas: {
      createMany: async ({ data }) => (estado.alertas.push(...data), { count: data.length }),
    },
  };
  return db;
}

test("arma los avisos del día y los registra: la cuota de octubre vence en 3 días", async () => {
  const db = baseFalsa([fila()]);
  const envios = await prepararAvisosDelDia({ db, ahora });
  assert.equal(envios.length, 1);
  assert.equal(envios[0].cuerpo.to, "543885550101");
  assert.equal(db.estado.avisos[0].estado, "pendiente");
  assert.equal(db.estado.avisos[0].dias_antes, 3);
  assert.equal(envios[0].avisoId, db.estado.avisos[0].id);
});

test("si n8n corre dos veces el mismo día, el aviso no sale dos veces", async () => {
  const db = baseFalsa([fila()]);
  await prepararAvisosDelDia({ db, ahora });
  assert.deepEqual(await prepararAvisosDelDia({ db, ahora }), []);
  assert.equal(db.estado.avisos.length, 1);
});

test("usa el teléfono alternativo de la financiación si lo tiene", async () => {
  const db = baseFalsa([fila({ telefonoAlt: "3884440000" })]);
  const [envio] = await prepararAvisosDelDia({ db, ahora });
  assert.equal(envio.cuerpo.to, "543884440000");
});

test("sin un WhatsApp válido no se manda: queda 'sin aviso' para que la agencia lo llame", async () => {
  const db = baseFalsa([fila({ telefono: "12345" })]);
  assert.deepEqual(await prepararAvisosDelDia({ db, ahora }), []);
  assert.equal(db.estado.avisos[0].estado, "sin_aviso");
});

test("al que se dio de baja no se le avisa", async () => {
  const db = baseFalsa([{ ...fila(), avisos_baja_at: new Date("2026-10-01") }]);
  assert.deepEqual(await prepararAvisosDelDia({ db, ahora }), []);
});

test("el resultado del envío se guarda una sola vez", async () => {
  const db = baseFalsa([fila()]);
  const [envio] = await prepararAvisosDelDia({ db, ahora });
  assert.equal(await registrarResultado({ db, avisoId: envio.avisoId, ok: true, wamid: "wamid.X", ahora }), true);
  assert.equal(db.estado.avisos[0].estado, "enviado");
  assert.equal(db.estado.avisos[0].wamid, "wamid.X");
  assert.equal(await registrarResultado({ db, avisoId: envio.avisoId, ok: false, error: "otra vez", ahora }), false);
});

test("un envío que falla queda como fallo, con el error recortado", async () => {
  const db = baseFalsa([fila()]);
  const [envio] = await prepararAvisosDelDia({ db, ahora });
  await registrarResultado({ db, avisoId: envio.avisoId, ok: false, error: "x".repeat(500), ahora });
  assert.equal(db.estado.avisos[0].estado, "fallo");
  assert.equal(db.estado.avisos[0].error.length, 200);
});

const enviado = (extra = {}) => ({ id: 1, financiacion_id: 1, numero: 8, vencimiento: new Date("2026-10-18T00:00:00Z"), dias_antes: 3, telefono: "543885550101", estado: "enviado", created_at: new Date("2026-10-15T12:00:00Z"), enviado_at: new Date("2026-10-15T12:00:05Z"), ...extra });

test("reconoce la respuesta a un recordatorio de las últimas 72 h, escriba con 549 o con 54", async () => {
  const db = baseFalsa([], { avisos: [enviado()] });
  const aviso = await avisoReciente({ db, telefono: "5493885550101", ahora: new Date("2026-10-16T12:00:00Z") });
  assert.deepEqual(aviso, { avisoId: 1, financiacionId: 1, numero: 8, cuotasTotal: 24, vencimiento: "2026-10-18", importe: 250000 });
});

test("pasadas las 72 h ya no es una respuesta al recordatorio", async () => {
  const db = baseFalsa([], { avisos: [enviado()] });
  assert.equal(await avisoReciente({ db, telefono: "5493885550101", ahora: new Date("2026-10-18T13:00:00Z") }), null);
});

test("BAJA se reconoce sola, sin importar mayúsculas ni el punto", () => {
  assert.equal(esBaja("BAJA"), true);
  assert.equal(esBaja(" baja. "), true);
  assert.equal(esBaja("Baja!"), true);
  assert.equal(esBaja("quiero dar de baja el auto"), false);
  assert.equal(esBaja(null), false);
});

test("BAJA apaga los avisos de sus financiaciones y le deja una alerta al admin", async () => {
  const db = baseFalsa([fila()], { avisos: [enviado(), enviado({ id: 2, numero: 9 })] });
  const r = await darDeBaja({ db, telefono: "5493885550101", ahora });
  assert.deepEqual(r, { financiaciones: 1 });
  assert.ok(db.estado.financiaciones[0].avisos_baja_at instanceof Date);
  assert.deepEqual(db.estado.alertas.map((a) => [a.financiacion_id, a.tipo]), [[1, "baja"]]);
});

test("BAJA de alguien que nunca recibió un recordatorio no hace nada", async () => {
  const db = baseFalsa([fila()]);
  assert.equal(await darDeBaja({ db, telefono: "5493885550101", ahora }), null);
  assert.equal(db.estado.financiaciones[0].avisos_baja_at, undefined);
});

test("la plantilla aprobada tiene un lugar por cada dato que se manda, y ofrece la BAJA", () => {
  const lugares = TEXTO_PLANTILLA_CUOTA.match(/\{\{\d\}\}/g);
  const cuerpo = plantillaDeAviso({ telefono: "543885550101", nombre: "Ana", numero: 1, cuotasTotal: 12, vencimiento: "2026-10-18", diasAntes: 3, importe: 1000 });
  assert.equal(lugares.length, cuerpo.template.components[0].parameters.length);
  assert.match(TEXTO_PLANTILLA_CUOTA, /respondé BAJA/);
  assert.match(TEXTO_PLANTILLA_CUOTA, /en la agencia o por transferencia/);
});

// ── Después de la revisión de código ──

test("si n8n se cortó después de registrar el aviso, una nueva corrida lo vuelve a entregar (pasados 10 minutos)", async () => {
  const db = baseFalsa([fila()]);
  const [primero] = await prepararAvisosDelDia({ db, ahora });
  assert.deepEqual(await prepararAvisosDelDia({ db, ahora: new Date(ahora.getTime() + 60_000) }), [], "recién creado: puede estar saliendo");
  const [otraVez] = await prepararAvisosDelDia({ db, ahora: new Date(ahora.getTime() + 11 * 60_000) });
  assert.equal(otraVez.avisoId, primero.avisoId, "mismo aviso, no uno nuevo");
  assert.equal(db.estado.avisos.length, 1);
});

test("un aviso ya enviado no se reenvía aunque se vuelva a correr", async () => {
  const db = baseFalsa([fila()]);
  const [envio] = await prepararAvisosDelDia({ db, ahora });
  await registrarResultado({ db, avisoId: envio.avisoId, ok: true, wamid: "w", ahora });
  assert.deepEqual(await prepararAvisosDelDia({ db, ahora: new Date(ahora.getTime() + 3_600_000) }), []);
});

test("la respuesta se reconoce aunque n8n no haya llegado a informar el envío", async () => {
  const db = baseFalsa([], { avisos: [enviado({ estado: "pendiente", enviado_at: null })] });
  const aviso = await avisoReciente({ db, telefono: "5493885550101", ahora: new Date("2026-10-15T14:00:00Z") });
  assert.equal(aviso?.avisoId, 1);
});

test("otras formas de pedir la baja", () => {
  for (const t of ["Baja, gracias", "dar de baja", "Quiero darme de baja", "no quiero más avisos", "No me manden más mensajes!", "STOP"]) {
    assert.equal(esBaja(t), true, t);
  }
  assert.equal(esBaja("bajá el precio"), false);
});

test("BAJA repetida no duplica la alerta del admin", async () => {
  const db = baseFalsa([fila()], { avisos: [enviado()] });
  await darDeBaja({ db, telefono: "5493885550101", ahora });
  assert.deepEqual(await darDeBaja({ db, telefono: "5493885550101", ahora }), { financiaciones: 0 }, "igual se le confirma, sin IA");
  assert.equal(db.estado.alertas.length, 1);
});

test("si avisaron que es un número equivocado, no se le mandan más avisos hasta que el admin lo atienda", async () => {
  const db = baseFalsa([fila()], { alertas: [{ financiacion_id: 1, tipo: "numero_equivocado", atendida_at: null }] });
  assert.deepEqual(await prepararAvisosDelDia({ db, ahora }), []);
  db.estado.alertas[0].atendida_at = ahora;
  assert.equal((await prepararAvisosDelDia({ db, ahora })).length, 1);
});

test("se puede limitar a algunas financiaciones (el simulador no toca las demás)", async () => {
  const pedidos = [];
  const db = baseFalsa([fila()]);
  const findMany = db.financiaciones.findMany;
  db.financiaciones.findMany = async (args) => (pedidos.push(args), findMany(args));
  await prepararAvisosDelDia({ db, ahora, ids: [1, 2] });
  assert.deepEqual(pedidos[0].where.id, { in: [1, 2] });
  await prepararAvisosDelDia({ db, ahora: new Date(ahora.getTime() + 86_400_000) });
  assert.equal(pedidos[1].where.id, undefined, "sin ids: todas");
});

// ── Panel: financiaciones con un aviso en curso ──

test("una financiación está en aviso si su cuota impaga vence en 3 días o menos", () => {
  const f = { cronograma: [cuota(1, "2026-09-18", true), cuota(2, "2026-10-17")] };
  assert.deepEqual(proximoAviso(f, "2026-10-15"), { numero: 2, vencimiento: "2026-10-17", dias: 2 });
  assert.equal(proximoAviso(f, "2026-10-13"), null, "faltan 4 días: todavía no");
  assert.equal(proximoAviso(f, "2026-10-18"), null, "ya venció: no es un aviso en curso");
  assert.equal(proximoAviso({ cronograma: [cuota(2, "2026-10-17", true)] }, "2026-10-15"), null, "paga: no");
});

test("las que están en aviso van primero, la que vence antes arriba; el resto queda en su orden", () => {
  const items = [
    { id: 1, proximoAviso: null },
    { id: 2, proximoAviso: { dias: 3 } },
    { id: 3, proximoAviso: null },
    { id: 4, proximoAviso: { dias: 0 } },
  ];
  assert.deepEqual(conAvisosPrimero(items).map((f) => f.id), [4, 2, 1, 3]);
  assert.deepEqual(items.map((f) => f.id), [1, 2, 3, 4], "no cambia la lista original");
});
