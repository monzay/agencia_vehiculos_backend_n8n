# Bitácora — huecos-del-bot

Qué se hizo en cada tarea de la fase 2 y por qué. Rama `feat/huecos-del-bot` (desde `main` ca967e4).

## Tarea 0 — Archivar los cambios ya publicados (2026-11-14)

- **Qué:** `openspec archive` de `consultas-intervencion`, `reparto-por-turnos`, `bot-datos-del-auto` y
  `codigo-auto-agente`, en el orden en que se publicaron (03/11, 10/11 y 11/11 los dos últimos).
- **Por qué:** este cambio modifica reglas de `agente-conversacion` que solo existían en esos cambios sin
  archivar; sin esto, `huecos-del-bot` no se puede archivar.
- **Verificación:**
  - los cuatro están en `main`: sus commits (9dbf8f0, bbae742, d322e79, 5207723) son ancestros de `main`;
  - ningún requisito lo modifican dos cambios a la vez, así que el orden no pierde texto;
  - los cuatro archivos terminaron sin errores: +21 requisitos agregados y 9 modificados en `openspec/specs/`
    (`agente-*` y la capacidad nueva `consultas-intervencion`);
  - `openspec validate huecos-del-bot --strict` pasa después del archivado.
- **Sin código.** Commit propio.
- **Línea base de tests** (antes de la tarea 1): 1246 tests, falla 1 solo, ajeno a este cambio: "cada ancla
  de los specs apunta a un test que existe", por las anclas del cambio sin implementar
  `importar-lista-por-etapas`.

## Tarea 1 — Migración 084 (2026-11-14)

- **Qué:** `prisma/migrations_manual/084_sesiones_orden_at.sql` agrega `sesiones.orden_at` (DATETIME NOT NULL
  DEFAULT CURRENT_TIMESTAMP, índice `idx_orden_at`), y `schema.prisma` suma `orden_at` e `@@index` en
  `chat_estado`. Relleno: `sesion_inicio`; las filas con `sesion_inicio` NULL, `1000-01-01 00:00:00` (el mínimo
  de DATETIME), para que sigan al final como con el `ORDER BY sesion_inicio DESC` de hoy. Sin GRANT.
- **Por qué así:** se aplica a mano y tiene que poder correrse dos veces; MySQL no tiene `ADD COLUMN IF NOT
  EXISTS`, así que la columna y el índice se crean con un conteo en `information_schema` + `IF(..., 'DO 0')` +
  `PREPARE`/`EXECUTE`.
- **Tests (`scripts/migracion-084.test.js`, 15):** escritos con Sonnet antes que la migración; Codex los revisó en
  3 rondas (rondas 1-2: el relleno de los NULL no estaba definido, la idempotencia no ataba la condición, faltaba
  correrla de verdad, la base temporal con nombre fijo podía borrar una existente). Uno aplica la migración dos
  veces sobre una copia de `sesiones` en una base temporal del MySQL local, con nombre único, y la borra.
- **Correcciones al test después de congelarlo** (defectos del propio test, no de la migración): (a) normaliza el
  `\r\n` de `mysql.exe` en Windows; (b) después del `CREATE TABLE ... LIKE`, borra el índice y la columna de la
  COPIA si la base de desarrollo ya estaba migrada, para simular siempre el estado de antes (lo encontró Claude:
  con la base `agencia` ya migrada, las filas quedaban con la hora actual). Codex las revisó junto con el diff.
- **Verificación (local):** 15/15; suite completa 1261 tests, falla solo el previo de las anclas; `prisma
  validate` OK; aplicada dos veces en la base local `agencia` sin error (28 filas, todas con `orden_at =
  sesion_inicio`, ninguna NULL). Revisión del diff por Codex: aprobado, sin hallazgos. El backend no tiene lint
  ni build.
- **Pendiente:** `prisma generate` falló con EPERM porque el backend de desarrollo (puerto 4000) tiene tomado el
  motor. Hay que correrlo con el backend parado antes de la tarea 2 (hasta entonces el cliente no conoce
  `orden_at`; las altas igual toman el DEFAULT de la base). **Resuelto antes de la tarea 2:** se paró el backend
  de desarrollo, `prisma generate` corrió bien (el cliente ya conoce `orden_at`) y se volvió a levantar con el
  mismo comando (`cmd /c npm run dev > backend_dev.log 2> backend_dev.err` en `web/backend`; `/health` 200).

## Tarea 2 — La consulta dura 30 días (2026-11-14)

- **Qué:** en `atender.js`, `SESION_VIGENTE_MS` pasa de 24 h a 30 días (se mantiene el `<`: con 30 días justos,
  consulta nueva) y su comentario. No se tocaron la ventana de 24 h de WhatsApp (`VENTANA_ATENCION_MS`, regla de
  Meta), `VIGENTE_MS` de `consultas-por-auto.js` (tarea 4) ni `VENTANA_INTENTOS_MS`.
- **Tests (`atender.test.js`), escritos antes con Sonnet:**
  - nuevo "una consulta con el último mensaje de hace 31 días no se reutiliza; una de hace 29 días, sí"
    (reemplaza al de 25 y 23 horas; comprueba que la de 29 días es la misma id);
  - nuevo "con el último mensaje de hace exactamente 30 días se abre una consulta nueva" (frontera: pasaba
    también con 24 h, detecta un `<=`);
  - nuevo "quien vuelve a los 10 días sigue en la misma consulta, con su asesor, y la IA recibe lo ya respondido";
  - renombrado "la sesión nueva nace con ultimo_mensaje (así vence a los 30 días)";
  - adaptado "una consulta vencida no sigue con su asesor: la nueva va por turno" (de 30 horas a 31 días).
- **Verificador de anclas (`src/openspec-anclas.test.js`):** ya no revisa `openspec/changes/archive/**`
  (historial) ni, en `openspec/specs/`, los requisitos que un cambio activo REMUEVE o MODIFICA (las anclas del
  cambio activo sí). Sin esto, reemplazar los tests de la regla de 24 h lo hacía fallar hasta el archivado final.
  Cinco tests nuevos con specs de ejemplo.
- **Revisión de los tests por Codex:** sin altas. Se aplicaron 2 bajas (la de 29 días es la misma id; ancla
  rota antes del bloque omitido). No se aplicaron: la consulta nueva de 31 días sin respuestas y por turno (es
  la tarea 3, con sus tests); nombres de requisito duplicados (OpenSpec no los permite).
- **Verificación (local):** tests congelados intactos (hash); `atender.test.js` 84/84; suite 1269 tests, falla
  solo el previo de las anclas. Claude corrigió una concordancia en el comentario ("en los últimos 30 días").
  Revisión del diff por Codex: aprobado, sin hallazgos.

## Tarea 3 — Pasado el plazo se pregunta todo de nuevo; la IA ve solo la charla de la consulta (2026-11-14)

- **Qué (`atender.js`):**
  - `responderConAgente`: el historial filtra `created_at >= sesion_inicio` en la misma consulta a la base que
    el `take` de 20 (no se trae y se filtra después);
  - si la consulta no tiene `sesion_inicio` (consultas de antes del campo), no se manda historial previo:
    Claude recibe solo el mensaje del turno;
  - `sesionDe`: la consulta nueva se crea con `sesion_inicio: ahora`, la misma hora que sus mensajes (las dos
    columnas son DATETIME(0) y redondean igual, así que el primer mensaje entra con el `>=`).
- **Por qué no hubo que tocar "pasado el plazo":** desde la tarea 2, `sesionDe` ya abre la consulta vencida
  vacía y por turno (o con el asesor del link). Lo que faltaba era que la IA no viera la charla vieja.
- **Tests (`atender.test.js`, 9 nuevos):** 31 días sin link, 4 meses con link, "pago contado" vencido, 10 días
  dentro del plazo, retomar después de una pausa, 50 mensajes viejos y 3 nuevos (con 25 desfasados de id mayor,
  para que falle si se filtra después del take, y comprobando los argumentos de `findMany`), consultas
  superpuestas de antes, `sesion_inicio = ahora`, y consulta sin `sesion_inicio`. El doble `baseFalsa` ahora
  filtra como Prisma (cliente, paso, `created_at.gte`, orden por id, después el take) y numera los mensajes que
  guarda; el test existente de ráfagas recibió `id` y `created_at` en su fila sin cambiar lo que comprueba.
- **Revisión de Codex:** tests en 2 rondas (ronda 1: el de 50 mensajes pasaba con take-y-filtrar-después; el
  doble ordenaba filas sin id). Diff en 2 rondas: ronda 1 marcó el caso `sesion_inicio` NULL (alta, resuelto con
  el test nuevo y sin historial previo) y mensajes de una consulta vencida en el mismo segundo del inicio (no
  aplica: la consulta nueva solo se abre con 30 días o más sin mensajes). Ronda 2: aprobado, sin hallazgos.
- **Verificación (local):** tests congelados intactos (hash); `atender.test.js` 93/93; suite 1278, falla solo el
  previo de las anclas.

## Tarea 4 — Otro auto dentro del plazo sigue en la misma consulta (2026-11-14)

- **Qué:**
  - `consultas-por-auto.js`: `consultaPorAuto` (abría o retomaba OTRA consulta por cada auto) se reemplaza por
    `cambiarAuto({ db, sesionId, ahora }, autoId)`, que corre con el usuario del backend y devuelve siempre la
    misma consulta. Mismo auto: nada. Sin auto previo: auto y temperatura. Otro auto: un solo update con el auto,
    la temperatura, el aviso "Ahora le interesa <nuevo>, antes <anterior>" (recortado a 120), pendiente
    (`atendido_at`/`atendido_por` en null) y `orden_at = ahora`. No toca respuestas, usado, visita, asesor,
    trámites ni señas.
  - `herramientas.js` (`registrar_calificacion`) y `atender.js` (`conAutoDeLaWeb`, el `ctx` del turno) usan
    `cambiarAuto`.
  - `descripcionDelAuto` pasó de `atender.js` a `auto-publico.js` (exportada) para evitar un import circular.
- **Tests:** `consultas-por-auto.test.js` reescrito (11 tests de `cambiarAuto`); en `herramientas`, `atender` y
  `agente` se reemplazaron los de la regla vieja.
- **Tests viejos borrados y su reemplazo:**
  - `consultas-por-auto.test.js`: "otro auto sin consulta: abre una nueva..." → "otro auto: sigue en la misma
    consulta y un solo update trae el auto nuevo, la temperatura, el aviso y el orden" + "no toca las respuestas,
    el usado, la visita ni el asesor"; "otro auto con consulta abierta: la retoma y le completa..." → "dos
    cambios seguidos siguen siendo una sola consulta"; "una consulta de ese auto de hace más de 24 h no se
    retoma" → sin reemplazo (el plazo ya no se decide en ese módulo: tarea 2); los 3 de "la nueva va por
    turno" / "heredar no gasta turno" → sin reemplazo (no se abre consulta nueva y el asesor no se toca); los 2 de
    link → "desde la web por otro auto con el link de Pepito: sigue la misma consulta, con el auto nuevo, y queda
    de Pepito" (atender); "sin link no se toca el asesor de la que se retoma" → "no toca las respuestas, el usado,
    la visita ni el asesor".
  - `herramientas.test.js`: "registrar_calificacion con otro auto registra en la consulta de ese auto y no toca
    la anterior" → "registrar_calificacion con otro auto cambia el auto de la misma consulta y registra las
    respuestas en ella".
  - `atender.test.js`: "desde la web por otro auto con la consulta abierta: abre otra consulta para ese auto" →
    "desde la web por otro auto dentro del plazo: sigue en la misma consulta, con el auto nuevo y el aviso"; "el
    turno se cierra en la consulta del auto que quedó activo" → "el turno se cierra en la misma consulta cuando la
    IA registra otro auto"; "...con el link de Pepito: la consulta nueva es de Pepito y la anterior no se toca" →
    "...sigue la misma consulta, con el auto nuevo, y queda de Pepito"; "desde la web por otro auto sin link: la
    consulta nueva sigue con el asesor de la anterior" → sin reemplazo propio (misma consulta, el asesor no
    cambia). Nuevo: "la IA registra otro auto en una consulta atendida: vuelve a pendiente y sube".
  - `agente.test.js`: adaptado a `cambiarAuto` (las escrituras siguientes del turno siguen en la misma consulta).
- **Revisión de Codex:** tests en 2 rondas (ronda 1: un puntaje esperado mal sumado, 10 en vez de 11, que habría
  rechazado un código correcto; el doble de trámite/seña sin registros vigentes). Diff: aprobado con 1 media
  que no se aplicó: si en un turno la IA registra otro auto, el contexto inicial de ese turno nombra el auto
  anterior. Ya pasaba con la regla vieja (no es regresión) y el auto nuevo lo eligió la propia IA; queda como
  observación.
- **Verificación (local):** tests congelados intactos (hash); los 4 archivos 198/198; suite 1280, falla solo el
  previo de las anclas.

## Tarea 5 — El cliente vuelve a escribir en una consulta atendida (2026-11-14)

- **Qué (`atender.js`):** `vuelveAEscribir(root, sesion, ahora)`, aplicada apenas `sesionDe` devuelve la consulta y
  antes de la baja de recordatorios, la despedida 👍, la pausa, los cupos, los audios y el agente. Si la consulta
  tiene `atendido_at`: un update con `atendido_at`/`atendido_por` null, `requiere_vendedor` true, motivo "Volvió a
  escribir", `requiere_vendedor_at` y `orden_at` = ahora. Devuelve la sesión con esos valores, para que
  `cierreDeSesion` (camino del cupo) no pise el motivo. Con el bot en pausa sigue sin responder. Si en el mismo
  turno la IA registra otro auto, `cambiarAuto` corre después y deja su motivo.
- **Tests (`atender.test.js`, 10 nuevos):** los 5 escenarios de la spec (10 días, responde enseguida con el bot en
  pausa, pendiente no se toca, vuelve por otro auto desde la web y por la IA, 31 días) y uno por cada camino que
  corta el turno (baja, cupo, despedida 👍, audio), con el estado final de la consulta. Helper
  `conUpdatesQueGuardan` (aplica los updates a la consulta simulada y falla si el id no existe).
- **Test de la tarea 4 cambiado después de congelarlo:** "la IA registra otro auto en una consulta atendida: vuelve
  a pendiente y sube" buscaba el PRIMER update con motivo; con esta tarea el primero es "Volvió a escribir" y el
  del auto lo pisa después. Ahora comprueba el estado final (pendiente, arriba, motivo del auto). Lo encontró el
  implementador; Codex lo revisó en el diff.
- **Revisión de Codex:** tests en 2 rondas (ronda 1: faltaban los caminos que cortan el turno; un test exigía un
  único update con exactamente 6 claves). Diff: aprobado con 1 media no aplicada: dos entregas simultáneas del
  mismo mensaje con el panel marcando atendida en el medio podrían reabrirla dos veces. El backend corre en un solo
  proceso y serializa por teléfono (`deAUno`), y el peor caso es un aviso de más; queda como observación.
- **Verificación (local):** tests congelados intactos (salvo el cambio de arriba); `atender.test.js` 103/103; suite
  1290, falla solo el previo de las anclas.

## Tarea 6 — El link de otro asesor deja la consulta completa, pendiente y arriba (2026-11-14)

- **Decisión de Claude (escenario agregado a la spec, a confirmar por el user):** si en el mismo mensaje el link
  le cambia el asesor Y la consulta cambia de auto, el motivo es "Llegó por tu link. Ahora le interesa <nuevo>,
  antes <anterior>" (recortado a 120). El aviso sale solo cuando el link CAMBIA el asesor (incluido de ninguno a
  uno); con el mismo asesor no se escribe nada (si solo faltaba `atribuido`, solo eso).
- **Qué (`atender.js`):** `conAsesorDelLink(root, sesion, link, ahora, cambioDeAuto)` suma al cambio de asesor
  `requiere_vendedor` true, el motivo, `requiere_vendedor_at` y `orden_at` = ahora, `atendido_at`/`atendido_por`
  null, en el mismo update. `conAutoDeLaWeb` devuelve `{ sesion, cambioDeAuto }`. `vuelveAEscribir`, que corre
  después, ya no actúa porque la consulta quedó pendiente.
- **Bug encontrado por Claude después de que los tests pasaran:** la primera implementación detectaba "el auto
  cambió en este turno" comparando `requiere_vendedor_at` con `ahora` al milisegundo. En la base real (DATETIME(0),
  redondea al segundo, y `conAutoDeLaWeb` relee la consulta) eso casi nunca coincide y el motivo combinado no
  salía. La base simulada guardaba fechas exactas y no lo mostraba. Se agregó el test "el motivo de link y auto
  juntos sale aunque la base guarde las fechas al segundo y la hora del turno traiga milisegundos" (helper
  `conFechasAlSegundo`) y el dato ahora viaja explícito (`cambioDeAuto`).
- **Tests (`atender.test.js`):** el asesor nuevo la recibe completa (con la charla intacta), link + auto, recorte a
  120, consulta sin asignar, consulta nueva con link (sin aviso), mismo asesor sin `atribuido`, link inválido a una
  consulta atendida (queda "Volvió a escribir"), link a una consulta pendiente con otro motivo (lo reemplaza),
  fechas al segundo; se reforzó sin renombrar "el link del mismo asesor que ya tiene la consulta no escribe nada de
  más".
- **Revisión de Codex:** tests en 2 rondas (ronda 1: faltaban link inválido a una atendida, link a una pendiente con
  otro motivo, y comprobar la charla). Diff (con el arreglo de las fechas): aprobado, sin hallazgos; no encontró
  otras comparaciones al milisegundo en lo cambiado por las tareas 2 a 6.
- **Verificación (local):** tests congelados intactos (hash, después del test de las fechas); `atender.test.js`
  112/112; suite 1299, falla solo el previo de las anclas.

## Tarea 7 — Orden de la lista de Consultas (2026-11-14)

- **Qué:** en `consultas.service.js`, la lista principal de Consultas y la de ventas/consignaciones pasan de
  `sesion_inicio desc` a `orden_at desc, id desc`; el `sesion_inicio asc` de las consultas hermanas del detalle
  (ventana de mensajes) no cambia. En `sesionDe`, la consulta nueva nace con `orden_at = ahora`. `orden_at` lo
  suben `cambiarAuto` (tarea 4), `vuelveAEscribir` (tarea 5) y `conAsesorDelLink` (tarea 6); las consultas viejas
  lo traen de la migración 084. El front no reordena: usa el orden del backend.
- **Tests (`consultas.service.test.js`):** el `orderBy` de las dos listas, la guarda de las hermanas, "sube por
  otro auto", "sube porque el cliente volvió a escribir", desempate por id y la salida de ventas, con un doble
  que ordena según el `orderBy` (y falla si una fila trae `orden_at` vacío: la columna es NOT NULL).
  `atender.test.js`: la consulta nueva nace con `orden_at = ahora`. El escenario "Consultas que ya existían"
  apunta al test de la migración que la aplica dos veces.
- **Revisión de Codex:** tests en 2 rondas (ronda 1: el doble no definía qué hacer con `orden_at` vacío, faltaban
  el desempate y la salida de ventas). Diff: ronda 1 marcó como alta que las novedades no subían `orden_at`,
  porque solo vio el diff de esta tarea (falsa alarma: lo hacen las tareas 4 a 6; se le mostró el `grep`).
  Ronda 2: aprobado, sin hallazgos.
- **Observación para el user:** la consulta que sube sigue mostrando su fecha de inicio (`hora` en el mapper); el
  aviso sí trae la fecha de la novedad. No está en el plan.
- **Verificación (local):** tests congelados intactos (hash); suite 1307, falla solo el previo de las anclas.
