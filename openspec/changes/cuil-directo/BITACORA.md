# Bitácora — cuil-directo

## Fase 1. Plan (2026-11-18)

- **Revisión de Codex:** 15 rondas, en `REVISION-PLAN.md`. `openspec validate --strict` pasa.
- **Archive de prueba:** en una copia, `cuil-en-consulta`, `ajustes-por-chats-reales` y `cuil-directo` se
  archivan en ese orden sin errores.
- **Aprobación:** el user respondió "aprobado" el 2026-11-18, sin ajustes.
- **Ramas:** `feat/cuil-directo` en el backend y en el front, cada una desde `feat/ajustes-por-chats-reales`.

## Tarea 0. Orden de los cambios sin archivar

- Verificado en la fase 1: el archive de prueba aplica los tres cambios en orden.
- El archive real se hace al cierre (tarea 7): primero `cuil-en-consulta`, después `ajustes-por-chats-reales` y
  al final este.

## Tareas 1 a 4. Pasar el CUIL es la autorización (2026-11-18)

**Por qué juntas:** las cuatro se escribieron y se implementaron juntas. Cambiar lo que devuelve `estadoCredito`
rompe los tests del orquestador y de las instrucciones, así que una sola implementación deja cada commit en
verde. Por eso van en un solo commit.

### Tests primero (Claude)

**Archivos:**
- `src/credito/verificacion.test.js`: reescrito.
- Tests agregados en `src/agente/temas-preguntados.test.js` (`esAvisoDelCuil`).
- Tests cambiados o agregados en `src/agente/calificacion.test.js`, `src/agente/herramientas.test.js`,
  `src/agente/atender.test.js` y `src/agente/instrucciones.test.js`.

**Antes del código:** 18 + 18 fallaban, lo esperado.

**Revisión de Codex, tarea 1:** 4 hallazgos.
- Se agregaron:
  - el CUIL en el segundo mensaje de un lote;
  - un aviso con el CUIL pero sin el BCRA;
  - un "sí" vigente de la misma versión, que no crea otro registro.
- No aplicó: que se pruebe por separado el "sí" interno de `verificarSituacion`. Ya lo prueban los tests que
  pasan por esa función.

**Revisión de Codex, tareas 2 a 4:** 9 hallazgos.
- Se agregaron:
  - una ráfaga de dos mensajes en el orquestador;
  - "apenas el cliente lo manda" en la descripción de la herramienta;
  - que no quede "el permiso del BCRA va antes que el usado".
- No aplicaron, porque ya están cubiertos:
  - los estados de `pendientes` los decide `estadoCredito`, probado en `verificacion.test.js`;
  - el fallo al leer el estado y "sin pedirse antes del recibo" ya tienen tests en el orquestador;
  - la conducta de la IA se mide en las simulaciones de la tarea 5.

### Código (Sonnet)

**Archivos:**
- `src/agente/temas-preguntados.js`: `esAvisoDelCuil`.
- `src/credito/verificacion.js`:
  - aviso previo;
  - CUIL en el mensaje con su `wamid`;
  - `guardarConsentimiento` interno;
  - `registrarConsentimiento` rechaza un "sí";
  - `estadoCredito` y `permisoAnticipado` con `pedir_cuil`.
- `src/agente/calificacion.js`: el texto del CUIL.
- `src/agente/herramientas.js`: descripciones, sin "sigue" para el "sí", sin `privacidad`.
- `src/agente/atender.js`: `verificar` recibe los entrantes del turno.
- `src/agente/instrucciones.js`: la sección "Verificación crediticia" nueva y el contexto con el link solo
  para si pregunta.

**Errores en los tests congelados que encontró Sonnet** (los corrigió Claude):
- un string con saltos de línea reales en `temas-preguntados.test.js`;
- la base falsa de `atender.test.js` no tenía la columna `cuil` en `COLUMNAS_CLIENTE`.

**Hueco del plan:** `openspec/specs/agente-herramientas/spec.md` › "Guardar el permiso dice qué sigue" apuntaba a
tests que cambiaron. Se agregó el delta `specs/agente-herramientas/spec.md`. Hasta el archive, el test de anclas
marca esas 5 anclas viejas además de las de `importar-lista-por-etapas`, que ya fallaban.

**Suite:** 1962 de 1964, con 1 salteado y 1 que falla: el de anclas, por lo dicho arriba.

### Revisión de Codex del diff

| # | Sev. | Hallazgo | Verificación | Qué se hizo |
|---|---|---|---|---|
| 1 | alta | Se ignora el resultado de guardar el "sí" antes de consultar | Aplica | Si no se registra, no se consulta |
| 2 | media | El aviso no filtra quién escribió el saliente | No aplica: todo saliente es de la agencia (bot, asesor, recordatorio) | Nada |
| 3 | media | El CUIL del mensaje se compara con `includes` sobre todos los dígitos | Aplica | Se compara número contra número, por igualdad |
| 4 | media | Sin `sesion_inicio`, el aviso se buscaría en cualquier consulta | Aplica | Sin `sesion_inicio` no hay aviso |
| 5 | media | Con un "sí" vigente, un CUIL inválido da `cuilInvalido` | No aplica: es lo que pide "Respuestas anteriores al cambio" | Nada |
| 6 | media | Las instrucciones no dicen que un CUIL anticipado se reenvía | No aplica: lo frena la herramienta con su motivo, y las instrucciones dicen "No consultes un CUIL que sacaste de mensajes anteriores" | Nada |

Después de las correcciones (Sonnet), Claude verificó:
- la comparación del CUIL con los formatos reales: "20-12345678-6", "20 12345678 6", "20.123.456.786" y con un
  teléfono en el mismo mensaje. "120123456786" no cuenta.
- Si dos números van pegados solo con un espacio ("4 20123456786"), se leen como uno y el CUIL no se reconoce.
  El bot pide que lo reenvíe: falla para el lado seguro.
- Suite: 1962 de 1964, la misma falla esperada.

## Tarea 6. Link en el pie de la web (2026-11-18, `sea_automotores`)

### Tests primero (Claude)

**Archivos:**
- `lib/constantes.test.js`
- `components/inicio/seccion-pie.test.js`
- `e2e/politica-privacidad.spec.mjs`

**Revisión de Codex:** 4 hallazgos.
- Se aplicaron:
  - el e2e cubre la ficha de un auto, `/privacidad` y `/financiacion`;
  - la base local se valida con `esBaseLocal`.
- Lo de alterar la base: se archivan y restauran solo las versiones vigentes, por sus ids. Se acepta en
  desarrollo.

### Código (Sonnet)

- `lib/constantes.js`: "Política de privacidad" en `ENLACES_PIE` › Ayuda.
- `app/financiacion/page.jsx`: un link chico al final, porque esa página pide el DNI y no tiene el pie.
- `app/privacidad/page.jsx`: solo el comentario.

**Resultado:**
- `npm test`: 32 de 32.
- ESLint sin errores en los archivos tocados.
- El e2e quedó pendiente: el backend de :4000 no respondía.
