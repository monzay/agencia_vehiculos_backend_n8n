## MODIFIED Requirements

### Requirement: Cuándo corresponde el recordatorio
El sistema MUST mandarle un recordatorio al cliente cuando el último mensaje de la consulta es de la asesora
virtual, ese mensaje hace una pregunta que se recuerda (ver Qué preguntas se recuerdan), pasaron 10 minutos o
más (y menos de 60) y el cliente no escribió después. Reemplaza la regla del 15/10/2026 ("al cliente que deja
de responder no se le escribe").
<!-- id: recordatorio.consultasParaRecordar -->

#### Scenario: Deja sin contestar una pregunta
- **WHEN** la asesora preguntó "¿Con cuánto de anticipo contás?" y pasan 10 minutos sin respuesta
- **THEN** el cliente recibe un recordatorio
<!-- test: src/agente/recordatorio.test.js › "deja sin contestar una pregunta y a los 10 minutos el cliente recibe un recordatorio" -->
<!-- eval: chats simulados › R1 -->

#### Scenario: Todavía no pasaron 10 minutos
- **WHEN** pasaron 9 minutos desde la pregunta
- **THEN** no sale nada
<!-- test: src/agente/recordatorio.test.js › "si todavía no pasaron 10 minutos (9), no sale nada" -->

#### Scenario: El último mensaje no preguntaba nada
- **WHEN** el último mensaje de la asesora no pregunta ni pide nada
- **THEN** no sale nada
<!-- test: src/agente/recordatorio.test.js › "si el último mensaje de la asesora no pregunta ni pide nada, no sale nada" -->

#### Scenario: El cliente ya escribió
- **WHEN** el cliente escribió después de la pregunta
- **THEN** no sale nada
<!-- test: src/agente/recordatorio.test.js › "si el cliente ya escribió después de la pregunta, no sale nada" -->

#### Scenario: Justo a los 10 minutos
- **WHEN** pasaron exactamente 10 minutos desde la pregunta
- **THEN** el recordatorio corresponde
<!-- test: src/agente/recordatorio.test.js › "justo a los 10 minutos el recordatorio corresponde" -->

#### Scenario: Justo a los 60 minutos
- **WHEN** pasaron exactamente 60 minutos desde la pregunta
- **THEN** ya no corresponde
<!-- test: src/agente/recordatorio.test.js › "justo a los 60 minutos ya no corresponde" -->

#### Scenario: El sistema estuvo apagado
- **WHEN** pasó más de una hora desde la pregunta
- **THEN** no sale nada, aunque nunca se haya mandado un recordatorio
<!-- test: src/agente/recordatorio.test.js › "si el sistema estuvo apagado y pasó más de una hora, no sale nada aunque nunca se haya mandado un recordatorio" -->

### Requirement: Qué dice el recordatorio
El recordatorio MUST ser un solo mensaje corto, escrito por la IA con las instrucciones de la asesora, que
retome su última pregunta con otras palabras. MUST NOT saludar de nuevo, presionar ni agregar datos nuevos;
si la IA empieza con un saludo, el sistema MUST quitarlo. Si el último mensaje de la asesora pedía fotos del
usado además de hacer una pregunta, el recordatorio MUST retomar solo la pregunta, sin volver a pedir las
fotos.
La IA MUST NOT usar herramientas para escribirlo.
<!-- id: recordatorio.textoDelRecordatorio -->

#### Scenario: Retoma la pregunta
- **WHEN** la pregunta sin contestar era por el anticipo
- **THEN** el recordatorio vuelve sobre el anticipo en una o dos oraciones, sin repetir el mensaje anterior palabra por palabra
<!-- test: src/agente/recordatorio.test.js › "el recordatorio lo escribe la IA con las instrucciones de la asesora, retoma la última pregunta y sin herramientas" -->
<!-- test: src/agente/recordatorio.test.js › "la línea de sistema del recordatorio pide: sin hola, sin perdón, sin no hay apuro, sin explicar para qué sirve el dato, una oración" -->
<!-- test: src/agente/recordatorio.test.js › "el recordatorio que sale no empieza con un saludo aunque la IA lo escriba" -->
<!-- test: src/agente/recordatorio.test.js › "sinSaludoInicial quita un saludo al empezar el recordatorio y deja el resto" -->
<!-- eval: chats simulados › R1, R2 -->

#### Scenario: El último mensaje pedía fotos
- **WHEN** la asesora escribió "Si podés, pasame unas fotos de la moto. ¿Qué marca, modelo y año es?" y pasan 10 minutos
- **THEN** el recordatorio retoma la marca, el modelo y el año, y no menciona las fotos
<!-- test: FALTA -->
<!-- eval: chats simulados › X13 -->

## ADDED Requirements

### Requirement: Qué preguntas se recuerdan
El recordatorio MUST salir solo si la pregunta del último mensaje de la asesora es de uno de estos temas: qué
auto busca, contado o financiado, anticipo, recibo o garante, si entrega un vehículo (con su marca, modelo y
año), quién decide y cuándo puede venir. Con cualquier otra pregunta, o si el tema no se reconoce, MUST NOT
salir.
<!-- id: recordatorio.consultasParaRecordar -->

#### Scenario: Qué auto busca
- **WHEN** el cliente escribió "quería hacer una consulta", la asesora preguntó qué auto busca y pasan 10 minutos
- **THEN** sale el recordatorio
<!-- test: FALTA -->
<!-- eval: chats simulados › X14 -->

#### Scenario: Quién decide y la visita
- **WHEN** la pregunta sin contestar es "¿Lo decidís por tu cuenta o lo consultás con alguien?" o "¿Cuándo podrías pasar por la agencia?"
- **THEN** sale el recordatorio
<!-- test: FALTA -->

#### Scenario: Permiso del BCRA o CUIL
- **WHEN** la pregunta sin contestar es el permiso para consultar el BCRA o el pedido del CUIL
- **THEN** no sale nada
<!-- test: FALTA -->
<!-- eval: chats simulados › X14 -->

#### Scenario: Cuánto pide por el usado
- **WHEN** la pregunta sin contestar es "¿Cuánto pedís por el Fox?"
- **THEN** no sale nada
<!-- test: FALTA -->

#### Scenario: Una oferta
- **WHEN** la pregunta sin contestar es "¿Te quedás con el Voyage o con la Bora?" o "¿Querés que te pase las fotos?"
- **THEN** no sale nada
<!-- test: FALTA -->
<!-- eval: chats simulados › X14 -->

#### Scenario: Una pregunta que no se reconoce
- **WHEN** la pregunta sin contestar no es de ningún tema de la lista
- **THEN** no sale nada
<!-- test: FALTA -->
