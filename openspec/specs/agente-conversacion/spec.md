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

### Requirement: Consultas que llegan desde la web
Si el mensaje trae `(REF #<ref>)` del botón "Consultar" de la web, el sistema MUST abrir la
consulta con origen `web`. Si el auto está disponible, MUST pasar a ser el auto de interés;
si no, MUST NOT cargarse, y el agente MUST saber que ya no está.

Si trae `[AS:<slug>]` de un asesor activo y no borrado, la consulta en la que sigue la charla (la nueva o
la abierta) MUST quedar asignada a ese asesor, con `atribuido`, aunque tuviera otro. Si eso le cambia el
asesor a una consulta abierta, la consulta MUST conservar su charla y sus respuestas, quedar marcada para el
asesor nuevo con el motivo "Llegó por tu link", volver a pendiente si estaba atendida y subir al principio
de la lista. El link MUST valer aunque el asesor no participe del reparto por turnos, y MUST NOT gastar
turno. Con un código inexistente, inactivo o borrado, el código MUST ignorarse y la consulta MUST seguir
como si no lo trajera: una consulta nueva va por turno (ver Reparto por turnos de las consultas nuevas) y
una abierta conserva su asesor. El código del asesor MUST quitarse del texto. Una ref o un código con
caracteres raros MUST ignorarse.
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

#### Scenario: El asesor nuevo la recibe completa
- **WHEN** la consulta abierta de Juan, atendida y con respuestas, pasa a Pepito por su link
- **THEN** conserva la charla y las respuestas, queda marcada "Llegó por tu link", pendiente y arriba de la lista
<!-- test: src/agente/atender.test.js › "el link de otro asesor deja la consulta completa para el asesor nuevo: suya, pendiente, arriba, con aviso y con sus respuestas" -->

#### Scenario: Llega por el link de otro asesor y por otro auto
- **WHEN** en el mismo mensaje la consulta abierta de Juan pasa a Pepito por su link y cambia de auto
- **THEN** queda de Pepito, pendiente y arriba, con el motivo "Llegó por tu link. Ahora le interesa <nuevo>, antes <anterior>" (recortado a 120)
<!-- test: src/agente/atender.test.js › "el link de otro asesor y otro auto en el mismo mensaje: misma consulta, de Pepito, pendiente y arriba, con el aviso del link y el del auto" -->

#### Scenario: El link se queda con una consulta sin asignar
- **WHEN** la consulta abierta no tenía asesor y llega con el link de uno
- **THEN** pasa a ser de ese asesor, sin gastar turno
<!-- test: src/agente/atender.test.js › "el link de un asesor se queda con una consulta que estaba sin asignar" -->

#### Scenario: El link del mismo asesor
- **WHEN** el link es del asesor que ya tiene la consulta
- **THEN** no se escribe nada de más: ni aviso ni cambio de orden
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
- **THEN** sigue en la misma consulta con el auto nuevo (ver Otro auto dentro del plazo sigue en la misma consulta)
<!-- test: src/agente/atender.test.js › "desde la web por otro auto dentro del plazo: sigue en la misma consulta, con el auto nuevo y el aviso" -->

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
- el auto de la consulta, si tiene uno: su descripción, su código para usar con las herramientas y si sigue a
  la venta. Si el mensaje viene de la web por ese mismo auto, MUST NOT repetirse;
- lo que tiene anotado del cliente y lo que falta, en orden. Lo anotado MUST presentarse como anotado, con
  el aviso de corregirlo si el cliente lo desmiente;
- las preguntas del recorrido que la asesora hizo en su último mensaje y siguen pendientes, con el aviso de no
  repetirlas si el cliente pregunta otra cosa; en la lista de lo que falta, esas preguntas MUST ir marcadas;
- si hay una visita propuesta, el día en que el cliente la dijo; si además pasaron 12 horas o más, que la
  visita puede haber pasado, con los horarios de la agencia en palabras para coordinar de nuevo;
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
<!-- test: src/agente/atender.test.js › "el contexto dice de qué autos ya se mandaron fotos en la consulta, y cuándo" -->
<!-- test: src/agente/instrucciones.test.js › "el contexto dice las fotos que ya mandó y no pide perdón ni las manda de nuevo" -->

#### Scenario: Visita propuesta días atrás
- **WHEN** el cliente dijo "mañana a la mañana" un miércoles y vuelve a escribir el viernes
- **THEN** el contexto dice que la visita se propuso el miércoles y que pasaron dos días desde el mensaje anterior
<!-- test: src/agente/atender.test.js › "si pasaron cuatro días desde el mensaje anterior, el contexto lo dice y la visita propuesta lleva el día en que se dijo" -->
<!-- test: src/agente/calificacion.test.js › "la visita propuesta lleva el día en que el cliente la dijo" -->
<!-- test: src/agente/atender.test.js › "con una visita propuesta y varios días sin hablar, el contexto trae la línea de volver a coordinar con los horarios" -->
<!-- test: src/agente/instrucciones.test.js › "con una visita propuesta y 12 horas o más sin hablar, el contexto avisa que pudo pasar y manda a consultar horarios_atencion" -->

#### Scenario: Horarios para volver a coordinar
- **WHEN** la visita propuesta pudo haber pasado
- **THEN** el contexto trae los horarios de la agencia en palabras; si no se pueden leer, sale sin ellos y la respuesta no se frena
<!-- test: src/agente/atender.test.js › "con la visita propuesta ya pasada, el contexto trae los horarios de la agencia en palabras" -->
<!-- test: src/agente/atender.test.js › "si no se pueden leer los horarios, el contexto sale sin ellos y la respuesta no se frena" -->
<!-- test: src/agente/instrucciones.test.js › "con una visita pasada y horarios, el contexto los dice en esa misma línea" -->
<!-- test: src/agente/instrucciones.test.js › "horariosEnPalabras escribe la tabla de la agencia agrupando días y marcando la excepción" -->
<!-- test: src/agente/instrucciones.test.js › "horariosEnPalabras con todos los días iguales dice todos los días" -->
<!-- test: src/agente/instrucciones.test.js › "horariosEnPalabras con un día cerrado en el medio lo marca como excepción" -->
<!-- test: src/agente/instrucciones.test.js › "horariosEnPalabras con la tabla vacía da null" -->
<!-- eval: chats simulados › P7 -->

#### Scenario: El auto de la consulta sigue a la venta o no
- **WHEN** se arma la línea del auto de la consulta
- **THEN** dice si sigue disponible o, si ya no, que se lo diga y ofrezca parecidos
<!-- test: src/agente/atender.test.js › "la línea del auto de la consulta dice si sigue disponible" -->
<!-- test: src/agente/atender.test.js › "si el auto de la consulta ya no está a la venta, la línea lo dice" -->
<!-- test: src/agente/instrucciones.test.js › "la línea del auto de la consulta dice si sigue disponible o ya no" -->

#### Scenario: Mensajes seguidos
- **WHEN** el mensaje anterior de la charla es de hace unos minutos
- **THEN** el contexto no agrega la línea del tiempo que pasó
<!-- test: src/agente/atender.test.js › "si el mensaje anterior es de hace unos minutos, el contexto no agrega la línea del tiempo que pasó" -->
<!-- test: src/agente/instrucciones.test.js › "el contexto dice cuánto pasó desde el mensaje anterior solo si fueron 12 horas o más" -->

#### Scenario: Lo anotado se puede corregir
- **WHEN** se arma el contexto con datos ya anotados del cliente
- **THEN** van como anotados, con el aviso de corregirlos si el cliente los desmiente
<!-- test: src/agente/instrucciones.test.js › "lo anotado va presentado como anotado, con el aviso de corregirlo si el cliente lo desmiente" -->

#### Scenario: Pregunta sin contestar
- **WHEN** el último mensaje de la asesora preguntó por el recibo o garante y el cliente no lo contestó
- **THEN** el contexto lo dice, pide no repetir esa pregunta si el cliente pregunta otra cosa, y la marca en lo que falta
<!-- test: src/agente/atender.test.js › "si el último mensaje de la asesora preguntó por el recibo y sigue pendiente, el contexto lo dice" -->
<!-- test: src/agente/instrucciones.test.js › "el contexto lista las preguntas que hizo en su último mensaje, para no repetirlas si el cliente pregunta otra cosa" -->
<!-- test: src/agente/atender.test.js › "en lo que falta, la pregunta del último mensaje de la asesora llega marcada para no repetirla" -->
<!-- test: src/agente/temas-preguntados.test.js › "temasSinContestar: el último mensaje de la asesora preguntó la forma de pago y sigue pendiente" -->
<!-- test: src/agente/temas-preguntados.test.js › "temasSinContestar: solo mira el último mensaje de la asesora (no los anteriores) y saltea los de un asesor humano" -->
<!-- test: src/agente/temas-preguntados.test.js › "marcarPreguntados avisa, dentro de la lista de lo que falta, cuáles ya preguntó y no hay que repetir ahora" -->

#### Scenario: El cliente contestó
- **WHEN** el cliente contestó la última pregunta de la asesora
- **THEN** el contexto no agrega esa línea
<!-- test: src/agente/atender.test.js › "si el cliente contestó la última pregunta de la asesora, el contexto no agrega la línea de pregunta sin contestar" -->
<!-- test: src/agente/instrucciones.test.js › "si no hay preguntas sin contestar, el contexto no agrega esa línea" -->
<!-- test: src/agente/temas-preguntados.test.js › "temasSinContestar: si el tema ya no está pendiente, o el último mensaje no preguntó nada, no hay nada sin contestar" -->

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
El sistema MUST usar el modelo `claude-haiku-5-5`, sin `temperature` y con herramientas estrictas. El nivel
de razonamiento MUST ser bajo: en la medición del 15/11/2026 con los chats simulados, medio y alto no pasaron
más chats y costaron más (`simulacion/esfuerzo.md`). Fuera de producción, `AGENTE_ESFUERZO` (low, medium o
high) MUST poder cambiarlo para medir; en producción MUST ignorarse. Con nivel bajo el máximo de
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

#### Scenario: Nivel para medir
- **WHEN** fuera de producción `AGENTE_ESFUERZO` vale medium
- **THEN** la llamada va con nivel medio y 4096 tokens; en producción se ignora
<!-- test: src/agente/agente.test.js › "el nivel de razonamiento es el de la constante, salvo un AGENTE_ESFUERZO válido fuera de producción" -->
<!-- test: src/agente/agente.test.js › "en producción AGENTE_ESFUERZO se ignora" -->
<!-- test: src/agente/agente.test.js › "el máximo de tokens es 2048 con nivel bajo y 4096 con medio o alto" -->
<!-- test: src/agente/agente.test.js › "la llamada a Claude usa el nivel de AGENTE_ESFUERZO y su máximo de tokens" -->

#### Scenario: Medición del nivel de razonamiento
- **WHEN** se corren los chats simulados con nivel bajo, medio y alto
- **THEN** queda elegido el más bajo con el que pasan todos, con su máximo de tokens
<!-- eval: chats simulados › todos, dos pasadas por nivel (simulacion/esfuerzo.md) -->

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

### Requirement: Pasado el plazo se pregunta todo de nuevo
Una consulta que se abre porque la anterior venció (más de 30 días sin mensajes) MUST nacer sin las
respuestas de las consultas anteriores: forma de pago, anticipo, recibo o garante, usado, quién decide y
visita. El asesor MUST definirse como en toda consulta nueva: el del link si lo trae; si no, por turno
(ver Solo se reparte al crear la consulta). El nombre del cliente MUST seguir siendo el de su ficha.
<!-- id: atender.sesionDe -->

#### Scenario: Vuelve a los 31 días
- **WHEN** un cliente que había respondido todo vuelve 31 días después de su último mensaje, sin link
- **THEN** se abre una consulta nueva sin respuestas, va por turno y a la IA le llega que falta todo
<!-- test: src/agente/atender.test.js › "vuelve a los 31 días con todo respondido y sin link: consulta nueva sin esas respuestas, por turno, y a la IA le falta todo" -->

#### Scenario: Vuelve a los 4 meses por un link
- **WHEN** el cliente vuelve 4 meses después con el link de un asesor
- **THEN** se abre una consulta nueva, sin respuestas ni la charla anterior, asignada y atribuida a ese asesor
<!-- test: src/agente/atender.test.js › "vuelve a los 4 meses con el link de un asesor: consulta nueva sin respuestas ni charla anterior, asignada y atribuida a ese asesor" -->

### Requirement: La IA ve solo la charla de la consulta en curso
El historial que se manda a Claude MUST incluir solo los mensajes del cliente creados desde el inicio de
la consulta en curso (`sesion_inicio`), con los recortes de `agente-cupos` › Recortes antes de mandar a
Claude. Los mensajes anteriores a ese inicio MUST NOT llegar a Claude. Si quedaron consultas superpuestas
de antes (una por auto), los mensajes posteriores a ese inicio MUST entrar igual: son la misma charla.
<!-- id: atender.responderConAgente -->

#### Scenario: Charla de una consulta vencida
- **WHEN** el cliente vuelve a los 31 días y en la consulta anterior había dicho "pago contado"
- **THEN** ese mensaje no llega a Claude
<!-- test: src/agente/atender.test.js › "el 'pago contado' dicho en una consulta vencida no le llega a Claude cuando el cliente vuelve a los 31 días" -->

#### Scenario: Charla dentro del plazo
- **WHEN** el cliente vuelve a los 10 días a la misma consulta
- **THEN** a Claude le llegan los mensajes de esa consulta, incluidos los de hace 10 días
<!-- test: src/agente/atender.test.js › "quien vuelve a los 10 días a la misma consulta: Claude recibe los mensajes de esa consulta, incluidos los de hace 10 días" -->

#### Scenario: Retoma después de una pausa
- **WHEN** el asesor tomó la charla, el cliente y el asesor se escribieron, y después se reanuda el bot dentro del plazo
- **THEN** a Claude le llegan esos mensajes del cliente y las respuestas del asesor
<!-- test: src/agente/atender.test.js › "al retomar después de una pausa dentro del plazo, Claude recibe lo que escribió el cliente mientras el asesor atendía y las respuestas del asesor" -->

#### Scenario: Muchos mensajes de antes
- **WHEN** la consulta vencida tiene 50 mensajes y la nueva tiene 3, el primero en el mismo segundo en que se abrió
- **THEN** a Claude le llegan los 3 de la consulta nueva y ninguno de la vencida
<!-- test: src/agente/atender.test.js › "la consulta vencida tiene 50 mensajes y la nueva 3 (el primero en el mismo instante en que se abrió): Claude recibe solo los 3 de la nueva" -->

#### Scenario: Consultas superpuestas de antes
- **WHEN** el cliente tiene dos consultas vigentes de antes del cambio (una por auto) y el mensaje cae en la del último mensaje
- **THEN** a Claude le llegan los mensajes desde el inicio de esa consulta, sean de una o de otra, y ninguno anterior
<!-- test: src/agente/atender.test.js › "con dos consultas vigentes de antes del cambio, Claude recibe la charla desde el inicio de la del último mensaje, sea de una o de otra, y nada anterior" -->

### Requirement: Una consulta dura 30 días desde el último mensaje
El sistema MUST seguir en la misma consulta (`chat_estado`) mientras su último mensaje sea de hace menos
de 30 días; con 30 días justos o más, MUST abrir una nueva. Dentro del plazo, la consulta MUST conservar
su asesor y sus respuestas. Cada consulta nueva MUST nacer con `ultimo_mensaje` cargado. Con varias
consultas vigentes, el mensaje MUST caer en la del último mensaje.
<!-- id: atender.sesionDe -->

#### Scenario: Varias consultas abiertas
- **WHEN** el cliente tiene dos consultas vigentes
- **THEN** el mensaje cae en la que tuvo el último mensaje, aunque sea la más vieja
<!-- test: src/agente/atender.test.js › "la conversación sigue en la consulta del último mensaje" -->

#### Scenario: Último mensaje de hace 29 o 31 días
- **WHEN** el último mensaje fue hace 29 días, y en otro caso hace 31 días
- **THEN** a los 29 días se reutiliza la consulta; a los 31 se abre una nueva
<!-- test: src/agente/atender.test.js › "una consulta con el último mensaje de hace 31 días no se reutiliza; una de hace 29 días, sí" -->

#### Scenario: 30 días justos
- **WHEN** el último mensaje fue hace exactamente 30 días
- **THEN** se abre una consulta nueva
<!-- test: src/agente/atender.test.js › "con el último mensaje de hace exactamente 30 días se abre una consulta nueva" -->

#### Scenario: Vuelve a los 10 días
- **WHEN** un cliente que ya dijo cómo paga y si entrega usado vuelve a los 10 días
- **THEN** sigue en la misma consulta, con el mismo asesor, y a la IA le llega que eso ya está respondido
<!-- test: src/agente/atender.test.js › "quien vuelve a los 10 días sigue en la misma consulta, con su asesor, y la IA recibe lo ya respondido" -->

#### Scenario: Consulta nueva
- **WHEN** se abre una consulta
- **THEN** nace con `ultimo_mensaje`, así vence a los 30 días
<!-- test: src/agente/atender.test.js › "la sesión nueva nace con ultimo_mensaje (así vence a los 30 días)" -->

### Requirement: Otro auto dentro del plazo sigue en la misma consulta
Si la IA registra otro auto disponible (`registrar_calificacion`) o el cliente llega desde la web con su
ref, el sistema MUST seguir en la misma consulta con ese auto, sin perder respuestas, usado, visita ni
asesor, y MUST recalcular la temperatura, marcarla para el asesor ("Ahora le interesa <nuevo>, antes
<anterior>"), volverla a pendiente y subirla en la lista. Pedir fotos o comparar MUST NOT contar.
<!-- id: consultas-por-auto.otroAuto -->

#### Scenario: La IA registra otro auto
- **WHEN** dentro del plazo la IA registra un auto de interés distinto al de la consulta
- **THEN** la consulta es la misma, con el auto nuevo, las mismas respuestas y el mismo asesor
<!-- test: src/agente/herramientas.test.js › "registrar_calificacion con otro auto cambia el auto de la misma consulta y registra las respuestas en ella" -->
<!-- test: src/agente/consultas-por-auto.test.js › "otro auto: sigue en la misma consulta y un solo update trae el auto nuevo, la temperatura, el aviso y el orden" -->
<!-- test: src/agente/atender.test.js › "el turno se cierra en la misma consulta cuando la IA registra otro auto" -->

#### Scenario: Llega desde la web por otro auto
- **WHEN** dentro del plazo el cliente llega desde la web con la ref de otro auto disponible
- **THEN** la consulta es la misma, con el auto nuevo
<!-- test: src/agente/atender.test.js › "desde la web por otro auto dentro del plazo: sigue en la misma consulta, con el auto nuevo y el aviso" -->
<!-- test: src/agente/atender.test.js › "desde la web por otro auto con el link de Pepito: sigue la misma consulta, con el auto nuevo, y queda de Pepito" -->

#### Scenario: Aviso al asesor
- **WHEN** la consulta cambia de auto
- **THEN** queda marcada para el asesor con "Ahora le interesa <nuevo>, antes <anterior>", aunque ya estuviera marcada por otro motivo
<!-- test: src/agente/consultas-por-auto.test.js › "el motivo del aviso se recorta a 120 caracteres" -->
<!-- test: src/agente/consultas-por-auto.test.js › "el aviso se pone aunque la consulta ya estuviera marcada por otro motivo, y lo pisa" -->

#### Scenario: Estaba atendida
- **WHEN** la consulta estaba marcada como atendida y cambia de auto
- **THEN** vuelve a pendiente y sube al principio de la lista
<!-- test: src/agente/consultas-por-auto.test.js › "si estaba atendida, vuelve a pendiente: atendido_at y atendido_por quedan en null" -->
<!-- test: src/agente/consultas-por-auto.test.js › "sube en la lista: orden_at es el momento del cambio" -->
<!-- test: src/agente/atender.test.js › "la IA registra otro auto en una consulta atendida: vuelve a pendiente y sube" -->

#### Scenario: Pedir fotos de otro auto
- **WHEN** el cliente pide fotos o compara con otro auto sin registrarlo como interés
- **THEN** la consulta no cambia de auto ni se marca
<!-- test: src/agente/herramientas.test.js › "pedir fotos de otro auto no abre una consulta" -->

#### Scenario: Mismo auto
- **WHEN** la IA registra el mismo auto que ya tiene la consulta
- **THEN** no se marca ni cambia el orden
<!-- test: src/agente/consultas-por-auto.test.js › "el mismo auto no escribe nada" -->
<!-- test: src/agente/herramientas.test.js › "registrar_calificacion con el mismo auto, o si la consulta no tenía auto, sigue en la misma consulta" -->

#### Scenario: Consulta con trámite o seña vigente
- **WHEN** la consulta tiene un trámite o una seña vigente y el cliente se interesa en otro auto
- **THEN** sigue en la misma consulta con el auto nuevo, el trámite o la seña no se tocan, y el asesor recibe el aviso
<!-- test: src/agente/consultas-por-auto.test.js › "con un trámite o una seña vigente sigue en la misma consulta y no los toca" -->

#### Scenario: Una sola consulta vigente
- **WHEN** el cliente cambia de auto dos veces dentro del plazo
- **THEN** sigue teniendo una sola consulta vigente
<!-- test: src/agente/consultas-por-auto.test.js › "dos cambios seguidos siguen siendo una sola consulta" -->

### Requirement: El cliente vuelve a escribir en una consulta atendida
Si llega un mensaje del cliente a una consulta marcada como atendida, el sistema MUST volverla a pendiente,
marcarla para el asesor con "Volvió a escribir" y subirla en la lista (ver `consultas-lista`). Vale también
con el bot en pausa porque un asesor tomó la charla, y en ese caso el bot MUST seguir en pausa. Un mensaje
a una consulta pendiente MUST NOT cambiar su motivo ni su orden.
<!-- id: atender.vuelveAEscribir -->

#### Scenario: Vuelve a los 10 días por el mismo auto
- **WHEN** la consulta está atendida y el cliente escribe 10 días después por el mismo auto
- **THEN** vuelve a pendiente, queda marcada "Volvió a escribir" y sube al principio de la lista
<!-- test: src/agente/atender.test.js › "el cliente escribe 10 días después a una consulta atendida por el mismo auto: vuelve a pendiente, marcada 'Volvió a escribir' y arriba, y el agente responde" -->

#### Scenario: Responde enseguida, con el bot en pausa
- **WHEN** el asesor respondió desde el panel (la consulta quedó atendida y el bot en pausa) y el cliente contesta minutos después
- **THEN** vuelve a pendiente, con el aviso, sube, y el bot sigue en pausa: no responde
<!-- test: src/agente/atender.test.js › "el cliente contesta minutos después de que el asesor respondió con el bot en pausa: vuelve a pendiente con el aviso y sube, y el bot sigue en pausa sin responder" -->

#### Scenario: Consulta pendiente
- **WHEN** la consulta no está atendida y el cliente escribe
- **THEN** no cambia su motivo ni su orden
<!-- test: src/agente/atender.test.js › "el cliente escribe a una consulta pendiente: no cambia su motivo ni su orden" -->

#### Scenario: Vuelve por otro auto
- **WHEN** la consulta está atendida y en el mismo turno el cliente se interesa en otro auto
- **THEN** queda pendiente y arriba, y el motivo que queda es "Ahora le interesa <nuevo>, antes <anterior>"
<!-- test: src/agente/atender.test.js › "el cliente de una consulta atendida llega desde la web por otro auto: queda pendiente y arriba con 'Ahora le interesa <nuevo>, antes <anterior>', no 'Volvió a escribir'" -->
<!-- test: src/agente/atender.test.js › "el cliente de una consulta atendida le pide otro auto a la IA: el motivo que queda es el del auto, no 'Volvió a escribir'" -->

#### Scenario: Vuelve pasado el plazo
- **WHEN** la consulta atendida venció (30 días o más) y el cliente escribe
- **THEN** no se toca: se abre una consulta nueva (ver Pasado el plazo se pregunta todo de nuevo)
<!-- test: src/agente/atender.test.js › "el cliente vuelve a los 31 días a una consulta atendida: no se le toca el aviso y se abre una consulta nueva" -->

### Requirement: El texto no nombra herramientas
Antes de enviar una respuesta de la IA, el sistema MUST revisar que el texto no contenga el nombre de
ninguna herramienta del agente, sin distinguir mayúsculas. Si lo contiene, MUST pedirle a Claude una sola vez
que lo reescriba, sin herramientas. Si la reescritura lo sigue conteniendo, o falla, MUST quitar la oración que
lo nombra. Si no queda texto, vale el mensaje de respaldo.
<!-- id: agente.responderConIA -->

#### Scenario: La respuesta nombra una herramienta
- **WHEN** Claude escribe "te busco algo parecido con buscar_similares"
- **THEN** el sistema pide la reescritura y al cliente le llega un texto sin ese nombre
<!-- test: src/agente/agente.test.js › "si el texto nombra una herramienta, pide una reescritura sin herramientas y manda el texto nuevo" -->

#### Scenario: La reescritura también lo nombra
- **WHEN** el segundo texto sigue nombrando una herramienta
- **THEN** sale sin la oración que la nombra
<!-- test: src/agente/agente.test.js › "si la reescritura sigue nombrando una herramienta, sale sin la oración que la nombra" -->
<!-- test: src/agente/agente.test.js › "si falla la reescritura, igual sale sin la oración que nombra la herramienta" -->

#### Scenario: No queda texto
- **WHEN** todo el texto nombraba herramientas
- **THEN** sale el mensaje de respaldo
<!-- test: src/agente/agente.test.js › "si al quitar las oraciones con nombres internos no queda texto, responde el respaldo" -->

#### Scenario: Otra capitalización
- **WHEN** Claude escribe "Buscar_Similares" o "BUSCAR_AUTOS"
- **THEN** también se detecta
<!-- test: src/agente/agente.test.js › "sinOracionesInternas detecta los nombres de herramientas sin distinguir mayúsculas" -->

#### Scenario: Respuesta normal
- **WHEN** el texto no nombra ninguna herramienta
- **THEN** sale tal cual, sin una llamada extra a Claude
<!-- test: src/agente/agente.test.js › "un texto sin nombres de herramientas sale tal cual, sin una llamada extra a Claude" -->

### Requirement: Las fotos enviadas quedan registradas
Cuando una respuesta sale con fotos, el sistema MUST guardar junto a ese mensaje el código del auto de las
fotos (`historial_mensajes.fotos_ref`, migración 085). Un mensaje sin fotos MUST quedar con ese dato vacío.
<!-- id: atender.cerrarTurno -->

#### Scenario: Respuesta con fotos
- **WHEN** la IA usa `enviar_fotos_auto` para el auto 65 y la respuesta sale con fotos
- **THEN** el mensaje queda guardado con `fotos_ref = "65"`
<!-- test: src/agente/atender.test.js › "una respuesta con fotos se guarda con el código del auto de las fotos (fotos_ref)" -->
<!-- test: src/agente/agente.test.js › "cuando la respuesta sale con fotos, devuelve el código del auto de las fotos" -->

#### Scenario: La herramienta no devolvió fotos
- **WHEN** la IA pide las fotos de un auto que no tiene o no está disponible
- **THEN** el mensaje queda sin `fotos_ref`
<!-- test: src/agente/atender.test.js › "si la herramienta no devolvió fotos, el mensaje se guarda sin fotos_ref" -->
<!-- test: src/agente/agente.test.js › "si la herramienta no devolvió fotos (el auto no tiene o no está disponible), fotosRef es null" -->
<!-- test: src/agente/agente.test.js › "sin fotos en la respuesta, fotosRef es null" -->

### Requirement: La pregunta sin contestar no se repite
Si el último mensaje de la asesora preguntó un tema del recorrido que sigue pendiente, la IA no guardó ese dato
en el turno y la respuesta nueva vuelve a preguntar ese tema, el sistema MUST quitar de la respuesta la oración
que lo pregunta, con su frase de apoyo inmediata ("Así te oriento mejor.", "Con eso…"), antes de guardarla y
enviarla. Si al quitarla no queda texto, MUST salir la respuesta original.
<!-- id: atender.responderConAgente -->

#### Scenario: El cliente pregunta otra cosa
- **WHEN** la asesora preguntó la forma de pago, el cliente pregunta "km?" y la respuesta vuelve a preguntar la forma de pago
- **THEN** sale sin esa pregunta
<!-- test: src/agente/atender.test.js › "si el cliente pregunta otra cosa y la IA repite la pregunta de su último mensaje, la respuesta sale sin esa pregunta" -->
<!-- test: src/agente/atender.test.js › "la pregunta repetida después de un emoji, en la misma línea, también se quita en el camino completo" -->
<!-- test: src/agente/temas-preguntados.test.js › "sinPreguntaRepetida quita la pregunta repetida que va en un párrafo aparte, con su coletilla de apoyo" -->
<!-- test: src/agente/temas-preguntados.test.js › "sinPreguntaRepetida quita la pregunta repetida cuando va en la misma línea y deja el resto" -->
<!-- test: src/agente/temas-preguntados.test.js › "sinPreguntaRepetida quita la pregunta que va en la misma línea después de un emoji, sin coletilla (caso K1)" -->
<!-- test: src/agente/temas-preguntados.test.js › "sinPreguntaRepetida con dos temas sin contestar quita las dos preguntas" -->
<!-- test: src/agente/temas-preguntados.test.js › "sinPreguntaRepetida solo quita la coletilla que sigue a la pregunta quitada y empieza con Así o Con eso" -->
<!-- test: src/agente/temas-preguntados.test.js › "sinPreguntaRepetida no deja líneas vacías colgando" -->
<!-- test: src/agente/temas-preguntados.test.js › "sinPreguntaRepetida no toca una línea anterior ni posterior terminada en coma, solo el fragmento colgando de la misma línea" -->

#### Scenario: El cliente contestó
- **WHEN** la IA guardó en el turno el dato que se había preguntado
- **THEN** la respuesta no se toca
<!-- test: src/agente/atender.test.js › "si el cliente contestó la pregunta, la respuesta no se toca" -->
<!-- test: src/agente/temas-preguntados.test.js › "temasSinGuardar descarta los temas cuyo dato guardó la IA en el turno con registrar_calificacion" -->
<!-- test: src/agente/agente.test.js › "devuelve los campos que la IA guardó con registrar_calificacion en el turno (solo los que no vienen vacíos)" -->

#### Scenario: La respuesta no repite
- **WHEN** la respuesta no vuelve a preguntar el tema
- **THEN** no se toca
<!-- test: src/agente/atender.test.js › "si la respuesta no repite la pregunta del último mensaje, no se toca" -->
<!-- test: src/agente/temas-preguntados.test.js › "sinPreguntaRepetida no toca preguntas de otros temas ni respuestas sin la pregunta repetida" -->

### Requirement: Limpieza final del texto
Antes de guardar y enviar una respuesta de la IA, el sistema MUST quitar el código interno del auto, las
oraciones que valoran el anticipo o los datos del cliente y las que anuncian que guardó datos, y MUST corregir
un precio con símbolos extraños. Si una limpieza dejara el texto vacío, MUST quedar el texto anterior.
<!-- id: agente.responderConIA -->

#### Scenario: Código del auto
- **WHEN** la respuesta dice "el Gol Trend 2019 (REF #65)"
- **THEN** sale sin el código y con la puntuación prolija, sin tocar palabras como "referencia"
<!-- test: src/agente/agente.test.js › "se quita del texto el código del auto (REF #65, (REF 65), ref. 65) y quedan prolijos los espacios y la puntuación" -->
<!-- test: src/agente/agente.test.js › "no toca palabras que solo empiezan con ref (referencia, referido) ni un texto sin código" -->

#### Scenario: Valora el anticipo
- **WHEN** la respuesta dice "¡Muy buen anticipo!"
- **THEN** sale sin esa oración
<!-- test: src/agente/agente.test.js › "sinValoraciones quita la oración que valora el anticipo o los datos del cliente y deja el resto" -->
<!-- test: src/agente/agente.test.js › "sinValoraciones es conservador: no toca oraciones normales y, si quedaría vacío, deja el original" -->

#### Scenario: Anuncia que anotó
- **WHEN** la respuesta dice "¡Anotado, con 5 millones de anticipo!"
- **THEN** sale sin esa oración
<!-- test: src/agente/agente.test.js › "sinAnuncioDeGuardado quita 'anotado', 'lo anoto', 'quedó registrado' y 'ya dejé registrado'" -->

#### Scenario: Precio mal escrito
- **WHEN** la respuesta trae "$19.800.£000"
- **THEN** sale "$19.800.000"
<!-- test: src/agente/agente.test.js › "precioNormalizado corrige un monto con símbolos extraños como $19.800.£000" -->
<!-- test: src/agente/agente.test.js › "la respuesta que sale pasa por las tres limpiezas" -->

### Requirement: Un 👍 suelto no viaja con texto
Si la respuesta de la IA tiene texto y termina con un 👍 en una línea aparte, el sistema MUST quitar ese
👍 antes de enviarla y de guardarla. Una respuesta que es solo 👍 sigue saliendo como reacción.
<!-- id: atender.responderConAgente -->

#### Scenario: Texto con un 👍 al final
- **WHEN** la IA responde "Nos vemos el viernes" y, en otra línea, "👍"
- **THEN** sale "Nos vemos el viernes", sin el 👍
<!-- test: src/agente/agente.test.js › "un 👍 suelto al final de un texto se quita antes de enviar" -->

#### Scenario: Solo 👍
- **WHEN** la IA responde únicamente 👍
- **THEN** sale como reacción, igual que hoy
<!-- test: src/agente/agente.test.js › "un texto que es solo 👍 sigue igual (sale como reacción) y un 👍 en medio de una línea no se toca" -->
