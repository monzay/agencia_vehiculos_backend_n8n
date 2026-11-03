## ADDED Requirements

### Requirement: Con la conversación tomada por una persona, el bot no responde
Cuando la sesión del cliente tiene `sesiones.bot_pausado = true`, el agente MUST registrar el
mensaje entrante en `historial_mensajes` pero MUST NOT llamar a Claude, enviar una respuesta ni
gastar cupo de IA.
<!-- id: atender.atender -->

#### Scenario: Llega un mensaje con la conversación tomada
- **WHEN** llega un mensaje del cliente y su sesión tiene `bot_pausado = true`
- **THEN** se guarda el entrante y no se llama a Claude, no se envía nada y no se gasta cupo
<!-- test: src/agente/atender.test.js › "con la conversación tomada por una persona, guarda el entrante y no llama a Claude ni envía" -->

#### Scenario: Reintento con la conversación tomada
- **WHEN** vuelve a llegar el mismo `wamid` con la sesión tomada
- **THEN** se toma como duplicado y no se guarda dos veces
<!-- test: src/agente/atender.test.js › "reintento con la conversación tomada: no se guarda dos veces" -->

#### Scenario: El bot vuelve a atender tras devolver el control
- **WHEN** `bot_pausado` vuelve a `false` y llega un mensaje nuevo
- **THEN** el agente responde con normalidad en la misma sesión
<!-- test: FALTA -->

### Requirement: Al retomar, el bot ve lo que pasó durante la pausa
Al rearmar el historial para Claude, el agente MUST incluir los mensajes de la pausa: los
entrantes del cliente como `user` y los salientes con `paso_nodo = "humano"` como `assistant`,
en orden, junto con los del propio agente (`paso_nodo = "agente_ia"`).
<!-- id: atender.responderConAgente -->

#### Scenario: Historial con un tramo atendido por una persona
- **WHEN** la sesión tuvo un tramo respondido por el asesor y luego el bot retoma
- **THEN** el historial que recibe Claude incluye lo que dijo el cliente y lo que respondió el asesor
<!-- test: FALTA -->
