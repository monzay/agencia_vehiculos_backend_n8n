## ADDED Requirements

### Requirement: El texto no nombra herramientas
Antes de enviar una respuesta de la IA, el sistema MUST revisar que el texto no contenga el nombre de
ninguna herramienta del agente. Si lo contiene, MUST pedirle a Claude una sola vez que lo reescriba, sin
herramientas. Si la reescritura lo sigue conteniendo, MUST quitar la oración que lo nombra. Si no queda
texto, vale el mensaje de respaldo.
<!-- id: agente.responderConIA -->

#### Scenario: La respuesta nombra una herramienta
- **WHEN** Claude escribe "te busco algo parecido con buscar_similares"
- **THEN** el sistema pide la reescritura y al cliente le llega un texto sin ese nombre
<!-- test: FALTA -->

#### Scenario: La reescritura también lo nombra
- **WHEN** el segundo texto sigue nombrando una herramienta
- **THEN** sale sin la oración que la nombra
<!-- test: FALTA -->

#### Scenario: Respuesta normal
- **WHEN** el texto no nombra ninguna herramienta
- **THEN** sale tal cual, sin una llamada extra a Claude
<!-- test: FALTA -->

### Requirement: Las fotos enviadas quedan registradas
Cuando una respuesta sale con fotos, el sistema MUST guardar junto a ese mensaje el código del auto de las
fotos (`historial_mensajes.fotos_ref`, migración 085). Un mensaje sin fotos MUST quedar con ese dato vacío.
<!-- id: atender.cerrarTurno -->

#### Scenario: Respuesta con fotos
- **WHEN** la IA usa `enviar_fotos_auto` para el auto 65 y la respuesta sale con fotos
- **THEN** el mensaje queda guardado con `fotos_ref = "65"`
<!-- test: FALTA -->

#### Scenario: La herramienta no devolvió fotos
- **WHEN** la IA pide las fotos de un auto que no tiene o no está disponible
- **THEN** el mensaje queda sin `fotos_ref`
<!-- test: FALTA -->

### Requirement: Un 👍 suelto no viaja con texto
Si la respuesta de la IA tiene texto y termina con un 👍 en una línea aparte, el sistema MUST quitar ese
👍 antes de enviarla y de guardarla. Una respuesta que es solo 👍 sigue saliendo como reacción.
<!-- id: atender.responderConAgente -->

#### Scenario: Texto con un 👍 al final
- **WHEN** la IA responde "Nos vemos el viernes" y, en otra línea, "👍"
- **THEN** sale "Nos vemos el viernes", sin el 👍
<!-- test: FALTA -->

#### Scenario: Solo 👍
- **WHEN** la IA responde únicamente 👍
- **THEN** sale como reacción, igual que hoy
<!-- test: FALTA -->

## MODIFIED Requirements

### Requirement: Contexto de cada turno
En cada mensaje, el sistema MUST pasarle al agente:
- el nombre de la asesora;
- el nombre de la agencia (para usar solo si lo preguntan);
- la dirección y el mapa;
- el link del catálogo (solo si es https);
- la fecha y hora de Argentina;
- el nombre del cliente, saneado;
- el auto de la consulta, si tiene uno: su descripción y su código, para usar con las herramientas. Si el
  mensaje viene de la web por ese mismo auto, MUST NOT repetirse;
- lo que tiene anotado del cliente y lo que falta, en orden. Lo anotado MUST presentarse como anotado, con
  el aviso de corregirlo si el cliente lo desmiente;
- las preguntas del recorrido que la asesora hizo en sus dos últimos mensajes y el cliente no contestó, con
  el aviso de no repetirlas en este mensaje;
- si hay una visita propuesta, el día en que el cliente la dijo;
- cuánto pasó desde el mensaje anterior de la charla, si pasaron 12 horas o más;
- de qué autos ya se le mandaron fotos en esta consulta, y cuándo.
<!-- id: atender.contextoDelTurno -->

#### Scenario: Mensaje normal
- **WHEN** llega un mensaje
- **THEN** el agente recibe lo ya respondido, lo que falta y la dirección de la agencia
<!-- test: src/agente/atender.test.js › "en cada mensaje el agente recibe lo que ya respondió, lo que falta y la dirección de la agencia" -->

#### Scenario: Consulta con un auto
- **WHEN** llega un mensaje en una consulta que ya tiene auto
- **THEN** el agente recibe la descripción del auto y su código, aunque el mensaje no lo nombre
<!-- test: src/agente/atender.test.js › "en cada mensaje el agente recibe el auto de la consulta con su código" -->
<!-- test: src/agente/instrucciones.test.js › "el contexto dice cuál es el auto de la consulta y su código" -->

#### Scenario: No se puede leer el auto de la consulta
- **WHEN** falla la lectura del auto de la consulta
- **THEN** el agente responde igual, sin la línea del auto
<!-- test: src/agente/atender.test.js › "si no se puede leer el auto de la consulta, el agente responde igual" -->

#### Scenario: Sin auto o desde la web por el mismo auto
- **WHEN** la consulta no tiene auto, o el mensaje viene de la web por ese mismo auto
- **THEN** no se agrega la línea del auto de la consulta
<!-- test: src/agente/instrucciones.test.js › "sin auto en la consulta, o si viene de la web por el mismo auto, no agrega la línea" -->

#### Scenario: Link del catálogo
- **WHEN** la URL pública configurada no es https
- **THEN** no se arma el link del catálogo
<!-- test: src/agente/origen-web.test.js › "el link del catálogo sale solo de una URL https configurada" -->

#### Scenario: Fotos ya enviadas
- **WHEN** en la consulta ya salió un mensaje con las fotos del auto 65
- **THEN** el contexto del próximo mensaje dice que las fotos de ese auto ya se enviaron, y cuándo
<!-- test: FALTA -->

#### Scenario: Visita propuesta días atrás
- **WHEN** el cliente dijo "mañana a la mañana" un miércoles y vuelve a escribir el viernes
- **THEN** el contexto dice que la visita se propuso el miércoles y que pasaron dos días desde el mensaje anterior
<!-- test: FALTA -->

#### Scenario: Mensajes seguidos
- **WHEN** el mensaje anterior de la charla es de hace unos minutos
- **THEN** el contexto no agrega la línea del tiempo que pasó
<!-- test: FALTA -->

#### Scenario: Lo anotado se puede corregir
- **WHEN** se arma el contexto con datos ya anotados del cliente
- **THEN** van como anotados, con el aviso de corregirlos si el cliente los desmiente
<!-- test: FALTA -->

#### Scenario: Pregunta sin contestar
- **WHEN** la asesora preguntó por el recibo o garante en sus dos últimos mensajes y el cliente no lo contestó
- **THEN** el contexto lo dice y pide no repetir esa pregunta en este mensaje
<!-- test: FALTA -->

#### Scenario: El cliente contestó
- **WHEN** el cliente contestó la última pregunta de la asesora
- **THEN** el contexto no agrega esa línea
<!-- test: FALTA -->

### Requirement: Cómo se llama a Claude
El sistema MUST usar el modelo `claude-haiku-5-5`, sin `temperature` y con herramientas estrictas. El nivel
de razonamiento MUST ser el más bajo entre bajo, medio y alto con el que pasan todos los chats simulados, y
MUST quedar escrito en este requisito antes de archivar el cambio (hoy: bajo). Con nivel bajo el máximo de
la respuesta MUST ser 2048 tokens; con medio o alto, 4096. Cada llamada MUST tener timeout de 30 segundos y
un solo reintento. Las herramientas MUST ejecutarse de a una, en el orden pedido. Sus resultados MUST volver
a Claude junto con su razonamiento intacto; un error de herramienta MUST volver marcado como error.
<!-- id: agente.responderConIA -->

#### Scenario: Parámetros de la llamada
- **WHEN** se llama a Claude
- **THEN** va con Haiku 5.5, el nivel de razonamiento elegido, sin temperature y herramientas estrictas
<!-- test: src/agente/agente.test.js › "pide a Claude Haiku 5.5 con esfuerzo bajo, sin temperature y con las herramientas estrictas" -->

#### Scenario: Timeout y reintento
- **WHEN** se llama a Claude
- **THEN** la llamada tiene timeout corto y un solo reintento
<!-- test: src/agente/agente.test.js › "cada llamada a Claude tiene timeout corto y un solo reintento" -->

#### Scenario: Ejecución de herramientas
- **WHEN** Claude pide herramientas
- **THEN** se ejecutan de a una, en orden, y el resultado vuelve con el razonamiento intacto
<!-- test: src/agente/agente.test.js › "ejecuta la herramienta pedida y le devuelve el resultado junto con su razonamiento intacto" -->
<!-- test: src/agente/agente.test.js › "ejecuta las herramientas de a una, en el orden que las pidió" -->

#### Scenario: Error de herramienta
- **WHEN** una herramienta falla
- **THEN** el resultado vuelve a Claude marcado como error
<!-- test: src/agente/agente.test.js › "un error de herramienta vuelve a Claude marcado como error" -->

#### Scenario: Texto antes de usar una herramienta
- **WHEN** Claude escribió algo junto con la herramienta y después no agregó nada
- **THEN** se manda lo que ya había escrito; si agregó una respuesta final, va solo esa
<!-- test: src/agente/agente.test.js › "si contestó junto con la herramienta y después no agrega nada, se manda lo que ya había escrito" -->
<!-- test: src/agente/agente.test.js › "si escribió antes y después de la herramienta, va solo la respuesta final (Claude suele repetir lo anterior)" -->

#### Scenario: Medición del nivel de razonamiento
- **WHEN** se corren los chats simulados con nivel bajo, medio y alto
- **THEN** queda elegido el más bajo con el que pasan todos, con su máximo de tokens
<!-- eval: chats simulados › todos, una pasada por nivel -->
