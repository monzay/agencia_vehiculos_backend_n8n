# Revisión del plan con Codex

Codex corre con `codex exec -s read-only -c model_reasoning_effort="medium"` (codex-cli 0.167.0), con el plan
y los fragmentos del código pegados en el pedido (no lee el disco). Claude verifica cada hallazgo contra el
código antes de cambiar el plan.

## Ronda 1 (2026-11-18): con cambios, 8 hallazgos

| # | Sev. | Hallazgo de Codex | Verificación de Claude | Qué se cambió |
|---|---|---|---|---|
| 1 | alta | Un CUIL mandado antes del aviso de para qué es contaría como autorización sin que el cliente supiera la finalidad | Aplica. Hoy `verificarSituacion` exige un "sí" previo; con el plan, un CUIL espontáneo se consultaría | Regla de aviso previo: cuenta solo si en la consulta ya hay un mensaje del bot que nombra la Central de Deudores o el BCRA (misma regla que `temas-preguntados.js`), o un "sí" vigente. Si no, explica y pregunta si está de acuerdo. Escenario "CUIL antes del aviso", decisión 4 y chat P13 |
| 2 | alta | El "no" no define qué respuestas cuentan ni qué pasa si es ambiguo; el esquema dice "o no quedó claro" | Aplica. El `wamid` del "no" ya sale del turno (`atender.js` lo pasa a `registrarConsentimiento`) | "No" solo si lo dice claramente; si esquiva, no se guarda nada. Escenario "Esquiva la pregunta"; la descripción de `acepta` deja de decir "o no quedó claro" |
| 3 | alta | No hay condición que impida subir con una política que contradiga el flujo o no informe lo necesario | Aplica en parte: no se puede validar por código, pero sí como paso del deploy | Condición para subir en la tarea 7 y en la propuesta: la política dice finalidad, quién lo ve y derechos, sin "se pide por WhatsApp"; si no, versión nueva antes del deploy |
| 4 | media | Contradicción con el CUIL inválido o ajeno (no se guarda vs. pedirlo de nuevo u ofrecer vendedor) y un "sí" viejo con un CUIL inválido | Aplica en parte: no es contradicción (la conducta del bot está en las instrucciones), pero faltaba escrita | El escenario dice qué hace la asesora. "Respuestas anteriores al cambio": el "sí" viejo sigue valiendo con un CUIL inválido |
| 5 | media | El CUIL anticipado en lo que falta podría pedirse antes del recibo | Aplica en parte: hoy el texto anticipado dice "(apenas responda lo del recibo o garante)" y el recibo va antes en la lista | La tarea 2 conserva ese texto y ese orden |
| 6 | media | Sin política publicada, no se cubre que el contexto y la herramienta no pidan ni consulten | Aplica en parte: `estadoCredito` y `verificarSituacion` ya cortan sin términos; faltaba escribirlo | El escenario dice que no hay pedido en el contexto, que el CUIL no está en lo que falta y que no se consulta |
| 7 | media | Un CUIL después de un "no" puede no consultarse, porque el contexto del turno no pide el CUIL | Aplica | "Cambia de idea": la asesora lo consulta aunque el contexto no lo pida |
| 8 | media | No se define qué `wamid` se usa si la IA consulta en un turno posterior | Aplica | Se usa el del turno que se responde, y un "sí" ya guardado no se reemplaza. Dos tests asignados en la tarea 3 |

## Ronda 2 (2026-11-18): con cambios, 5 hallazgos

Codex no volvió a objetar los 8 de la ronda 1.

| # | Sev. | Hallazgo de Codex | Verificación de Claude | Qué se cambió |
|---|---|---|---|---|
| 1 | alta | No se define el alcance del aviso ni cómo `verificarSituacion` lee el historial | Aplica en parte: "en la consulta en curso" ya incluía turnos anteriores, pero faltaba cómo se averigua | El aviso es cualquier mensaje del bot en la consulta, de cualquier turno. La tarea 1 dice que `verificarSituacion` busca en `historial_mensajes` desde `sesion_inicio`, con la regla exportada de `temas-preguntados.js` |
| 2 | alta | Un CUIL junto con lo del recibo, antes del aviso: no queda claro el orden | Aplica | La IA no se lo vuelve a pedir: explica para qué es y pregunta si está de acuerdo; con el "sí", vuelve a usar `verificar_situacion_crediticia` con ese CUIL. Si llega antes del recibo, sigue el recorrido y lo retoma cuando toca. `registrar_consentimiento` queda solo para el "no" |
| 3 | media | No está claro cuándo se crea el "sí" ni qué `wamid` lo prueba en cada caso | Aplica | Lista en el requisito: después del aviso, antes del aviso, después de un "no", "dale" sin CUIL y "sí" viejo |
| 4 | media | Un "sí" viejo con un CUIL que llega sin el aviso nuevo | Aplica | Con un "sí" viejo vigente, el CUIL se consulta apenas llega |
| 5 | media | La tarea 6 contradice una regla que prohibiría tests, y no hay criterio para /privacidad sin política | Lo primero no aplica: no existe esa regla en este proyecto. Lo segundo sí | Criterio concreto: módulo `.js` de los links del pie con su test, y un caso de Playwright sin términos con el texto exacto de la página |

## Ronda 3 (2026-11-18): con cambios, 2 hallazgos

| # | Sev. | Hallazgo de Codex | Verificación de Claude | Qué se cambió |
|---|---|---|---|---|
| 1 | alta | El aviso corto informa la finalidad, pero no quién ve el dato ni los derechos del titular | No es un hueco del plan: es la decisión del dueño (sacar el texto largo y el link). El mensaje sí dice quién lo ve (el asesor) y para qué; los derechos quedan en la política, enlazada en la web, y se pasan si el cliente pregunta | La nota legal de la propuesta lo deja escrito como riesgo para el dueño y el abogado. La condición de deploy sobre el texto de la política sigue |
| 2 | alta | No se define qué pasa con un CUIL que llega después de un "no" pero antes del aviso | Aplica: un "no" de una consulta anterior no deja aviso en la consulta nueva | El aviso en la consulta en curso o un "sí" vigente es condición siempre: ese caso se trata como "CUIL antes del aviso". Escenario nuevo |

## Ronda 4 (2026-11-18): con cambios, 2 hallazgos

Codex no volvió a reportar el riesgo legal de la ronda 3, que es decisión del dueño.

| # | Sev. | Hallazgo de Codex | Verificación de Claude | Qué se cambió |
|---|---|---|---|---|
| 1 | alta | `temasPreguntados()` mira solo las preguntas, y en el ejemplo del dueño la Central de Deudores está en la oración afirmativa: el aviso no se reconocería | Aplica: `temasPreguntados` corta el texto en preguntas (`/¿?[^.!?¿]*\?/g`) | La tarea 1 usa la expresión del tema "permiso" contra el mensaje completo, con un test de la frase exacta y otro de varias oraciones |
| 2 | media | Un CUIL que llega antes de lo del recibo no se guarda: no se dice cómo se recupera después | Aplica. Además, el plan decía "queda en `cuil_informado`, como hoy", y no es así: hoy se guarda solo después del "sí" | Sin autorización no se guarda nada, tampoco `cuil_informado` (migración 076). La IA lo toma de la charla (ve 20 mensajes); si ya no lo ve, lo pide normal. Escenario "CUIL antes de que corresponda" y chat P14 |

## Ronda 5 (2026-11-18): con cambios, 2 hallazgos

| # | Sev. | Hallazgo de Codex | Verificación de Claude | Qué se cambió |
|---|---|---|---|---|
| 1 | alta | El "sí" no queda atado al aviso ni al mensaje del cliente: la IA podría consultar un CUIL viejo de la charla después de cualquier mención del BCRA | Aplica. Con el plan de la ronda 4, un CUIL mandado antes del aviso se podía consultar en un turno posterior sin que el cliente dijera que sí | El aviso nombra el CUIL y la Central de Deudores o el BCRA, en un turno anterior. El CUIL autoriza solo si viene en el mensaje que se responde. Si viene de la charla, hace falta un "sí" vigente, que la IA guarda con `registrar_consentimiento` (`true` solo con aviso previo). Escenario "CUIL viejo sin un sí en el mensaje" |
| 2 | media | No se reconcilia el guardado de `cuil_informado` con un CUIL inválido o ajeno antes y después de la autorización | Aplica | La tarea 1 fija el orden: autorización, después `cuilDelCliente`, después el "sí" y la consulta. Sin autorización no se guarda nada. Después del aviso, un CUIL ajeno guarda el "sí" y el CUIL informado (como hoy) y no consulta |

## Ronda 6 (2026-11-18): con cambios, 2 hallazgos

| # | Sev. | Hallazgo de Codex | Verificación de Claude | Qué se cambió |
|---|---|---|---|---|
| 1 | alta | Para un CUIL válido de otra persona, la tarea 1 y la spec dirían cosas distintas sobre si se guarda el "sí" | No es una contradicción: el paso 5 decía "aunque no sea suyo". Pero el orden (`cuilDelCliente` comprueba de quién es y corta antes) se prestaba a confusión | Pasos reordenados: formato, después el "sí", después de quién es y `cuil_informado`, después la consulta. `cuilDelCliente` se parte en dos |
| 2 | media | La expresión del tema "permiso" acepta "situación crediticia" o "autoriz" sin nombrar el CUIL | Aplica | `esAvisoDelCuil(texto)` exige el CUIL **y** la Central de Deudores o el BCRA, con tests para los mensajes que nombran una sola de las dos cosas |

## Ronda 7 (2026-11-18): con cambios, 4 hallazgos de claridad

| # | Sev. | Hallazgo de Codex | Verificación de Claude | Qué se cambió |
|---|---|---|---|---|
| 1 | alta | No queda explícito que `verificarSituacion` deja de exigir un "sí" previo ni que el CUIL después de un "no" crea el "sí" antes de consultar | Aplica en parte: los pasos 2 y 5 ya lo decían, pero sin nombrar el chequeo que se reemplaza | El paso 2 nombra el chequeo de hoy que se reemplaza y dice que un "no" anterior no impide el "sí" nuevo |
| 2 | media | En "CUIL antes del aviso" no se define qué mensaje es el aviso para que el `true` de la herramienta valga | No aplica en el fondo: la explicación nombra el CUIL y la Central de Deudores, así que es un aviso de un turno anterior al "sí". Faltaba decirlo | Dicho en la spec y en la tarea 3, con tests de un `true` con explicación y uno sin aviso |
| 3 | media | El CUIL tomado de la charla podría no validarse | No aplica en el fondo: `verificarSituacion` valida siempre (pasos 4 y 6). Faltaba decirlo | La spec dice que pasa por las mismas validaciones y qué hace la asesora si no es válido o no es suyo |
| 4 | media | La spec acepta un `true` después de la explicación, pero la tarea 3 lo restringe a un aviso previo | Es el mismo punto que el 2 | Igual que el 2 |

## Ronda 8 (2026-11-18): con cambios, 1 hallazgo de redacción

| # | Sev. | Hallazgo de Codex | Verificación de Claude | Qué se cambió |
|---|---|---|---|---|
| 1 | media | "Un saliente del cliente" se puede leer como un mensaje del cliente | Aplica: es un mensaje saliente de la agencia en el historial del cliente | La tarea 1 dice `cliente_id` + `direccion = 'saliente'` (del bot, o del asesor si intervino), después de `sesion_inicio` y antes del turno que se responde |

## Ronda 9 (2026-11-18): con cambios, 2 hallazgos de coherencia

| # | Sev. | Hallazgo de Codex | Verificación de Claude | Qué se cambió |
|---|---|---|---|---|
| 1 | alta | La tarea 1 decía que `registrarConsentimiento` "queda igual", pero la tarea 3 exige que no guarde un `true` sin aviso | Aplica: hoy guarda cualquier `true` | La comprobación del aviso va en `registrarConsentimiento` (dominio), con tests de `true` con aviso, `true` sin aviso y `false` |
| 2 | media | La spec decía que el aviso es "del bot", y la tarea sumaba el del asesor | Aplica | La spec dice "de la agencia (del bot, o del asesor si intervino)", igual que la tarea |

## Ronda 10 (2026-11-18): con cambios, 2 hallazgos de precisión

| # | Sev. | Hallazgo de Codex | Verificación de Claude | Qué se cambió |
|---|---|---|---|---|
| 1 | alta | No se define qué es un "sí" vigente heredado frente a un "no" posterior o a términos nuevos, ni a qué registro se ata la consulta | Aplica en parte: hoy "vigente" es el último registro (`ultimoConsentimiento`) y la consulta se ata a ese `consentimiento_id`; faltaba escribirlo | La spec define el "sí" vigente (último registro, de cualquier versión, como hoy) y que la consulta se ata al último "sí". Los tests de "no posterior" y "términos nuevos" ya existen |
| 2 | media | Con un "sí" vigente y un CUIL nuevo en el mensaje, no queda claro si se crea otro "sí" ni qué `wamid` queda | Aplica: el orden de la tarea 1 hacía que el "sí" vigente ganara y no se registrara la versión nueva | Orden fijo: el CUIL del mensaje después del aviso pasa siempre por `registrarConsentimiento(true)` (sin duplicar la misma versión, con registro nuevo si cambió la versión o había un "no"); si no, sirve el "sí" vigente |

## Ronda 11 (2026-11-18): con cambios, 3 hallazgos

| # | Sev. | Hallazgo de Codex | Verificación de Claude | Qué se cambió |
|---|---|---|---|---|
| 1 | alta | Un CUIL después de un "no" en la misma consulta crea un "sí" nuevo: el "no" debería invalidarlo | No aplica: es la regla "Cambia de idea", a propósito. El cliente ya sabe para qué es (el aviso fue antes del "no") y manda el CUIL por su cuenta | Nada |
| 2 | alta | Un CUIL ajeno deja un "sí" vigente que podría autorizar otro CUIL después | Aplica: la ronda 5 guardaba el "sí" aunque el CUIL no fuera suyo | Un CUIL ajeno guarda solo el CUIL informado, sin "sí". La tarea 1 comprueba de quién es antes de registrar el "sí" |
| 3 | media | El escenario "Sin política publicada" tiene un `FALTA` sin decir qué falta probar | Aplica | La tarea 1 dice que el test nuevo es `estadoCredito` y `permisoAnticipado` en `null` sin términos |

## Ronda 12 (2026-11-18): con cambios, 2 hallazgos

| # | Sev. | Hallazgo de Codex | Verificación de Claude | Qué se cambió |
|---|---|---|---|---|
| 1 | alta | En "CUIL antes del aviso", el "sí" se guardaba con `registrar_consentimiento` antes de validar el CUIL de la charla: si era ajeno, quedaba un "sí" | Aplica | Diseño simplificado: en ese caso el bot explica para qué es y le pide que se lo vuelva a mandar. El "sí" lo registra solo `verificarSituacion`, con un CUIL que llegó en el mensaje después del aviso, validado y propio. `registrar_consentimiento` guarda solo el "no", y un `true` se rechaza en la función de dominio. La tarea 1 se reescribió entera |
| 2 | media | La tarea 1 decía "con un CUIL inválido o ajeno no se guarda nada", y la spec guarda el CUIL informado del ajeno | Aplica: la frase vieja quedó de una ronda anterior | Tarea 1 reescrita: inválido, nada; ajeno, solo `cuil_informado`, sin "sí" |

## Ronda 13 (2026-11-18): con cambios, 1 hallazgo medio

| # | Sev. | Hallazgo de Codex | Verificación de Claude | Qué se cambió |
|---|---|---|---|---|
| 1 | media | Con varios mensajes juntos en un lote, el `wamid` del turno puede no ser el del mensaje que trae el CUIL | Aplica: el lote tiene `partes`, cada una con su `wamid`, y el turno usa el del último (`partes.at(-1).wamid`) | `verificarSituacion` recibe los mensajes del turno con su texto y su `wamid`, y usa el `wamid` del que trae el CUIL. Test de un lote de dos mensajes |

## Ronda 14 (2026-11-18): con cambios, 4 hallazgos de precisión

| # | Sev. | Hallazgo de Codex | Verificación de Claude | Qué se cambió |
|---|---|---|---|---|
| 1 | alta | No está definido cómo se obtiene el CUIL ni qué pasa con un "sí" vigente y un CUIL anticipado | No aplica en el fondo: el CUIL lo pasa la IA (`cuil`) y "en el mensaje" es que sus dígitos estén en una de las partes del turno (ronda 13). Con un "sí" vigente se consulta sin aviso nuevo ("Respuestas anteriores al cambio") | "CUIL antes del aviso" aclara que es sin un "sí" vigente |
| 2 | media | No queda claro si el CUIL anticipado se guarda, y qué pasa con el reenviado si es ajeno | Aplica como precisión | El anticipado no se guarda nunca; el reenviado es el caso normal, y si es ajeno queda solo como CUIL informado |
| 3 | media | La deduplicación podría impedir un "sí" nuevo después de "sí" + "no" | No aplica en el código: `registrarConsentimiento` compara contra el último registro. Faltaba escribirlo | La tarea 1 lo dice, con el test "sí, no, CUIL" |
| 4 | media | No hay un límite de tiempo exacto para el aviso, y uno del mismo lote podría contar | Aplica como precisión | El aviso tiene que tener un `created_at` menor que el del entrante con el CUIL. Un aviso del mismo turno nunca cuenta (los entrantes se guardan antes de la respuesta). Riesgo aceptado: un CUIL espontáneo en los segundos en que se escribía el aviso. Test del mismo turno |

## Ronda 15 (2026-11-18): 1 hallazgo medio de redacción y 1 bajo. Plan listo para la aprobación del dueño

| # | Sev. | Hallazgo de Codex | Verificación de Claude | Qué se cambió |
|---|---|---|---|---|
| 1 | media | "Sin consentimiento" decía que con un "no" no se consulta, y choca con "Cambia de idea" | Aplica: redacción vieja | El WHEN es "su último registro es un 'no' y no mandó un CUIL después", con remisión a "Cambia de idea" |
| 2 | baja | Un turno que empezara dentro del milisegundo siguiente al aviso lo dejaría fuera | No aplica en la práctica: un turno dura segundos (la llamada a la IA sola), y los turnos de un número se atienden de a uno | Nada. Se acepta |

**Resumen de la revisión:** 15 rondas.
- De la 1 a la 5 salieron los huecos de fondo: aviso previo, "no" claro, CUIL ajeno, el "sí" atado al mensaje con el CUIL.
- De la 6 a la 15, precisiones de orden y redacción.
- `openspec validate cuil-directo --strict` pasa.
- El archive de prueba en una copia aplica, en orden, `cuil-en-consulta`, `ajustes-por-chats-reales` y `cuil-directo` sin errores.
- Falta la aprobación del dueño en `OBJETIVO.md`.
