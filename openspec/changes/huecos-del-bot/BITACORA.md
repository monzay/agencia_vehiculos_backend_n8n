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
  `orden_at`; las altas igual toman el DEFAULT de la base).
