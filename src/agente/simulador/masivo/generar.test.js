// Tests del generador de casos masivos (tarea 10 de huecos-del-bot) y de su ORÁCULO `esperadoDe`.
// Los tests del oráculo son la definición de "lo correcto": cada uno cita el requisito de la spec que aplica.
//
// Modelo de un caso (lo que asumen estos tests y tiene que respetar el generador):
//  - turno 1: primer contacto por el auto SIM-01 (sin link, salvo que el eje `asesor` pida uno: ahí
//    va con `[AS:juan]`); la IA registra forma de pago y usado.
//  - turno 2: la vuelta del cliente, `tiempo` después del último mensaje del turno 1. Acá van el link
//    del eje `asesor` (link_mismo = juan, link_otro = pepito, link_invalido = código inexistente,
//    asesor_de_baja = `inactivo`) y el cambio de auto (cambia_1, ref_con_numeral y con_tramite_o_sena
//    pasan a SIM-02; auto_que_ya_no_esta pide SIM-06, que ya no está). El eje `medios` y el de
//    `manipulacion` describen este turno de vuelta (el último con cambia_1).
//  - turno 3 (solo cambia_2): otro cambio de auto, a SIM-03, a minutos del turno 2.
//  - `atencion` y `pausa` se preparan con `turnos[1].preparar` (acciones de correr.js que se ejecutan antes de ese mensaje):
//    atendida -> marcar_atendida; bot_en_pausa -> pausar_bot (que además deja la consulta atendida);
//    autos con_tramite_o_sena -> crear_tramite_o_sena. asesor_de_baja usa el asesor `inactivo` que ya trae la base
//    sembrada (dar_de_baja_asesor existe en correr.js pero el generador no lo usa: bajaría un asesor para todos los casos).
//  - `medios` foto -> `foto: true` en el turno 2; `conducta` rafaga -> `rafaga: [...]` (2 o más mensajes) en el turno 2.
// Combinaciones imposibles que el generador evita (y el oráculo no define):
//  - audio_* / groq_falla / foto con manipulaciones de texto, y las manipulaciones de audio
//    (instrucciones_en_audio, codigo_en_audio) solo con medios audio_normal;
//  - bot_en_pausa y medios sin Claude (audio_largo, audio_vacio, groq_falla) solo con autos uno_solo
//    (sin Claude el auto no puede cambiar) y solo con tiempo dentro del plazo (la pausa es de una consulta vigente);
//  - bot_en_pausa solo con atencion atendida o atendida_responde_enseguida (pausar_bot deja la consulta atendida);
//  - atendida_responde_enseguida solo con tiempo mismo_dia y pausa bot_en_pausa (el asesor respondió desde el panel);
//  - auto_que_ya_no_esta solo con medios texto o foto (la ref viaja en el texto).
import { test } from "node:test";
import assert from "node:assert/strict";
import { EJES, generarCasos, esperadoDe, MARCA_VENCIDA, MARCA_OTRO_CLIENTE } from "./generar.js";

const DIA = 24 * 60 * 60 * 1000;

const VALORES_DE_EJES = {
  tiempo: ["mismo_dia", "1_dia", "10_dias", "29_dias", "30_dias_justos", "31_dias", "4_meses", "1_anio"],
  asesor: ["sin_link", "link_mismo", "link_otro", "link_invalido", "asesor_de_baja"],
  autos: ["uno_solo", "cambia_1", "cambia_2", "auto_que_ya_no_esta", "ref_con_numeral", "con_tramite_o_sena"],
  atencion: ["pendiente", "atendida", "atendida_responde_enseguida"],
  medios: ["texto", "audio_normal", "audio_largo", "audio_vacio", "groq_falla", "foto"],
  pausa: ["sin_pausa", "bot_en_pausa"],
  conducta: ["normal", "rafaga", "ambiguo", "faltas_de_ortografia", "cambia_forma_de_pago", "usado_despues"],
  manipulacion: ["ninguna", "instrucciones_en_texto", "instrucciones_en_audio", "codigo_en_audio", "nombre_con_instrucciones"],
};

let cacheDeCasos;
const casosPorDefecto = () => (cacheDeCasos ??= generarCasos());

// --- El generador ---

test("EJES trae exactamente los valores de cada eje", () => {
  assert.deepEqual(EJES, VALORES_DE_EJES);
});

test("genera más de 1000 casos por defecto", () => {
  assert.ok(casosPorDefecto().length > 1000, `hay ${casosPorDefecto().length}`);
});

test("cantidad se respeta cuando se pide", () => {
  assert.equal(generarCasos({ cantidad: 1300 }).length, 1300);
});

test("cada valor de cada eje aparece al menos 20 veces", () => {
  const cuenta = {};
  for (const [eje, valores] of Object.entries(EJES)) cuenta[eje] = Object.fromEntries(valores.map((v) => [v, 0]));
  for (const caso of casosPorDefecto()) {
    for (const eje of Object.keys(EJES)) {
      assert.ok(EJES[eje].includes(caso.ejes[eje]), `${caso.id}: ${eje}=${caso.ejes[eje]} no es un valor del eje`);
      cuenta[eje][caso.ejes[eje]] += 1;
    }
  }
  for (const [eje, valores] of Object.entries(cuenta)) {
    for (const [valor, n] of Object.entries(valores)) assert.ok(n >= 20, `${eje}=${valor} aparece ${n} veces`);
  }
});

test("la misma semilla da los mismos casos", () => {
  assert.deepEqual(generarCasos({ cantidad: 1100, semilla: 7 }), generarCasos({ cantidad: 1100, semilla: 7 }));
});

test("otra semilla da casos distintos", () => {
  assert.notDeepEqual(generarCasos({ cantidad: 1100, semilla: 7 }), generarCasos({ cantidad: 1100, semilla: 8 }));
});

test("los teléfonos son únicos y con formato argentino que acepta atenderMensaje", () => {
  const casos = casosPorDefecto();
  const telefonos = new Set(casos.map((c) => c.telefono));
  assert.equal(telefonos.size, casos.length);
  for (const c of casos) assert.match(String(c.telefono), /^549\d{8,10}$/, c.id);
  assert.equal(new Set(casos.map((c) => c.id)).size, casos.length, "los id también son únicos");
});

test("cada caso tiene al menos un turno, con `ahora` ISO y su guion de Claude", () => {
  for (const caso of casosPorDefecto()) {
    assert.ok(caso.turnos.length >= 1, caso.id);
    for (const turno of caso.turnos) {
      assert.equal(typeof turno.ahora, "string", caso.id);
      assert.equal(new Date(turno.ahora).toISOString(), turno.ahora, `${caso.id}: ahora no es ISO`);
      assert.ok(Array.isArray(turno.claude), `${caso.id}: falta el guion de Claude`);
    }
  }
});

test("los `ahora` de un caso van en orden creciente", () => {
  for (const caso of casosPorDefecto()) {
    for (let i = 1; i < caso.turnos.length; i++) {
      assert.ok(new Date(caso.turnos[i].ahora) > new Date(caso.turnos[i - 1].ahora), `${caso.id}: el turno ${i + 1} no es posterior`);
    }
  }
});

test("el segundo turno respeta el eje tiempo respecto del primero", () => {
  const exactos = { "1_dia": 1, "10_dias": 10, "29_dias": 29, "30_dias_justos": 30, "31_dias": 31 };
  const visto = new Set();
  for (const caso of casosPorDefecto()) {
    assert.ok(caso.turnos.length >= 2, `${caso.id}: todo caso tiene la vuelta del cliente`);
    const salto = new Date(caso.turnos[1].ahora) - new Date(caso.turnos[0].ahora);
    const t = caso.ejes.tiempo;
    visto.add(t);
    if (exactos[t]) assert.equal(salto, exactos[t] * DIA, `${caso.id}: ${t}`);
    else if (t === "mismo_dia") assert.ok(salto > 0 && salto < DIA, `${caso.id}: mismo_dia saltó ${salto} ms`);
    else if (t === "4_meses") assert.ok(salto >= 100 * DIA && salto <= 130 * DIA, `${caso.id}: 4_meses`);
    else if (t === "1_anio") assert.ok(salto >= 360 * DIA && salto <= 370 * DIA, `${caso.id}: 1_anio`);
    else assert.fail(`${caso.id}: tiempo desconocido ${t}`);
  }
  assert.equal(visto.size, 8, "se vieron los 8 valores");
});

test("los casos usan `preparar`, `foto` y `rafaga` para expresar atención, pausa, trámite, foto y ráfaga", () => {
  const acciones = (c) => (c.turnos[1].preparar ?? []).map((p) => p.accion);
  const casos = casosPorDefecto();
  for (const c of casos) {
    const { atencion, pausa, autos, medios, conducta } = c.ejes;
    const hechas = acciones(c);
    for (const a of hechas) assert.ok(["marcar_atendida", "pausar_bot", "crear_tramite_o_sena"].includes(a), `${c.id}: acción ${a}`);
    if (pausa === "bot_en_pausa") assert.ok(hechas.includes("pausar_bot"), `${c.id}: falta pausar_bot`);
    else if (atencion !== "pendiente") assert.ok(hechas.includes("marcar_atendida") && !hechas.includes("pausar_bot"), `${c.id}: falta marcar_atendida`);
    else assert.ok(!hechas.includes("marcar_atendida") && !hechas.includes("pausar_bot"), `${c.id}: no tendría que preparar atención`);
    assert.equal(hechas.includes("crear_tramite_o_sena"), autos === "con_tramite_o_sena", `${c.id}: trámite o seña`);
    assert.equal(c.turnos[1].foto === true, medios === "foto", `${c.id}: foto`);
    const rafaga = c.turnos.flatMap((t) => (t.rafaga ? [t.rafaga] : []));
    if (conducta === "rafaga") assert.ok(rafaga.length >= 1 && rafaga.every((r) => r.length >= 2 && r.every((m) => typeof m === "string")), `${c.id}: ráfaga`);
    else assert.equal(rafaga.length, 0, `${c.id}: no es ráfaga`);
    assert.ok(!hechas.includes("dar_de_baja_asesor"), `${c.id}: el generador no baja asesores`);
  }
  // Con pausa o con atendida_responde_enseguida siempre hay consulta atendida y pausa coherentes.
  for (const c of casos.filter((x) => x.ejes.pausa === "bot_en_pausa")) assert.notEqual(c.ejes.atencion, "pendiente", c.id);
  for (const c of casos.filter((x) => x.ejes.atencion === "atendida_responde_enseguida")) assert.equal(c.ejes.pausa, "bot_en_pausa", c.id);
});

test("el turno 1 registra siempre el mismo conjunto de respuestas conocido", () => {
  const claves = ["pago_tipo", "anticipo", "tiene_recibo_o_garante", "entrega_usado", "decisor", "disponibilidad"];
  for (const c of casosPorDefecto()) {
    const registro = c.turnos[0].claude.find((p) => p.herramienta === "registrar_calificacion");
    assert.ok(registro, `${c.id}: el turno 1 no registra respuestas`);
    for (const k of claves) assert.ok(registro.entrada[k] !== undefined && registro.entrada[k] !== null, `${c.id}: falta ${k}`);
    assert.equal(registro.entrada.auto_ref, "SIM-01", c.id);
  }
});

test("los cambios de auto van en el turno que dice el eje autos y el esperado usa el último cambio", () => {
  const registros = (turno) => (turno?.claude ?? []).filter((p) => p.herramienta === "registrar_calificacion").map((p) => p.entrada.auto_ref);
  const casos = casosPorDefecto();
  for (const c of casos) {
    const t2 = registros(c.turnos[1]);
    const t3 = registros(c.turnos[2]);
    const { autos } = c.ejes;
    if (autos === "cambia_1" || autos === "con_tramite_o_sena") assert.deepEqual(t2, ["SIM-02"], `${c.id}: el turno 2 registra SIM-02`);
    if (autos === "ref_con_numeral") assert.deepEqual(t2, ["#SIM-02"], `${c.id}: el turno 2 registra #SIM-02`);
    if (autos === "cambia_1" || autos === "con_tramite_o_sena" || autos === "ref_con_numeral") {
      assert.equal(c.turnos.length, 2, `${c.id}: un solo cambio`);
      assert.equal(c.esperado.autoFinal, "SIM-02", c.id);
    }
    if (autos === "cambia_2") {
      assert.equal(c.turnos.length, 3, `${c.id}: cambia_2 tiene tres turnos`);
      assert.deepEqual(t2, ["SIM-02"], `${c.id}: el turno 2 registra SIM-02`);
      assert.deepEqual(t3, ["SIM-03"], `${c.id}: el turno 3 registra SIM-03`);
      assert.equal(c.esperado.autoFinal, "SIM-03", c.id);
      assert.equal(c.esperado.motivoFinal, "Ahora le interesa Ford Fiesta 2017, antes Volkswagen Gol Trend 2018", `${c.id}: el motivo es el del último cambio`);
    }
  }
  assert.ok(casos.some((c) => c.ejes.autos === "cambia_2"));
});

test("el `esperado` de cada caso sale del oráculo con sus ejes", () => {
  for (const caso of casosPorDefecto().slice(0, 300)) assert.deepEqual(caso.esperado, esperadoDe(caso.ejes), caso.id);
});

// --- El oráculo: UN test por regla, con ejes armados a mano ---

const BASE = { tiempo: "mismo_dia", asesor: "sin_link", autos: "uno_solo", atencion: "pendiente", medios: "texto", pausa: "sin_pausa", conducta: "normal", manipulacion: "ninguna" };
const ejes = (cambios = {}) => ({ ...BASE, ...cambios });

// `asesorFinal`: slug del asesor, o "turno" cuando lo decide el reparto por turnos (no se puede predecir cuál).
// `motivoFinal`: requiere_vendedor_motivo de la consulta en la que quedó la charla (null = sin aviso).
// `subeEnLista`: la consulta en la que quedó la charla subió (orden_at = el último turno).
// `respuestasConservadas`: la consulta final conserva forma de pago y usado del primer turno.
// `anteriorIntacta`: true si quedó una consulta vencida ATENDIDA que no se tocó; null si no aplica.
// `claudeEnUltimoTurno`: false si ese turno no debe llegarle a Claude (mensaje fijo o bot en pausa).
// `mensajeFijo`: clave de MENSAJES_FIJOS que se le responde en el último turno, o null.
// `nombreComoDato`: el nombre de perfil le llega a la IA marcado como dato.
// `noLlegaAClaude`: marcas que no pueden aparecer en lo que recibe Claude en el último turno.
const ESPERADO_BASE = {
  consultas: 1,
  autoFinal: "SIM-01",
  asesorFinal: "turno",
  atribuido: false,
  motivoFinal: null,
  pendienteFinal: true,
  subeEnLista: false,
  respuestasConservadas: true,
  anteriorIntacta: null,
  claudeEnUltimoTurno: true,
  mensajeFijo: null,
  botEnPausaFinal: false,
  nombreComoDato: false,
  noLlegaAClaude: [],
};
const esperado = (cambios = {}) => ({ ...ESPERADO_BASE, ...cambios });
const COROLLA = "Toyota Corolla 2019";
const GOL = "Volkswagen Gol Trend 2018";
const FIESTA = "Ford Fiesta 2017";

test("el esperado de un caso trae la forma completa", () => {
  assert.deepEqual(Object.keys(esperadoDe(ejes())).sort(), Object.keys(ESPERADO_BASE).sort());
});

test("oráculo: una consulta con el último mensaje de hace 29 días se reutiliza", () => {
  // Requisito "Una consulta dura 30 días desde el último mensaje" › Último mensaje de hace 29 o 31 días
  assert.deepEqual(esperadoDe(ejes({ tiempo: "29_dias" })), esperado({ consultas: 1 }));
});

test("oráculo: con el último mensaje de hace 31 días se abre una consulta nueva, sin respuestas y por turno", () => {
  // Requisito "Pasado el plazo se pregunta todo de nuevo" › Vuelve a los 31 días
  // y "Una consulta dura 30 días..." › Último mensaje de hace 29 o 31 días
  assert.deepEqual(
    esperadoDe(ejes({ tiempo: "31_dias" })),
    esperado({ consultas: 2, respuestasConservadas: false, subeEnLista: true, noLlegaAClaude: [MARCA_VENCIDA] })
  );
});

test("oráculo: con 30 días justos se abre una consulta nueva", () => {
  // Requisito "Una consulta dura 30 días desde el último mensaje" › 30 días justos
  const e = esperadoDe(ejes({ tiempo: "30_dias_justos" }));
  assert.equal(e.consultas, 2);
  assert.equal(e.respuestasConservadas, false);
});

test("oráculo: a los 10 días sigue en la misma consulta, con su asesor y sus respuestas", () => {
  // Requisito "Una consulta dura 30 días..." › Vuelve a los 10 días
  assert.deepEqual(esperadoDe(ejes({ tiempo: "10_dias", asesor: "link_mismo" })), esperado({ asesorFinal: "juan", atribuido: true }));
});

test("oráculo: a los 4 meses con el link de un asesor, la consulta nueva queda asignada y atribuida a ese asesor", () => {
  // Requisito "Pasado el plazo se pregunta todo de nuevo" › Vuelve a los 4 meses por un link
  assert.deepEqual(
    esperadoDe(ejes({ tiempo: "4_meses", asesor: "link_otro" })),
    esperado({ consultas: 2, asesorFinal: "pepito", atribuido: true, respuestasConservadas: false, subeEnLista: true, noLlegaAClaude: [MARCA_VENCIDA] })
  );
});

test("oráculo: la charla de una consulta vencida no le llega a Claude, la de una vigente no se descarta", () => {
  // Requisito "La IA ve solo la charla de la consulta en curso" › Charla de una consulta vencida / Charla dentro del plazo
  assert.deepEqual(esperadoDe(ejes({ tiempo: "1_anio" })).noLlegaAClaude, [MARCA_VENCIDA]);
  assert.deepEqual(esperadoDe(ejes({ tiempo: "10_dias" })).noLlegaAClaude, []);
});

test("oráculo: atendida que vuelve a los 10 días por el mismo auto queda pendiente, 'Volvió a escribir' y arriba", () => {
  // Requisito "El cliente vuelve a escribir en una consulta atendida" › Vuelve a los 10 días por el mismo auto
  assert.deepEqual(
    esperadoDe(ejes({ tiempo: "10_dias", atencion: "atendida" })),
    esperado({ motivoFinal: "Volvió a escribir", subeEnLista: true })
  );
});

test("oráculo: atendida que vuelve por otro auto queda con 'Ahora le interesa <nuevo>, antes <anterior>', no 'Volvió a escribir'", () => {
  // Requisito "El cliente vuelve a escribir..." › Vuelve por otro auto; y "Otro auto dentro del plazo..." › Aviso al asesor
  assert.deepEqual(
    esperadoDe(ejes({ tiempo: "10_dias", atencion: "atendida", autos: "cambia_1" })),
    esperado({ autoFinal: "SIM-02", motivoFinal: `Ahora le interesa ${GOL}, antes ${COROLLA}`, subeEnLista: true })
  );
});

test("oráculo: un mensaje a una consulta pendiente no cambia su motivo ni su orden", () => {
  // Requisito "El cliente vuelve a escribir..." › Consulta pendiente
  const e = esperadoDe(ejes({ tiempo: "10_dias", atencion: "pendiente" }));
  assert.equal(e.motivoFinal, null);
  assert.equal(e.subeEnLista, false);
});

test("oráculo: el cliente responde enseguida con el bot en pausa: pendiente con aviso, sube y el bot sigue en pausa sin responder", () => {
  // Requisito "El cliente vuelve a escribir..." › Responde enseguida, con el bot en pausa
  assert.deepEqual(
    esperadoDe(ejes({ atencion: "atendida_responde_enseguida", pausa: "bot_en_pausa" })),
    esperado({ motivoFinal: "Volvió a escribir", subeEnLista: true, botEnPausaFinal: true, claudeEnUltimoTurno: false })
  );
});

test("oráculo: con el bot en pausa no hay llamada a Claude en ese turno, la pausa sigue y la consulta atendida vuelve a pendiente", () => {
  // Requisito "El cliente vuelve a escribir..." (vale también con el bot en pausa, y el bot MUST seguir en pausa); `enPausa` en atender.js
  assert.deepEqual(
    esperadoDe(ejes({ tiempo: "10_dias", atencion: "atendida", pausa: "bot_en_pausa" })),
    esperado({ motivoFinal: "Volvió a escribir", subeEnLista: true, botEnPausaFinal: true, claudeEnUltimoTurno: false })
  );
});

test("oráculo: atendida que vence (31 días) no se toca y se abre una consulta nueva", () => {
  // Requisito "El cliente vuelve a escribir..." › Vuelve pasado el plazo
  assert.deepEqual(
    esperadoDe(ejes({ tiempo: "31_dias", atencion: "atendida" })),
    esperado({ consultas: 2, respuestasConservadas: false, subeEnLista: true, anteriorIntacta: true, noLlegaAClaude: [MARCA_VENCIDA] })
  );
});

test("oráculo: el link de otro asesor sobre la consulta vigente la pasa a ese asesor, atribuida, con 'Llegó por tu link'", () => {
  // Requisito "Consultas que llegan desde la web" › El cliente de otro asesor vuelve por un link
  assert.deepEqual(
    esperadoDe(ejes({ tiempo: "10_dias", asesor: "link_otro" })),
    esperado({ asesorFinal: "pepito", atribuido: true, motivoFinal: "Llegó por tu link", subeEnLista: true })
  );
});

test("oráculo: el link de otro asesor sobre una consulta atendida la deja completa para el asesor nuevo", () => {
  // Requisito "Consultas que llegan desde la web" › El asesor nuevo la recibe completa
  assert.deepEqual(
    esperadoDe(ejes({ tiempo: "1_dia", asesor: "link_otro", atencion: "atendida" })),
    esperado({ asesorFinal: "pepito", atribuido: true, motivoFinal: "Llegó por tu link", subeEnLista: true })
  );
});

test("oráculo: link de otro asesor y otro auto en el mismo mensaje: 'Llegó por tu link. ' + el motivo del auto", () => {
  // Requisito "Consultas que llegan desde la web" › Llega por el link de otro asesor y por otro auto
  assert.deepEqual(
    esperadoDe(ejes({ tiempo: "10_dias", asesor: "link_otro", autos: "cambia_1" })),
    esperado({ asesorFinal: "pepito", atribuido: true, autoFinal: "SIM-02", motivoFinal: `Llegó por tu link. Ahora le interesa ${GOL}, antes ${COROLLA}`, subeEnLista: true })
  );
});

test("oráculo: el link del mismo asesor no escribe nada de más", () => {
  // Requisito "Consultas que llegan desde la web" › El link del mismo asesor
  assert.deepEqual(esperadoDe(ejes({ tiempo: "10_dias", asesor: "link_mismo" })), esperado({ asesorFinal: "juan", atribuido: true }));
});

test("oráculo: un link inválido o de un asesor dado de baja se ignora y la consulta abierta conserva su asesor", () => {
  // Requisito "Consultas que llegan desde la web" › Link inválido
  for (const asesor of ["link_invalido", "asesor_de_baja"]) {
    assert.deepEqual(esperadoDe(ejes({ tiempo: "10_dias", asesor })), esperado({ asesorFinal: "juan", atribuido: true }), asesor);
  }
});

test("oráculo: con la consulta vencida, un link inválido se ignora y la nueva va por turno", () => {
  // Requisito "Consultas que llegan desde la web" (código inexistente: una consulta nueva va por turno)
  assert.deepEqual(
    esperadoDe(ejes({ tiempo: "31_dias", asesor: "link_invalido" })),
    esperado({ consultas: 2, respuestasConservadas: false, subeEnLista: true, noLlegaAClaude: [MARCA_VENCIDA] })
  );
});

test("oráculo: otro auto dentro del plazo sigue en la misma consulta, con el aviso y arriba", () => {
  // Requisito "Otro auto dentro del plazo sigue en la misma consulta" › La IA registra otro auto / Aviso al asesor
  assert.deepEqual(
    esperadoDe(ejes({ tiempo: "10_dias", autos: "cambia_1" })),
    esperado({ autoFinal: "SIM-02", motivoFinal: `Ahora le interesa ${GOL}, antes ${COROLLA}`, subeEnLista: true })
  );
});

test("oráculo: cambiar de auto dos veces sigue siendo una sola consulta, con el aviso del último cambio", () => {
  // Requisito "Otro auto dentro del plazo..." › Una sola consulta vigente
  assert.deepEqual(
    esperadoDe(ejes({ tiempo: "10_dias", autos: "cambia_2" })),
    esperado({ autoFinal: "SIM-03", motivoFinal: `Ahora le interesa ${FIESTA}, antes ${GOL}`, subeEnLista: true })
  );
});

test("oráculo: con trámite o seña vigente sigue en la misma consulta con el auto nuevo y el aviso", () => {
  // Requisito "Otro auto dentro del plazo..." › Consulta con trámite o seña vigente
  assert.deepEqual(
    esperadoDe(ejes({ tiempo: "1_dia", autos: "con_tramite_o_sena" })),
    esperado({ autoFinal: "SIM-02", motivoFinal: `Ahora le interesa ${GOL}, antes ${COROLLA}`, subeEnLista: true })
  );
});

test("oráculo: un auto que ya no está no se carga y no se marca", () => {
  // Requisito "Consultas que llegan desde la web" › Auto que ya no está
  assert.deepEqual(esperadoDe(ejes({ tiempo: "10_dias", autos: "auto_que_ya_no_esta" })), esperado({ autoFinal: "SIM-01" }));
});

test("oráculo: con la consulta vencida, el auto que ya no está deja la consulta nueva sin auto", () => {
  // Requisito "Consultas que llegan desde la web" › Auto que ya no está (+ "Pasado el plazo...": consulta nueva)
  assert.deepEqual(
    esperadoDe(ejes({ tiempo: "31_dias", autos: "auto_que_ya_no_esta" })),
    esperado({ consultas: 2, autoFinal: null, respuestasConservadas: false, subeEnLista: true, noLlegaAClaude: [MARCA_VENCIDA] })
  );
});

test("oráculo: una ref con '#' que pasa la IA se entiende como el auto", () => {
  // Sin requisito propio en las specs de este cambio: viene de "Bot: no disponible por ref #13" (backend 5207723).
  assert.deepEqual(
    esperadoDe(ejes({ tiempo: "10_dias", autos: "ref_con_numeral" })),
    esperado({ autoFinal: "SIM-02", motivoFinal: `Ahora le interesa ${GOL}, antes ${COROLLA}`, subeEnLista: true })
  );
});

test("oráculo: un audio largo recibe el mensaje fijo y no llega a Claude", () => {
  // Spec agente-cupos (audios de hasta 2 minutos) / MENSAJES_FIJOS.audioLargo; ver tarea 10
  assert.deepEqual(esperadoDe(ejes({ medios: "audio_largo" })), esperado({ mensajeFijo: "audioLargo", claudeEnUltimoTurno: false }));
});

test("oráculo: un audio vacío recibe el mensaje fijo de audio ilegible y no llega a Claude", () => {
  // Spec agente-cupos / MENSAJES_FIJOS.audioIlegible; ver tarea 10
  assert.deepEqual(esperadoDe(ejes({ medios: "audio_vacio" })), esperado({ mensajeFijo: "audioIlegible", claudeEnUltimoTurno: false }));
});

test("oráculo: si Groq falla recibe el mensaje fijo de audio ilegible y no llega a Claude", () => {
  // Spec agente-cupos / atender.js (transcribirAudio devuelve "" si Groq falla); ver tarea 10
  assert.deepEqual(esperadoDe(ejes({ medios: "groq_falla" })), esperado({ mensajeFijo: "audioIlegible", claudeEnUltimoTurno: false }));
});

test("oráculo: un audio normal y una foto llegan a Claude como un texto", () => {
  // Tarea 10: la foto solo comprueba que el flujo de hoy no se rompe
  assert.deepEqual(esperadoDe(ejes({ medios: "audio_normal" })), esperado());
  assert.deepEqual(esperadoDe(ejes({ medios: "foto" })), esperado());
});

test("oráculo: un código [AS:...] dicho en un audio no cambia el asesor ni el auto", () => {
  // Tarea 10 › manipulación; requisito "Consultas que llegan desde la web" (el código vale en el texto del mensaje)
  assert.deepEqual(
    esperadoDe(ejes({ medios: "audio_normal", manipulacion: "codigo_en_audio" })),
    esperado({ noLlegaAClaude: [MARCA_OTRO_CLIENTE] })
  );
  assert.deepEqual(
    esperadoDe(ejes({ tiempo: "10_dias", asesor: "link_mismo", medios: "audio_normal", manipulacion: "codigo_en_audio" })),
    esperado({ asesorFinal: "juan", atribuido: true, noLlegaAClaude: [MARCA_OTRO_CLIENTE] })
  );
});

test("oráculo: las instrucciones en texto o en audio no mueven nada y no le dan datos de otro cliente a Claude", () => {
  // Tarea 10 › manipulación (el contexto no trae datos de otro cliente)
  assert.deepEqual(esperadoDe(ejes({ manipulacion: "instrucciones_en_texto" })), esperado({ noLlegaAClaude: [MARCA_OTRO_CLIENTE] }));
  assert.deepEqual(
    esperadoDe(ejes({ medios: "audio_normal", manipulacion: "instrucciones_en_audio" })),
    esperado({ noLlegaAClaude: [MARCA_OTRO_CLIENTE] })
  );
});

test("oráculo: un nombre de perfil con instrucciones llega a la IA marcado como dato", () => {
  // Tarea 10 › manipulación (el nombre de perfil llega marcado como dato)
  assert.deepEqual(
    esperadoDe(ejes({ manipulacion: "nombre_con_instrucciones" })),
    esperado({ nombreComoDato: true, noLlegaAClaude: [MARCA_OTRO_CLIENTE] })
  );
});

test("oráculo: la conducta del cliente (ráfaga, ambiguo, faltas, forma de pago, usado) no cambia la estructura", () => {
  // Tarea 10 › conducta: se prueba que el flujo no se rompe; la spec no fija otra salida
  for (const conducta of ["rafaga", "ambiguo", "faltas_de_ortografia", "cambia_forma_de_pago", "usado_despues"]) {
    assert.deepEqual(esperadoDe(ejes({ conducta })), esperado(), conducta);
  }
});

test("oráculo: mismos ejes, mismo esperado, y no modifica lo que recibe", () => {
  const e = ejes({ tiempo: "10_dias", atencion: "atendida", autos: "cambia_2" });
  const copia = structuredClone(e);
  assert.deepEqual(esperadoDe(e), esperadoDe(copia));
  assert.deepEqual(e, copia);
});
