# Revisión del plan — huecos-del-bot

Codex revisa el plan contra `OBJETIVO.md` y el código; Claude verifica cada hallazgo y corrige el plan.

## Ronda 1 — 2026-11-14

**Intento fallido:** en Windows, con `-s read-only`, Codex no pudo ejecutar ningún comando ("blocked by
policy") y corrió sin razonamiento. Se repitió con los archivos pegados en el pedido y razonamiento medio.

**Veredicto de Codex:** no aprueba (2 altas, 4 medias).

| # | Severidad | Hallazgo | Verificación de Claude | Qué se hizo |
|---|---|---|---|---|
| 1 | Alta | La excepción "consulta con trámite o seña → consulta nueva" contradice el objetivo ("no crear una nueva consulta") | Correcto: el objetivo no tiene excepciones | Se sacó la excepción. Con trámite o seña, sigue en la misma consulta y el asesor recibe el aviso. Escenarios nuevos: "Consulta con trámite o seña vigente" y "Una sola consulta vigente" |
| 2 | Alta | La simulación no garantiza que no toque la base de desarrollo ni que no llame a APIs reales: sacar las claves no alcanza | Correcto | Tarea 11: aborta si alguna de las dos conexiones no es `agencia_simulacion` (con test), dependencias simuladas inyectadas, `fetch` que falla y cuenta, y 0 llamadas de red en el reporte |
| 3 | Media | No se define qué pasa con 30 días justos (el código usa `<`) | Correcto | Regla: "menos de 30 días"; con 30 justos, consulta nueva. Escenario "30 días justos" |
| 4 | Media | Fotos: no se dice que el permiso se valide en cada pedido ni qué pasa al cambiar de asesor | Correcto. Los links firmados vencen a los 15 minutos (`blob-privado.js`) | Requisito: links emitidos en cada pedido después de validar el alcance, pathname solo desde la base, vencen a los 15 minutos. Escenario "La consulta pasó a otro asesor" |
| 5 | Media | Los mensajes se guardan por cliente; con consultas superpuestas el corte por `sesion_inicio` puede mezclar | Cierto solo con consultas superpuestas, y esas las creaba la excepción del #1 | Con el #1 resuelto, la regla nueva no crea consultas superpuestas. Las que quedaron de antes siguen "va a la del último mensaje" (nota en el REMOVED) |
| 6 | Media | La tarea 10 pedía Groq real, contra la decisión de simular | Correcto | La prueba con Groq real pasa a ser opcional y manual, con OK del user. Lo obligatorio es Groq simulado |

## Ronda 2 — 2026-11-14

**Veredicto de Codex:** no aprueba (1 alta, 2 medias). Los 6 hallazgos de la ronda 1 no vuelven a aparecer.

| # | Severidad | Hallazgo | Verificación de Claude | Qué se hizo |
|---|---|---|---|---|
| 1 | Alta | Reemplazar `fetch` no corta otros transportes (`http`, `https`, SDK) | Correcto: `fetch`, `http`, `https` y los SDK salen por `net`/`tls`; Prisma conecta desde su motor nativo, solo a la base verificada | Tarea 11: `net` y `tls` rechazan y cuentan toda conexión que no sea a la base local, con un test por transporte |
| 2 | Media | Con consultas superpuestas de antes, el historial puede traer mensajes de la otra | Las superpuestas de antes eran la misma charla de WhatsApp partida por auto: mandar esos mensajes es correcto. Faltaba decirlo y probarlo | Requisito explícito (desde el inicio de la consulta en curso, sea de una o de otra) y escenario "Consultas superpuestas de antes" |
| 3 | Media | No se define cuánto se guardan las fotos ni cómo se borran | Correcto. Hoy no hay forma de borrar consultas ni clientes (no hay ninguna ruta ni `delete`) | Es una decisión de negocio y legal: queda como pregunta 2 para el user. Fuera de alcance hasta que la responda |

## Ronda 3 — 2026-11-14

**Veredicto de Codex: aprueba** (0 altas, 1 media). Los hallazgos de la ronda 2 no vuelven a aparecer.

| # | Severidad | Hallazgo | Verificación de Claude | Qué se hizo |
|---|---|---|---|---|
| 1 | Media | La simulación no tiene casos de manipulación (inyección por texto o audio) ni chequea que no se filtren datos | Correcto en lo que mide el sistema. Si el modelo obedece no se puede medir con la IA simulada. Los códigos de la web se leen del texto antes de transcribir (`atender.js`), así que un código dicho en un audio no debería cambiar el asesor | Tarea 12: eje "manipulación" y sus chequeos (sin datos de otro cliente en el contexto, un código en un audio no cambia nada, el nombre de perfil llega marcado como dato) |

**Plan listo para la revisión del user.**

## Ajustes del user — 2026-11-14

Respuestas a las dos preguntas del proposal (copiadas en `OBJETIVO.md` › Ajustes):

1. Mismo auto y consulta atendida → **sí** vuelve a pendiente y sube. Regla nueva: "El cliente vuelve a
   escribir en una consulta atendida", y se suma a `consultas-lista`. Tarea 5 nueva.
2. Fotos → **sin cambios**: no se guardan ni se piden. Se sacaron `consultas-fotos` y el cambio a
   `agente-comportamiento` › El usado se ve en la agencia, las tareas de fotos (7, 8 y 9 de antes) y la tabla
   `consulta_fotos` de la migración. Los hallazgos de fotos de las rondas 1 y 2 dejan de aplicar.

Vuelve a Codex (ronda 4).

## Ronda 4 — 2026-11-14

**Veredicto de Codex:** no aprueba (1 alta, 1 media).

| # | Severidad | Hallazgo | Verificación de Claude | Qué se hizo |
|---|---|---|---|---|
| 1 | Alta | Si el asesor respondió desde el panel, el bot queda en pausa y `enPausa` solo guarda el mensaje: la consulta no vuelve a pendiente ni sube, justo el caso "responde enseguida" | Correcto (`atender.js`, `enPausa`) | La regla vale también con el bot en pausa, y el bot sigue en pausa (la charla la tomó el asesor). Escenario "Responde enseguida, con el bot en pausa"; la tarea 5 nombra `enPausa`; la simulación suma el eje "pausa" |
| 2 | Media | La simulación seguía con un caso de fotos sin aclarar qué prueba | Correcto | Se aclaró: la foto entrante solo comprueba que el flujo de hoy no se rompe |

## Ronda 5 — 2026-11-14

**Veredicto de Codex:** no aprueba (1 alta). Los 2 hallazgos de la ronda 4 no vuelven a aparecer.

| # | Severidad | Hallazgo | Verificación de Claude | Qué se hizo |
|---|---|---|---|---|
| 1 | Alta | El freno de la simulación mira solo el nombre de la base: una base remota (incluso la de producción) llamada `agencia_simulacion` lo pasaría, y Prisma conecta por fuera de `net` | Correcto: el corte de red no alcanza al motor nativo de Prisma | Tarea 9: se revisa la URL completa de las dos conexiones (host local, puerto del MySQL local y nombre de la base), con tests contra la URL de desarrollo y contra una URL remota con ese nombre |

## Ronda 6 — 2026-11-14

**Veredicto de Codex:** no aprueba (1 alta). El hallazgo de la ronda 5 no vuelve a aparecer.

| # | Severidad | Hallazgo | Verificación de Claude | Qué se hizo |
|---|---|---|---|---|
| 1 | Alta | La tarea 3 no dice que el historial se filtre por `sesion_inicio` en la consulta a la base: filtrado después del `take` de 20, los mensajes viejos ocupan el lugar de los nuevos | Correcto (`responderConAgente` busca por cliente y paso, con `take`). Claude encontró además que `sesion_inicio` sale del `now()` de la base y los mensajes de la hora de la app: con relojes distintos, o con la hora simulada, el primer mensaje quedaría afuera | Tarea 3: filtro en la consulta antes del `take`, y la consulta nueva se crea con `sesion_inicio = ahora`. Escenario "Muchos mensajes de antes" (con el primer mensaje en el mismo segundo de la apertura) |

## Ronda 7 — 2026-11-14

**Veredicto de Codex:** no aprueba (1 alta). El hallazgo de la ronda 6 no vuelve a aparecer.

| # | Severidad | Hallazgo | Verificación de Claude | Qué se hizo |
|---|---|---|---|---|
| 1 | Alta | La tarea 2 no dice que hay que cambiar `SESION_VIGENTE_MS` (24 horas) en `atender.js` | Correcto en la forma: el criterio lo exigía, pero faltaba el "Qué" | Tarea 2: "Qué" con la constante, cómo elige `sesionDe` la consulta y las otras 24 horas del código (`VIGENTE_MS` desaparece en la tarea 4; la ventana de WhatsApp NO se toca) |

## Ronda 8 — 2026-11-14

Se le pidió a Codex que revise todas las tareas juntas y reporte de una vez todo lo alto o medio que quede.

**Veredicto de Codex:** no aprueba (1 alta, 3 medias). El hallazgo de la ronda 7 no vuelve a aparecer.

| # | Severidad | Hallazgo | Verificación de Claude | Qué se hizo |
|---|---|---|---|---|
| 1 | Alta | Al retomar después de una pausa se perdería contexto: el historial se filtraría por `paso_actual` y los mensajes en pausa se guardan como `agente_ia` | **La causa es incorrecta:** el historial filtra `paso_nodo` en `agente_ia` y `humano` (`atender.js`, `responderConAgente`); los mensajes en pausa se guardan como `agente_ia` y las respuestas del asesor como `humano`, así que ya entran. Sí faltaba proteger eso con el filtro nuevo por `sesion_inicio` | Escenario "Retoma después de una pausa" |
| 2 | Media | A las tareas 6 y 7 les falta el "Qué" | Correcto | Tarea 6: los campos que se escriben en `conAsesorDelLink`. Tarea 7: los listados pasan a `orden_at desc` y cómo nace y se actualiza `orden_at` |
| 3 | Media | No se define el link de otro asesor sobre una consulta vencida | Ya lo cubría "Pasado el plazo" › Vuelve a los 4 meses por un link, pero sin decir lo de la charla | Ese escenario dice ahora "sin respuestas ni la charla anterior" |
| 4 | Media | Una base local llamada `agencia_simulacion` podría ser la de desarrollo, y no se dice cómo se aíslan los casos ni que los chequeos lean lo guardado | Correcto. La base de desarrollo es `localhost/agencia` | Tarea 9: la base se borra y se crea en cada corrida, el runner aborta si el nombre coincide con el de `DATABASE_URL` o `AGENTE_DATABASE_URL`, y cada caso usa su propio cliente. Tarea 10: los chequeos leen la base y lo que recibió el Claude simulado, nunca lo que devuelve un simulado |

## Ronda 9 — 2026-11-14

**Veredicto de Codex: aprueba, sin hallazgos.** Los 4 de la ronda 8 no vuelven a aparecer.

**Plan listo para la aprobación del user** (línea `Aprobado:` en `OBJETIVO.md`).

## Ajuste del user — 2026-11-14 (después de la ronda 9)

"que los test solo sean a nivel local usando la base de datos local" (copiado en `OBJETIVO.md` › Ajustes).

- `proposal.md`: sección nueva "Dónde corren las pruebas: solo en local".
- `tasks.md`: la regla va arriba de todo; todo test con base pasa por `src/lib/base-local.js` (ya existía:
  rechaza cualquier host que no sea local, Aiven incluido); la simulación usa `esBaseLocal`; se sacó de la
  tarea 8 la lectura opcional de la clave de Groq en producción.
- Solo restringe; no agrega comportamiento al sistema.
