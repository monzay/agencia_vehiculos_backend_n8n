# Revisión del plan con Codex

Codex corre con `codex exec -s read-only -c model_reasoning_effort="medium"`, con el plan y los fragmentos del
código pegados en el pedido (no lee el disco). Claude verifica cada hallazgo contra el código antes de cambiar
el plan.

## Ronda 1 (2026-11-18): con cambios, 11 hallazgos

| # | Sev. | Hallazgo de Codex | Verificación de Claude | Qué se cambió |
|---|---|---|---|---|
| 1 | alta | El nombre dicho primero en el panel cambiaría las consultas viejas, y la propuesta no coincide con la tarea 6 | Lo primero no aplica: `nombre_declarado` es de cada consulta y las viejas lo tienen vacío, así que siguen mostrando la ficha. Lo segundo sí: la propuesta no nombraba la ficha | La propuesta dice el orden completo. `consultas-ficha` suma "La consulta vieja no cambia si después dice otro nombre" y "Cliente viejo que vuelve sin decir su nombre" |
| 2 | alta | Dos turnos simultáneos podrían pedir el nombre dos veces, y no está claro qué es una visita acordada | Lo primero no aplica: `agente-entrada` › "Los mensajes de un mismo número se atienden de a uno". La visita acordada ya está definida como `visita_propuesta`, igual que en `cierre.js` | Escenario "Dos mensajes seguidos" con la razón |
| 3 | alta | No se distinguen las fotos del usado de otras imágenes, y el tope es ambiguo | Aplica | Se guardan todas las que llegan después del pedido (no desde `entrega_usado`) y el asesor descarta las ajenas. El tope cuenta las guardadas. Escenarios de lote que pasa el tope y de fallo en la base después de subir |
| 4 | media | Las URLs vencen a los 15 minutos y no está claro qué pasa si falla una firma | Aplica en parte: la firma usa una delegación cacheada, así que falla todo junto, no foto por foto | Escenario "Venció la URL": se firman de nuevo al volver a abrir, como los papeles |
| 5 | media | Los criterios de la tarea 1 mezclan lector, controles y base, y la ronda 0 no fija commit ni base | Aplica | La tarea 1 separa lector, controles y lo guardado. La ronda 0 fija el commit, rearma la base en cada corrida y anota modelo, razonamiento y fecha |
| 6 | media | "Solo letras" rompe nombres compuestos; no se dice cuándo es una presentación del nombre | Aplica. El contexto ya lee solo `nombre_declarado`, según "El nombre del cliente en el contexto" | El saneo es el mismo de `nombreSeguro` (letras con acentos, espacios, apóstrofo, punto y guion). Escenarios "Nombre compuesto" y "Nombra a otra persona" |
| 7 | media | No existe la función de subida ni se definen pathname, validación y huérfanos | Aplica. La entrada ya valida tipo, tamaño y cantidad (`agente-entrada` › Límites) | La tarea 7 define `subirImagenPrivada`, el pathname sin datos del cliente, el orden "subir y después anotar" y la tolerancia al archivo suelto |
| 8 | media | El filtro de presentación puede borrar saludos legítimos; no está claro qué es "ya escribió" | Aplica | Se quita solo "Soy José, asesor de ventas" (con su emoji o puntuación) y el saludo queda. "Ya escribió" es en la consulta en curso, que incluye el segundo auto dentro del plazo. Escenario "El nombre del asesor en otra frase" |
| 9 | media | Tensión entre "resto" y la entrega mínima; "tengo los 7 millones" podría pisar el anticipo | Lo primero no aplica: las dos reglas responden primero y después preguntan. Lo segundo aclara un caso | "Contesta con plata": el anticipo sigue igual |
| 10 | media | Los criterios apuntan a escenarios que no aparecen | No aplica: los requisitos citados están en los deltas pegados | Nada |
| 11 | baja | Falta fijar modelo, parámetros y fecha de cada ronda | Aplica | Se anotan en cada ronda (tarea 1 y tarea 9) |

## Ronda 2 (2026-11-18): con cambios, 4 hallazgos medios

Codex dio por resueltos los de la ronda 1 y no objetó los descartados.

| # | Sev. | Hallazgo de Codex | Verificación de Claude | Qué se cambió |
|---|---|---|---|---|
| 1 | media | Si al acordar la visita todavía falta otra pregunta, el nombre "al final de lo que falta" podría no pedirse nunca | Aplica: el user pidió el nombre en el mensaje siguiente a la visita | "su nombre" va primero en lo que falta. Escenario "Visita acordada con el recorrido incompleto" |
| 2 | media | Las fotos se capturan sin límite de tiempo después del pedido | Aplica | Ventana de 24 horas desde el pedido. Escenario "Pasaron las 24 horas" |
| 3 | media | La ronda 0 no compara las 2 corridas entre sí | Aplica | Cada corrida se guarda aparte y se escribe qué controles dieron distinto; un control inestable no decide solo |
| 4 | media | No se define qué cuenta como el nombre: responder solo "Claudia" o corregirlo | Aplica | Escenarios "Responde solo el nombre" y "Corrige el nombre". La ficha se actualiza si tenía el nombre que el cliente había dicho antes |

## Ronda 3 (2026-11-18): aprobable, sin hallazgos

`openspec validate ajustes-por-chats-reales --strict` pasa. El archive de prueba en una copia aplica 11 requisitos
nuevos y 9 modificados sin errores, y crea la capacidad `consultas-ficha`. Falta la aprobación del user en
`OBJETIVO.md`.

## Ronda 4 (2026-11-18): agregado del recordatorio, con cambios, 4 hallazgos

El user pidió definir qué preguntas se recuerdan (OBJETIVO › Ajustes). Se agregaron el MODIFIED "Cuándo corresponde el
recordatorio", el ADDED "Qué preguntas se recuerdan", X13 y X14, y la tarea 8.

| # | Sev. | Hallazgo de Codex | Verificación de Claude | Qué se cambió |
|---|---|---|---|---|
| 1 | alta | La tarea no dice dónde se aplica la lista en `recordatorio.js` | Aplica | La tarea 8 dice que `esPreguntaSinContestar` acepta solo temas permitidos y ninguno excluido |
| 2 | alta | No se define cómo se reconoce "qué auto busca" | Aplica | Tema `auto` con las frases, y test con el texto exacto |
| 3 | alta | "¿Qué marca, modelo y año es?" no la reconoce el tema `usado` actual, así que X13 fallaría | Aplica: el patrón de `usado` solo mira "usado" y "parte de pago" | Tema `usado_datos` permitido, y test con el texto de X13 |
| 4 | media | Las dos reglas comparten `id: recordatorio.consultasParaRecordar` | No aplica (ver ronda 5): el comentario `id:` señala el código que la cumple, no identifica la regla para OpenSpec (que usa el título), y en las specs actuales hay muchas reglas con el mismo `id` | Nada |

## Ronda 5 (2026-11-18): aprobable, sin hallazgos

Codex dio por resueltos los 3 hallazgos que aplicaban y no objetó el descartado. `openspec validate --strict`
pasa. Falta la aprobación del user en `OBJETIVO.md`.

## Ronda 6 (2026-11-18): regla "ninguna API real", con cambios, 4 hallazgos

El user pidió que ningún test ni simulación use la API de Claude ni otras APIs de producción (OBJETIVO › Ajustes).
Se cambiaron el encabezado de tasks.md, las tareas 1, 7, 9, 10 y 11, y proposal.md. Las specs no cambiaron.

| # | Sev. | Hallazgo de Codex | Verificación de Claude | Qué se cambió |
|---|---|---|---|---|
| 1 | alta | La medición después del deploy lee producción, y eso choca con la regla | Aplica | Queda fuera del cambio: no es parte del cierre ni un criterio, y solo se hace si el user lo pide |
| 2 | alta | El script actual usa `limitarFetch`, no `red.js`, y no queda garantizado el corte | Aplica: `limitarFetch` deja pasar a Anthropic a propósito (`entorno.test.js`: "deja pasar a Anthropic y frena todo lo demás"). Lo de `hostDe` no aplica: un primer argumento texto no numérico es una ruta de socket local en la API de `net` | `red.js` se instala lo primero, `limitarFetch` deja de permitir hosts externos, y hay un test que bloquea `api.anthropic.com` por `fetch` y por socket |
| 3 | media | El Blob simulado no falla cerrado si la configuración está mal | Aplica | Los tests y el simulador exigen `BLOB_SIMULADO=1` y la ausencia del token. Test de que las fotos quedan solo en la carpeta local |
| 4 | media | `claude-falso` consume un paso por llamada y el guion se puede desfasar | Aplica | Guion por mensaje del cliente: si el turno hace más o menos llamadas que las del guion, falla nombrando el paso |

## Ronda 7 (2026-11-18): con cambios, 2 hallazgos

| # | Sev. | Hallazgo de Codex | Verificación de Claude | Qué se cambió |
|---|---|---|---|---|
| 1 | alta | No se define cómo se instala la barrera en los tests de punta a punta | Aplica | Se precarga en toda la suite con `node --import` (tarea 1), así ningún test puede salir de la máquina |
| 2 | media | La prueba del panel no exige el Blob simulado, y el test solo mira `put` | Aplica | La tarea 9 también exige `BLOB_SIMULADO=1` sin token, y el test cubre `put`, `issueSignedToken` y `presignUrl` |

## Ronda 8 (2026-11-18): aprobable, sin hallazgos

Codex dio por resueltos los 2 hallazgos de la ronda 7. `openspec validate --strict` pasa. Falta la aprobación del
user en `OBJETIVO.md`.
