# agente-conversacion

> BORRADOR — extraído del código el 2026-10-30, pendiente de revisión del dueño.
> Fuente: src/agente/atender.js, src/agente/agente.js, src/agente/cierre.js,
> src/agente/envios.js, src/agente/origen-web.js, src/agente/pasos.js,
> src/agente/consultas-por-auto.js, src/services/clientes.service.js (resolverCliente).
> 2026-10-31: se agregó "Una consulta por auto" (decisión del dueño).

## Purpose

Qué pasa en cada turno de la charla: a quién se reconoce, en qué consulta cae el
mensaje, qué se le responde y cómo sale la respuesta por WhatsApp.

## Requirements

### Requirement: Una persona, una ficha
El sistema MUST reconocer al cliente por su número de WhatsApp o por el teléfono de una
ficha que ya existe. Si no existe, MUST crear la ficha y su canal de WhatsApp juntos, en
una transacción, con el teléfono guardado en 10 dígitos. El nombre del perfil de WhatsApp
MUST completar una ficha sin nombre y MUST NOT pisar un nombre ya cargado.
<!-- id: clientes.service.resolverCliente -->
<!-- dueña-futura: clientes — también la usan el alta desde la web y el panel -->

#### Scenario: Número nuevo
- **WHEN** escribe un número que no está en ninguna ficha
- **THEN** se crea la ficha con su fila en `cliente_canales`, el teléfono de 10 dígitos y la consulta
<!-- test: src/agente/atender.test.js › "un número nuevo crea la ficha con su fila en cliente_canales, el teléfono de 10 dígitos y la sesión" -->

#### Scenario: Ficha y canal se crean juntos
- **WHEN** se crea una ficha nueva desde WhatsApp
- **THEN** la ficha y su canal se guardan en la misma transacción
<!-- test: src/agente/atender.test.js › "la ficha nueva y su canal se crean juntos en una transacción (con la base raíz, no con un tx)" -->

#### Scenario: Ya era cliente por la web
- **WHEN** escribe alguien que ya tenía ficha cargada desde la web
- **THEN** se usa esa ficha y se le vincula el canal, sin crear otra
<!-- test: src/agente/atender.test.js › "quien ya era cliente por la web usa esa ficha: se le vincula el canal y no se crea otra" -->

#### Scenario: Segundo mensaje
- **WHEN** el mismo número manda otro mensaje
- **THEN** se reutiliza la ficha
<!-- test: src/agente/atender.test.js › "el segundo mensaje del mismo número reutiliza la ficha" -->

#### Scenario: La ficha ya tiene nombre
- **WHEN** el perfil de WhatsApp trae un nombre distinto al de la ficha
- **THEN** se conserva el nombre de la ficha
<!-- test: src/agente/atender.test.js › "el nombre del perfil de WhatsApp no pisa el nombre ya cargado" -->

#### Scenario: La ficha no tiene nombre
- **WHEN** la ficha no tiene nombre y el perfil sí
- **THEN** se completa con el nombre del perfil
<!-- test: src/agente/atender.test.js › "el nombre del perfil de WhatsApp completa una ficha que no tenía nombre" -->

#### Scenario: Financiación cargada por la web
- **WHEN** un cliente con financiación cargada por la web consulta desde WhatsApp
- **THEN** `mi_financiacion` la encuentra
<!-- test: src/agente/atender.test.js › "quien tenía una financiación cargada por la web: mi_financiacion la encuentra desde su WhatsApp" -->

### Requirement: Una consulta dura 24 horas desde el último mensaje
El sistema MUST seguir en la misma consulta (`chat_estado`) mientras haya actividad en las
últimas 24 horas; si no, MUST abrir una nueva. Cada consulta nueva MUST nacer con
`ultimo_mensaje` cargado. Si el cliente tiene varias consultas (una por auto), el mensaje
MUST caer en la del último mensaje.
<!-- id: atender.sesionDe -->

#### Scenario: Varias consultas abiertas
- **WHEN** el cliente tiene dos consultas vigentes, una por cada auto
- **THEN** el mensaje cae en la que tuvo el último mensaje, aunque sea la más vieja
<!-- test: src/agente/atender.test.js › "la conversación sigue en la consulta del último mensaje" -->

#### Scenario: Último mensaje de hace 23 o 25 horas
- **WHEN** el último mensaje fue hace 23 horas, y en otro caso hace 25 horas
- **THEN** a las 23 horas se reutiliza la consulta; a las 25 se abre una nueva
<!-- test: src/agente/atender.test.js › "una sesión de hace 25 h no se reutiliza; una de hace 23 h, sí" -->

#### Scenario: Consulta nueva
- **WHEN** se abre una consulta
- **THEN** nace con `ultimo_mensaje`, así vence a las 24 horas
<!-- test: src/agente/atender.test.js › "la sesión nueva nace con ultimo_mensaje (así vence a las 24 h)" -->

### Requirement: Consultas que llegan desde la web
Si el mensaje trae `(REF #<ref>)` del botón "Consultar" de la web, el sistema MUST abrir la
consulta con origen `web`. Si el auto está disponible, MUST pasar a ser el auto de interés;
si no, MUST NOT cargarse, y el agente MUST saber que ya no está.

Si trae `[AS:<slug>]` de un asesor activo y no borrado, la consulta en la que sigue la charla (la nueva,
la abierta, o la de otro auto que se abre o se retoma) MUST quedar asignada a ese asesor, con `atribuido`,
aunque tuviera otro. El link MUST valer aunque el asesor no participe del reparto por turnos, y MUST NOT
gastar turno. Con un código inexistente, inactivo o borrado, el código MUST ignorarse y la consulta
MUST seguir como si no lo trajera: una consulta nueva va por turno (ver Reparto por turnos de las
consultas nuevas) y una abierta conserva su asesor. El código del asesor MUST quitarse del texto. Una ref
o un código con caracteres raros MUST ignorarse.
<!-- id: atender.sesionDe -->

#### Scenario: Desde la web con link de asesor
- **WHEN** el mensaje trae la ref de un auto disponible y el código de un asesor activo
- **THEN** la consulta arranca con origen web, ese auto como interés y ese asesor asignado
<!-- test: src/agente/atender.test.js › "desde la web: la consulta arranca con origen web, el auto cargado y el asesor que trajo al cliente" -->

#### Scenario: Asesor inexistente
- **WHEN** el código de asesor no corresponde a ninguno activo y no hay nadie en el turno
- **THEN** la consulta queda sin asesor
<!-- test: src/agente/atender.test.js › "desde la web con un asesor que no existe: la consulta queda sin asesor" -->

#### Scenario: Sin link de asesor
- **WHEN** el mensaje no trae código de asesor, venga de la web o escriba directo
- **THEN** la consulta nueva va por turno entre los asesores habilitados, sin atribuir
<!-- test: src/agente/atender.test.js › "sin link de un asesor la consulta va por turno, venga de la web o escriba directo" -->

#### Scenario: El cliente de otro asesor vuelve por un link
- **WHEN** el cliente de Juan, con la consulta abierta, vuelve por el link de Pepito
- **THEN** esa consulta pasa a ser de Pepito, atribuida, y sigue en la misma consulta
<!-- test: src/agente/atender.test.js › "el cliente de Juan que vuelve por el link de Pepito: la consulta abierta pasa a ser de Pepito" -->
<!-- test: src/agente/atender.test.js › "desde la web por el mismo auto con otro asesor: la consulta abierta pasa al del link" -->

#### Scenario: El link se queda con una consulta sin asignar
- **WHEN** la consulta abierta no tenía asesor y llega con el link de uno
- **THEN** pasa a ser de ese asesor, sin gastar turno
<!-- test: src/agente/atender.test.js › "el link de un asesor se queda con una consulta que estaba sin asignar" -->

#### Scenario: El link del mismo asesor
- **WHEN** el link es del asesor que ya tiene la consulta
- **THEN** no se escribe nada de más
<!-- test: src/agente/atender.test.js › "el link del mismo asesor que ya tiene la consulta no escribe nada de más" -->

#### Scenario: Asesor fuera del turno
- **WHEN** el link es de un asesor con "recibe consultas" apagado
- **THEN** la consulta es suya igual y el turno no avanza
<!-- test: src/agente/atender.test.js › "el link de un asesor que no participa del turno vale igual y no gasta turno" -->
<!-- test: src/agente/reparto.test.js › "el link vale aunque el asesor no participe del turno" -->

#### Scenario: Link inválido
- **WHEN** el código es de un asesor inexistente, inactivo o borrado
- **THEN** se ignora y la consulta abierta sigue con su asesor
<!-- test: src/agente/atender.test.js › "un link inválido (inexistente, inactivo) se ignora: la consulta abierta sigue con su asesor" -->
<!-- test: src/agente/reparto.test.js › "un link sin código, inexistente, de un asesor inactivo o borrado se ignora" -->

#### Scenario: Consulta ya abierta, sin auto
- **WHEN** la consulta ya estaba abierta sin auto de interés y llega un mensaje de la web por un auto disponible
- **THEN** ese auto pasa a ser el de interés y suma sus puntos
<!-- test: src/agente/atender.test.js › "desde la web con la consulta abierta sin auto: el auto de la web pasa a ser el de interés y suma sus puntos" -->

#### Scenario: Consulta ya abierta, por otro auto
- **WHEN** la consulta abierta es por otro auto y llega un mensaje de la web por un auto disponible
- **THEN** se abre (o se retoma) la consulta de ese auto (ver Una consulta por auto)
<!-- test: src/agente/atender.test.js › "desde la web por otro auto con la consulta abierta: abre otra consulta para ese auto" -->

#### Scenario: Auto que ya no está
- **WHEN** la ref es de un auto que ya no está disponible
- **THEN** no se carga y se le avisa al agente
<!-- test: src/agente/atender.test.js › "desde la web por un auto que ya no está: no se carga y se le avisa al agente" -->

#### Scenario: Mensaje común
- **WHEN** el mensaje no trae ref
- **THEN** no se buscan autos y la consulta es de WhatsApp
<!-- test: src/agente/atender.test.js › "un mensaje común no busca autos ni asesores y la consulta es de whatsapp" -->
<!-- test: src/agente/origen-web.test.js › "un mensaje común no trae ref ni asesor y queda igual" -->

#### Scenario: Lectura del mensaje predefinido
- **WHEN** llega el mensaje predefinido de la web
- **THEN** se saca la ref y el código del asesor, y el código se quita del texto
<!-- test: src/agente/origen-web.test.js › "del mensaje predefinido de la web saca la ref del auto" -->
<!-- test: src/agente/origen-web.test.js › "saca el código del asesor y lo quita del texto (el cliente no tiene por qué verlo repetido)" -->
<!-- test: src/agente/origen-web.test.js › "una ref o un código con caracteres raros no se toman" -->

### Requirement: Una consulta por auto
Cuando un cliente con una consulta por un auto se interesa en OTRO auto disponible, el sistema
MUST llevar ese auto en su propia consulta. Solo dos señales MUST contar como interés:
- la IA registra otro auto de interés (`registrar_calificacion`);
- el cliente llega desde la web con el link de otro auto.

Pedir fotos, comparar o preguntar por otro auto MUST NOT abrir una consulta.

Si el cliente ya tiene una consulta vigente (últimas 24 horas) por ese auto, MUST retomarse y
completarse con las respuestas de la persona que le falten. Si el mensaje trae el link de un asesor, la
consulta retomada MUST pasar a ser de ese asesor; sin link, MUST NOT tocarse su asesor. Si no hay consulta
vigente, MUST abrirse una nueva que:
- copia las respuestas de la persona: forma de pago, anticipo, recibo o garante, si entrega
  un usado (con sus datos), quién decide y cuándo puede venir;
- no copia la visita acordada, que es por el otro auto;
- queda con el mismo origen;
- queda con el asesor del link del mensaje, si lo trae; si no, con el de la consulta actual (y su
  `atribuido`) mientras siga activo y no borrado; si no tiene o ya no está activo, va por turno (ver
  Reparto por turnos de las consultas nuevas);
- nace con el puntaje y la temperatura recalculados (ver `agente-calificacion` › Temperatura del cliente).

La consulta anterior MUST quedar como estaba, con su temperatura. El resto del turno (otras
herramientas y el cierre) MUST seguir en la consulta del auto nuevo. Crear la consulta MUST
hacerlo el backend con su usuario de base: el usuario de la IA no puede crear consultas.
<!-- id: consultas-por-auto.consultaPorAuto -->

#### Scenario: Otro auto sin consulta
- **WHEN** el cliente se interesa en otro auto y no tiene consulta por ese auto
- **THEN** se abre una consulta nueva con las respuestas de la persona, el usado y el mismo asesor
<!-- test: src/agente/consultas-por-auto.test.js › "otro auto sin consulta: abre una nueva con las respuestas de la persona, el usado y el mismo asesor" -->
<!-- test: src/agente/consultas-por-auto.test.js › "otro auto sin consulta: heredar al asesor activo no gasta turno" -->
<!-- test: src/agente/atender.test.js › "desde la web por otro auto sin link: la consulta nueva sigue con el asesor de la anterior" -->

#### Scenario: El asesor heredado ya no está
- **WHEN** el asesor de la consulta actual está inactivo o borrado, o la consulta no tiene asesor
- **THEN** la consulta nueva va por turno
<!-- test: src/agente/consultas-por-auto.test.js › "otro auto sin consulta: si el asesor ya no está activo o fue borrado, la nueva va por turno" -->
<!-- test: src/agente/consultas-por-auto.test.js › "otro auto sin consulta: si la consulta actual no tiene asesor, la nueva va por turno" -->

#### Scenario: El link gana al asesor heredado
- **WHEN** el mensaje trae el link de otro asesor
- **THEN** la consulta nueva es de ese asesor, atribuida, y no se gasta turno
<!-- test: src/agente/consultas-por-auto.test.js › "otro auto sin consulta: el link de otro asesor gana al heredado" -->
<!-- test: src/agente/atender.test.js › "desde la web por otro auto con el link de Pepito: la consulta nueva es de Pepito y la anterior no se toca" -->

#### Scenario: Vuelve a un auto que ya consultó
- **WHEN** el cliente vuelve a un auto que tiene una consulta vigente
- **THEN** se retoma esa consulta y se le completa lo que faltaba de la persona
<!-- test: src/agente/consultas-por-auto.test.js › "otro auto con consulta abierta: la retoma y le completa lo que faltaba de la persona" -->

#### Scenario: Retomar con link de un asesor
- **WHEN** se retoma una consulta y el mensaje trae el link de un asesor
- **THEN** la consulta pasa a ser de ese asesor; sin link, su asesor no se toca
<!-- test: src/agente/consultas-por-auto.test.js › "otro auto con consulta abierta: el link de un asesor se la queda aunque fuera de otro" -->
<!-- test: src/agente/consultas-por-auto.test.js › "otro auto con consulta abierta: sin link no se toca el asesor de la que se retoma" -->

#### Scenario: Consulta vieja de ese auto
- **WHEN** la única consulta por ese auto es de hace más de 24 horas
- **THEN** no se retoma: se abre una nueva
<!-- test: src/agente/consultas-por-auto.test.js › "una consulta de ese auto de hace más de 24 h no se retoma" -->

#### Scenario: La IA registra otro auto
- **WHEN** la IA registra un auto de interés distinto al de la consulta
- **THEN** las respuestas se guardan en la consulta de ese auto y la anterior no se toca
<!-- test: src/agente/herramientas.test.js › "registrar_calificacion con otro auto registra en la consulta de ese auto y no toca la anterior" -->

#### Scenario: Mismo auto o consulta sin auto
- **WHEN** la IA registra el mismo auto, o la consulta todavía no tenía auto
- **THEN** sigue en la misma consulta
<!-- test: src/agente/herramientas.test.js › "registrar_calificacion con el mismo auto, o si la consulta no tenía auto, sigue en la misma consulta" -->

#### Scenario: El resto del turno sigue en la consulta nueva
- **WHEN** una herramienta cambia de consulta en medio del turno
- **THEN** las herramientas siguientes y el cierre del turno usan la consulta nueva
<!-- test: src/agente/agente.test.js › "si una herramienta cambia de consulta, las siguientes del turno usan la nueva y la respuesta la informa" -->
<!-- test: src/agente/atender.test.js › "el turno se cierra en la consulta del auto que quedó activo" -->

#### Scenario: Pedir fotos de otro auto
- **WHEN** el cliente pide fotos de otro auto
- **THEN** no se abre ninguna consulta
<!-- test: src/agente/herramientas.test.js › "pedir fotos de otro auto no abre una consulta" -->

### Requirement: La conversación queda guardada
El sistema MUST guardar en `historial_mensajes` cada mensaje entrante (con su `wamid`) y cada
respuesta, marcados con `paso_nodo = agente_ia`. Las reacciones 👍 MUST guardarse aparte
(`agente_reaccion`): no cuentan como mensaje cobrado ni entran a la charla que lee la IA.
<!-- id: atender.guardarMensaje -->

#### Scenario: Respuesta normal
- **WHEN** el agente responde un mensaje
- **THEN** llamó a Claude, registró el costo y guardó la conversación
<!-- test: src/agente/atender.test.js › "respuesta normal: llama al agente, registra el costo y guarda la conversación" -->

#### Scenario: Id de WhatsApp
- **WHEN** se guarda un mensaje entrante
- **THEN** queda con su `wamid`
<!-- test: src/agente/atender.test.js › "el id del mensaje de WhatsApp queda guardado en el entrante" -->

#### Scenario: Historial para Claude
- **WHEN** se arma el historial que se manda a Claude
- **THEN** empieza con el cliente, une los mensajes seguidos del mismo rol e ignora los vacíos
<!-- test: src/agente/limites.test.js › "convierte el historial a turnos de usuario y asistente" -->
<!-- test: src/agente/limites.test.js › "une mensajes seguidos de la misma persona" -->
<!-- test: src/agente/limites.test.js › "descarta las respuestas del bot que quedaron antes del primer mensaje del cliente" -->
<!-- test: src/agente/limites.test.js › "ignora mensajes vacíos" -->

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
- lo que el cliente ya respondió y lo que falta, en orden.
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

### Requirement: Despedidas con 👍 en lugar de respuesta
Si la charla está cerrada (visita acordada, "no sabe cuándo viene" o ya derivada a un vendedor)
y el cliente solo agradece o se despide, el sistema MUST reaccionar con 👍 a su mensaje, sin
IA. "Solo agradece" significa: hasta 60 caracteres, sin pregunta, solo palabras de cierre o
emojis. Si la última respuesta de la asesora preguntaba o pedía algo, MUST responder la IA:
un "dale" ahí es un sí. Si la IA contesta solo 👍, MUST salir como reacción.
<!-- id: cierre.debeReaccionar -->

#### Scenario: Charla cerrada y solo agradece
- **WHEN** la charla está cerrada, el cliente solo agradece y la asesora no había preguntado nada
- **THEN** se reacciona con 👍, gratis y sin IA
<!-- test: src/agente/cierre.test.js › "charla cerrada + solo agradece + Agustina no había preguntado nada: se reacciona" -->
<!-- test: src/agente/atender.test.js › "despedida con la charla cerrada: reacción 👍 (gratis) sin llamar a la IA" -->

#### Scenario: La asesora había preguntado algo
- **WHEN** la última respuesta preguntaba o pedía algo, aunque sea sin signo de pregunta
- **THEN** el "dale" lo responde la IA
<!-- test: src/agente/cierre.test.js › "si Agustina había preguntado algo, un 'dale' es una respuesta: no se reacciona" -->
<!-- test: src/agente/cierre.test.js › "si Agustina pidió algo aunque sea sin signo de pregunta, un 'dale' se responde" -->
<!-- test: src/agente/atender.test.js › "si Agustina había preguntado algo, un 'dale' lo responde la IA (es un sí, no una despedida)" -->

#### Scenario: Charla abierta
- **WHEN** el recorrido está a medias y el cliente solo agradece
- **THEN** no se reacciona
<!-- test: src/agente/cierre.test.js › "con la charla abierta no se reacciona, aunque solo agradezca" -->
<!-- test: src/agente/cierre.test.js › "con el recorrido a medias la charla sigue abierta" -->

#### Scenario: Qué cuenta como charla cerrada
- **WHEN** acordó la visita, no sabe cuándo viene o ya la tomó un vendedor
- **THEN** la charla está cerrada
<!-- test: src/agente/cierre.test.js › "la charla está cerrada si acordó la visita, si no sabe cuándo viene o si ya la tomó un vendedor" -->

#### Scenario: Qué cuenta como agradecimiento
- **WHEN** el mensaje es un agradecimiento o una despedida corta
- **THEN** se reconoce como tal; con pregunta, pedido, dato nuevo, saludo ("buenas") o más de 60 caracteres, no
<!-- test: src/agente/cierre.test.js › "reconoce los agradecimientos y despedidas cortos" -->
<!-- test: src/agente/cierre.test.js › "si pregunta, pide algo o trae un dato nuevo, NO es solo un agradecimiento (hay que responder)" -->
<!-- test: src/agente/cierre.test.js › "un mensaje largo nunca se toma como agradecimiento" -->
<!-- test: src/agente/cierre.test.js › "'buenas' es un saludo, no una despedida" -->

#### Scenario: La IA contesta solo 👍
- **WHEN** la respuesta de la IA es solo 👍
- **THEN** sale como reacción al mensaje del cliente
<!-- test: src/agente/atender.test.js › "si Agustina contesta solo 👍, sale como reacción al mensaje del cliente" -->

### Requirement: Si la IA falla, responde un mensaje de respaldo y deriva
Si Claude falla, rechaza el pedido, corta por largo, no devuelve texto o insiste con
herramientas pasado el límite, el sistema MUST responder el mensaje de respaldo ("un vendedor
te va a contactar") y marcar la consulta para un vendedor. MUST NOT mandar un texto a medias.
<!-- id: agente.responderConIA -->

#### Scenario: Claude rechaza el pedido
- **WHEN** Claude rechaza el pedido
- **THEN** se responde el respaldo y se deriva
<!-- test: src/agente/agente.test.js › "si Claude rechaza el pedido, respaldo y derivación" -->

#### Scenario: Falla la API
- **WHEN** la API de Claude falla
- **THEN** se responde el respaldo, sin romper
<!-- test: src/agente/agente.test.js › "si la API de Claude falla, respaldo sin romper" -->

#### Scenario: Sin texto
- **WHEN** Claude no devuelve texto
- **THEN** se responde el respaldo
<!-- test: src/agente/agente.test.js › "si Claude no devuelve texto, respaldo" -->

#### Scenario: Respuesta cortada por largo
- **WHEN** la respuesta se corta por largo
- **THEN** se responde el respaldo y no se manda el texto a medias
<!-- test: src/agente/agente.test.js › "si la respuesta se corta por largo, respaldo (no se manda un texto a medias)" -->

#### Scenario: El agente pide derivar
- **WHEN** el agente pide derivar
- **THEN** la consulta queda marcada para un vendedor
<!-- test: src/agente/atender.test.js › "si el agente pide derivar, la sesión queda marcada para un vendedor" -->

### Requirement: Cómo se llama a Claude
El sistema MUST usar el modelo `claude-haiku-5-5`, con esfuerzo bajo, sin `temperature` y con
herramientas estrictas. Cada llamada MUST tener timeout de 30 segundos y un solo reintento.
Las herramientas MUST ejecutarse de a una, en el orden pedido. Sus resultados MUST volver a
Claude junto con su razonamiento intacto; un error de herramienta MUST volver marcado como error.
<!-- id: agente.responderConIA -->

#### Scenario: Parámetros de la llamada
- **WHEN** se llama a Claude
- **THEN** va con Haiku 5.5, esfuerzo bajo, sin temperature y herramientas estrictas
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

### Requirement: La respuesta sale aunque falle el guardado
Después de gastar en Claude, el sistema MUST entregar la respuesta aunque falle guardar la
respuesta o actualizar la consulta. El fallo MUST quedar en el log.
<!-- id: atender.cerrarTurno -->

#### Scenario: Falla el guardado después de gastar
- **WHEN** falla guardar la respuesta después de llamar a Claude
- **THEN** el cliente igual la recibe
<!-- test: src/agente/atender.test.js › "si falla guardar la respuesta después de gastar, el cliente igual la recibe" -->

### Requirement: Una respuesta es un solo mensaje de WhatsApp
El sistema MUST armar cada respuesta como UN mensaje de la Cloud API, listo para que n8n solo
lo mande; los mensajes fijos también.

Con fotos:
- la primera foto válida (https, JPG o PNG) MUST ir arriba del texto, con un botón "Ver todas las fotos" a la ficha web;
- si el texto pasa los 1024 caracteres, texto y foto MUST ir separados;
- sin texto, MUST llevar "Te paso las fotos 👇".

Una reacción sin el id del mensaje MUST NOT salir. Sin texto ni fotos, no sale nada.
<!-- id: envios.enviosDeRespuesta -->

#### Scenario: Respuesta de texto
- **WHEN** la respuesta es solo texto, aunque tenga varios párrafos
- **THEN** sale un solo mensaje, ya armado para n8n
<!-- test: src/agente/envios.test.js › "una respuesta de texto sale en UN solo mensaje, aunque tenga varios párrafos" -->
<!-- test: src/agente/atender.test.js › "la respuesta sale en UN solo mensaje de WhatsApp, ya armado para n8n" -->
<!-- test: src/routes/agente.routes.test.js › "texto: lo atiende el agente y devuelve a quién y los mensajes ya armados para WhatsApp" -->

#### Scenario: Con fotos y link a la ficha
- **WHEN** la respuesta lleva fotos y hay link a la ficha
- **THEN** sale un mensaje con la primera foto arriba, el texto y el botón a la ficha
<!-- test: src/agente/envios.test.js › "con fotos: un solo mensaje con la primera foto arriba, el texto y un botón a la ficha" -->

#### Scenario: Con fotos sin link a la ficha
- **WHEN** la respuesta lleva fotos pero no hay link a la ficha
- **THEN** sale una foto con el texto abajo, en un solo mensaje
<!-- test: src/agente/envios.test.js › "con fotos pero sin link a la ficha: una foto con el texto abajo, en un solo mensaje" -->

#### Scenario: Texto más largo que el botón
- **WHEN** hay fotos y el texto pasa los 1024 caracteres
- **THEN** el texto y la foto salen por separado
<!-- test: src/agente/envios.test.js › "con fotos y un texto más largo de lo que entra en el botón (1024): el texto y la foto por separado" -->

#### Scenario: Fotos sin texto
- **WHEN** hay fotos y no hay texto
- **THEN** el mensaje igual lleva un texto
<!-- test: src/agente/envios.test.js › "con fotos y sin texto, el mensaje igual lleva un texto (Meta no acepta el cuerpo vacío)" -->

#### Scenario: Fotos que Meta no acepta
- **WHEN** una foto es .webp o no es https
- **THEN** no va arriba; si ninguna sirve, sale el texto con el botón, o solo el texto
<!-- test: src/agente/envios.test.js › "solo usa fotos que Meta acepta (https y JPG/PNG): una .webp o sin https no va arriba" -->
<!-- test: src/agente/envios.test.js › "si ninguna foto sirve, igual sale UN mensaje con el texto y el botón a la ficha" -->
<!-- test: src/agente/envios.test.js › "si ninguna foto sirve y no hay ficha, sale el texto solo" -->

#### Scenario: Reacción
- **WHEN** la respuesta es una reacción
- **THEN** sale sin texto; sin el id del mensaje no sale nada
<!-- test: src/agente/envios.test.js › "una reacción al mensaje del cliente: gratis, no lleva texto" -->
<!-- test: src/agente/envios.test.js › "una reacción sin el id del mensaje no se puede mandar: no sale nada" -->

#### Scenario: Nada para mandar
- **WHEN** no hay texto ni fotos
- **THEN** no sale nada
<!-- test: src/agente/envios.test.js › "sin texto ni fotos no sale nada" -->

#### Scenario: Mensaje fijo
- **WHEN** se responde un mensaje fijo (sin IA)
- **THEN** también sale en un solo envío
<!-- test: src/agente/atender.test.js › "los mensajes fijos (sin IA) también salen en un solo envío" -->

### Requirement: Reparto por turnos de las consultas nuevas
Cada consulta nueva sin link de asesor válido, y sin asesor que heredar, MUST asignarse por turnos
entre los asesores habilitados, con `atribuido` en falso. Habilitado MUST significar: asesor activo, no
borrado, con "recibe consultas" y que no esté vinculado a una cuenta de administrador vigente
(`usuarios.vendedor_id` con rol admin, activa y no borrada).
<!-- id: reparto.idsDelTurno -->

#### Scenario: Rotación
- **WHEN** llegan seis consultas sin link con tres asesores habilitados y uno excluido
- **THEN** reciben 1, 2, 3, 1, 2, 3 y el excluido nunca recibe
<!-- test: src/agente/reparto.test.js › "seis consultas sin link rotan 1, 2, 3, 1, 2, 3 y nunca llegan al excluido, al inactivo ni al borrado" -->
<!-- test: src/agente/atender.test.js › "seis consultas nuevas sin link se reparten 1, 2, 3, 1, 2, 3 y el excluido nunca recibe" -->

#### Scenario: El turno no atribuye
- **WHEN** una consulta recibe asesor por turno
- **THEN** queda con `atribuido` en falso
<!-- test: src/agente/reparto.test.js › "el turno asigna sin atribuir" -->

#### Scenario: Administradores
- **WHEN** un asesor está vinculado a una cuenta de administrador vigente
- **THEN** no recibe del turno; una cuenta de administrador dada de baja o un usuario asesor no lo excluyen
<!-- test: src/agente/reparto.test.js › "el asesor vinculado a una cuenta de administrador no recibe del turno" -->
<!-- test: src/agente/reparto.test.js › "una cuenta de administrador dada de baja o un usuario asesor no excluyen al vendedor" -->

### Requirement: Orden del turno y puntero
El turno MUST seguir el orden de `id` y dar la vuelta. El último asesor que recibió por turno MUST
guardarse en `configuracion.reparto_ultimo_vendedor`; el siguiente es el primero habilitado con `id` mayor,
o el primero si no hay. El puntero MUST avanzar solo cuando se asigna. Elegir y guardar MUST hacerse en una
transacción que lee el puntero con `SELECT ... FOR UPDATE` parametrizado, para que dos consultas
simultáneas no reciban el mismo turno.
<!-- id: reparto.asesorPorTurno -->

#### Scenario: Puntero
- **WHEN** el último que recibió ya no está habilitado, es mayor que todos, o el puntero es ilegible
- **THEN** el turno sigue con el primero de `id` mayor, o vuelve al primero
<!-- test: src/agente/reparto.test.js › "el siguiente es el primero con id mayor al último, aunque el último ya no esté" -->
<!-- test: src/agente/reparto.test.js › "si el último es mayor que todos los elegibles, vuelve al primero" -->
<!-- test: src/agente/reparto.test.js › "un puntero ilegible arranca desde el primero" -->
<!-- test: src/agente/reparto.test.js › "el puntero queda guardado en la configuración con el id del último que recibió" -->

#### Scenario: Consultas simultáneas
- **WHEN** seis consultas piden turno al mismo tiempo
- **THEN** ninguna repite turno antes de dar la vuelta, porque el puntero se lee con `FOR UPDATE` dentro de una transacción
<!-- test: src/agente/reparto.test.js › "seis consultas simultáneas reciben seis turnos distintos: ninguno se repite antes de dar la vuelta" -->
<!-- test: src/agente/reparto.test.js › "el turno lee el puntero con SELECT ... FOR UPDATE parametrizado dentro de una transacción" -->

### Requirement: Sin reparto o sin asesores habilitados
Con el reparto apagado (`reparticion_equitativa` en `0`) o sin ningún asesor habilitado, la consulta MUST
quedar sin asignar y el puntero MUST NOT moverse. Sin la fila `reparticion_equitativa`, el reparto MUST
considerarse encendido. Si el turno falla (deadlock, timeout), la consulta MUST quedar sin asignar y el
mensaje MUST atenderse igual; solo un deadlock se reintenta, una vez.
<!-- id: reparto.asesorPorTurno.sinReparto -->

#### Scenario: Reparto apagado
- **WHEN** `reparticion_equitativa` está en `0`
- **THEN** la consulta queda sin asignar y el puntero no se mueve
<!-- test: src/agente/reparto.test.js › "con el reparto apagado nadie recibe y el puntero no se mueve" -->
<!-- test: src/agente/atender.test.js › "con el reparto apagado las consultas sin link quedan sin asignar" -->

#### Scenario: Encendido por defecto
- **WHEN** no existe la fila `reparticion_equitativa`
- **THEN** el reparto funciona
<!-- test: src/agente/reparto.test.js › "sin la fila de configuración el reparto está encendido" -->

#### Scenario: El turno falla
- **WHEN** la transacción del turno falla, o da deadlock otra vez en el reintento
- **THEN** la consulta se crea sin asignar, el error se registra y el mensaje se guarda y se responde
<!-- test: src/agente/reparto.test.js › "si la transacción del turno falla, la consulta queda sin asignar y el error se registra" -->
<!-- test: src/agente/reparto.test.js › "si el reintento del deadlock también falla, queda sin asignar y no se reintenta de nuevo" -->
<!-- test: src/agente/atender.test.js › "si el turno falla, la consulta se crea igual sin asesor y el mensaje se guarda y se responde" -->

#### Scenario: Deadlock reintentado
- **WHEN** la transacción del turno da deadlock una vez y el reintento sale bien
- **THEN** se asigna el turno y el puntero avanza
<!-- test: src/agente/reparto.test.js › "un deadlock (P2034) se reintenta una vez y, si el reintento sale bien, asigna y avanza el puntero" -->

#### Scenario: Aislamiento de la transacción
- **WHEN** se abre la transacción del turno
- **THEN** pide READ COMMITTED, con tope de espera y de duración
<!-- test: src/agente/reparto.test.js › "la transacción del turno pide READ COMMITTED con tope de espera y de duración" -->

#### Scenario: Ningún asesor participa
- **WHEN** no hay ningún asesor habilitado
- **THEN** la consulta queda sin asignar y el puntero no se mueve
<!-- test: src/agente/reparto.test.js › "si ningún asesor participa queda sin asignar y el puntero no se mueve" -->
<!-- test: src/agente/atender.test.js › "si ningún asesor participa, la consulta queda sin asignar" -->

### Requirement: Solo se reparte al crear la consulta
Una consulta abierta sin asesor MUST NOT reasignarse en mitad de la charla, salvo por el link de un
asesor. Una consulta vencida MUST NOT conservar su asesor: la que se abre después va por turno.
<!-- id: atender.sesionDe.soloAlCrear -->

#### Scenario: Solo al crear la consulta
- **WHEN** llega un mensaje sin link a una consulta abierta sin asesor
- **THEN** no se reasigna; si la consulta estaba vencida, la nueva va por turno
<!-- test: src/agente/atender.test.js › "una consulta abierta sin asesor no se reparte en mitad de la charla" -->
<!-- test: src/agente/atender.test.js › "una consulta vencida no sigue con su asesor: la nueva va por turno" -->

### Requirement: El puntero del reparto es interno
`reparto_ultimo_vendedor` MUST NOT salir por la API de configuración ni poder escribirse desde ella.
<!-- id: config.service.puntero -->

#### Scenario: El puntero es interno
- **WHEN** se pide o se actualiza la configuración
- **THEN** `reparto_ultimo_vendedor` no sale en la respuesta y no se escribe
<!-- test: src/services/config.service.test.js › "el puntero del reparto por turnos no sale por la API" -->
<!-- test: src/services/config.service.test.js › "el puntero del reparto por turnos no se puede escribir desde la configuración" -->
