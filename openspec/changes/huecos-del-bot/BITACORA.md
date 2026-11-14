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
