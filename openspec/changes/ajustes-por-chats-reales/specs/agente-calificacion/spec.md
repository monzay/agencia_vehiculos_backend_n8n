## ADDED Requirements

### Requirement: El nombre después de la visita
El sistema MUST poner "su nombre" primero en lo que falta solo si la consulta tiene una visita acordada
(`visita_propuesta`), el cliente nunca dijo su nombre y todavía no se le pidió en esta consulta. Cuando la
asesora responde con el nombre primero en lo que falta, MUST marcarlo (`nombre_pedido_at`) aunque el cliente
no conteste, y después MUST NOT volver a figurar.
<!-- id: calificacion.pendientes -->

#### Scenario: Visita acordada y sin nombre
- **WHEN** la consulta tiene la visita acordada, el cliente nunca dijo su nombre y no se le pidió
- **THEN** lo que falta es solo "su nombre"
<!-- test: FALTA -->

#### Scenario: No en el mismo mensaje que confirma la visita
- **WHEN** el cliente dice "el jueves a la tarde" y la asesora guarda la visita en ese turno
- **THEN** lo que devuelve `registrar_calificacion` en ese turno no trae "su nombre": el nombre recién figura en el mensaje siguiente del cliente, porque la visita tiene que haber quedado acordada antes de ese turno
<!-- test: FALTA -->
<!-- eval: chats simulados › X9 -->

#### Scenario: Visita acordada con el recorrido incompleto
- **WHEN** el cliente acordó la visita sin haber dicho quién decide, nunca dijo su nombre y no se le pidió
- **THEN** "su nombre" va primero en lo que falta y "quién decide" después
<!-- test: FALTA -->

#### Scenario: Ya lo dijo
- **WHEN** el cliente dijo su nombre antes de acordar la visita, o en una consulta anterior
- **THEN** el nombre no figura en lo que falta
<!-- test: FALTA -->

#### Scenario: Ya se pidió
- **WHEN** la asesora ya pidió el nombre en esta consulta y el cliente no lo dio
- **THEN** el nombre no figura en lo que falta
<!-- test: FALTA -->

#### Scenario: Sin visita acordada
- **WHEN** el recorrido está a medias, o el cliente dijo que no sabe cuándo viene
- **THEN** el nombre no figura en lo que falta
<!-- test: FALTA -->

#### Scenario: Se marca al pedirlo
- **WHEN** la asesora responde con el nombre primero en lo que falta
- **THEN** la consulta queda con `nombre_pedido_at` y el próximo mensaje ya no lo tiene en lo que falta
<!-- test: FALTA -->

#### Scenario: Dos mensajes seguidos
- **WHEN** después de acordar la visita el cliente manda "ok" y "gracias" casi juntos
- **THEN** el nombre se pide una sola vez: los mensajes de un mismo número se atienden de a uno (`agente-entrada`) y el segundo ya ve la marca
<!-- test: FALTA -->

### Requirement: Guardar el nombre que dijo el cliente
`registrar_calificacion` MUST aceptar el nombre que el cliente dijo de sí mismo y guardarlo saneado en
`sesiones.nombre_declarado` de la consulta en curso. Se sanea igual que hoy el nombre del contexto: letras con
acentos, espacios, apóstrofo, punto y guion, en una línea y hasta 40 caracteres. Si la ficha no tiene nombre,
o tiene el que el cliente había dicho antes, MUST actualizarla; MUST NOT pisar otro nombre de la ficha.
<!-- id: herramientas.registrar_calificacion -->

#### Scenario: Nombre compuesto
- **WHEN** el cliente escribe "me llamo María José O'Neill"
- **THEN** se guarda "María José O'Neill", con los espacios, el acento y el apóstrofo
<!-- test: FALTA -->

#### Scenario: Responde solo el nombre
- **WHEN** la asesora le pidió el nombre y el cliente responde "Claudia"
- **THEN** se guarda "Claudia"
<!-- eval: chats simulados › X9 -->

#### Scenario: Corrige el nombre
- **WHEN** el cliente dijo "soy Clara" y después escribe "perdón, Claudia, no Clara"
- **THEN** queda guardado "Claudia" en la consulta y, si la ficha se había completado con "Clara", también en la ficha
<!-- test: FALTA -->

#### Scenario: Nombra a otra persona
- **WHEN** el cliente escribe "Alvaro es mi marido, yo soy Claudia"
- **THEN** se guarda "Claudia", no "Alvaro"
<!-- eval: chats simulados › X10 -->

#### Scenario: Dice su nombre
- **WHEN** el cliente escribe "soy Claudia Espinosa"
- **THEN** la consulta guarda "Claudia Espinosa" como nombre dicho y, si la ficha no tenía nombre, también la ficha
<!-- test: FALTA -->

#### Scenario: Ficha con nombre viejo
- **WHEN** la ficha tiene "Alvaro" (del perfil, de antes de este cambio) y el cliente dice "soy Claudia"
- **THEN** la consulta guarda "Claudia" y la ficha sigue diciendo "Alvaro"
<!-- test: FALTA -->

#### Scenario: Nombre con símbolos
- **WHEN** el nombre que llega trae emojis o saltos de línea
- **THEN** se guarda solo con letras, en una línea; si no queda nada, no se guarda
<!-- test: FALTA -->

### Requirement: El pedido de fotos del usado
La primera vez que en una consulta queda guardado que el cliente entrega un vehículo, el resultado de
`registrar_calificacion` MUST avisarle al agente que pida fotos del vehículo en ese mismo mensaje, y el sistema
MUST marcar en la consulta que ya se pidieron (`fotos_usado_pedidas_at`). Con la marca puesta, MUST NOT volver
a avisarlo, aunque el cliente corrija o vuelva a decir que entrega.
<!-- id: herramientas.registrar_calificacion -->

#### Scenario: Primera vez que entrega
- **WHEN** se guarda `entrega_usado: true` en una consulta sin la marca
- **THEN** el resultado pide las fotos y la consulta queda marcada
<!-- test: FALTA -->

#### Scenario: Ya se pidieron
- **WHEN** se vuelve a guardar `entrega_usado: true` en una consulta con la marca
- **THEN** el resultado no pide fotos
<!-- test: FALTA -->

#### Scenario: No entrega
- **WHEN** se guarda `entrega_usado: false`
- **THEN** no se piden fotos ni se marca nada
<!-- test: FALTA -->
