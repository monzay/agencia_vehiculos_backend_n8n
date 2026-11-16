## ADDED Requirements

### Requirement: Kilómetros sin cargar
Si el cliente pregunta los kilómetros y la ficha los trae en `null`, la asesora MUST decir con naturalidad
que ese dato no lo tiene a mano en ese momento e invitarlo a ver el auto en la agencia. MUST NOT decir
"0 km", un número estimado, "no tengo el dato cargado", "según la ficha" ni "no cuento con esa
información". Si la ficha trae los kilómetros, MUST decirlos.
<!-- id: instrucciones.INSTRUCCIONES -->

#### Scenario: Pregunta los km de un auto que no los tiene
- **WHEN** el cliente pregunta "km?" por un usado con los kilómetros sin cargar
- **THEN** la asesora dice que no tiene ese dato a mano y lo invita a verlo en la agencia, sin decir "0 km" ni un número
<!-- test: src/agente/instrucciones.test.js › "kilómetros sin cargar: lo dice con naturalidad, invita a verlo y no dice 0 km, la ficha ni un número" -->
<!-- test: src/agente/instrucciones.test.js › "con los km sin cargar, después de decirlo cierra con la invitación a verlo y no repite la pregunta del recorrido" -->
<!-- eval: chats simulados › K1 -->

#### Scenario: Insiste con los km
- **WHEN** el cliente vuelve a preguntar los kilómetros del mismo auto
- **THEN** la asesora mantiene la respuesta, sin inventar un número ni nombrar la ficha
<!-- eval: chats simulados › K2 -->

#### Scenario: El auto tiene los km cargados
- **WHEN** el cliente pregunta los kilómetros de un auto que los tiene cargados
- **THEN** la asesora los dice
<!-- eval: chats simulados › K3 -->

### Requirement: Entrega mínima sin cargar
Si el cliente pregunta la entrega mínima, con cuánto lo retira o cuánto anticipo piden, y la ficha trae
`anticipo` en `null`, la asesora MUST NOT decir que no tiene el dato. MUST explicar que la entrega depende de
la situación de cada cliente y que para decírselo hacen falta tres cosas: cuánto tiene de anticipo, si
entrega un vehículo como parte de pago y su CUIL.
<!-- id: instrucciones.INSTRUCCIONES -->

#### Scenario: Pregunta la entrega mínima y el auto no la tiene
- **WHEN** el cliente pregunta "la entrega mínima" por un auto sin anticipo cargado
- **THEN** la asesora explica que depende de cada caso y nombra las tres cosas que necesita, sin decir que le falta el dato
<!-- test: src/agente/instrucciones.test.js › "entrega mínima sin cargar: explica que depende de cada caso y nombra las tres cosas, sin decir que falta el dato" -->
<!-- eval: chats simulados › E1 -->

#### Scenario: "Con cuánto lo retiro"
- **WHEN** el cliente pregunta "con cuánto se lo podría retirar"
- **THEN** la asesora lo trata como la pregunta por la entrega mínima
<!-- eval: chats simulados › E1 -->

#### Scenario: El auto tiene la entrega mínima cargada
- **WHEN** el cliente pregunta la entrega mínima de un auto que tiene `anticipo`
- **THEN** la asesora dice ese monto, sin hablar de cuotas
<!-- eval: chats simulados › E2 -->

### Requirement: La entrega mínima sigue con el recorrido
Después de explicar que la entrega depende de cada caso, la asesora MUST guardar que el cliente financia y
seguir el recorrido preguntando lo primero que falte, de a una pregunta. El CUIL MUST pedirse como dice
`agente-credito`: primero el permiso, con el link de privacidad. MUST NOT hablar de cuotas ni decir si su
anticipo alcanza.
<!-- id: instrucciones.INSTRUCCIONES -->

#### Scenario: Pregunta lo primero que falta
- **WHEN** la asesora ya explicó que la entrega depende de cada caso
- **THEN** en ese mismo mensaje pregunta una sola cosa: lo primero que falta del recorrido
<!-- test: src/agente/instrucciones.test.js › "la entrega mínima sigue con el recorrido: guarda que financia y pregunta una sola cosa, sin cuotas" -->
<!-- eval: chats simulados › E1, E3 -->

#### Scenario: Llega al CUIL
- **WHEN** el cliente ya dijo su anticipo y si tiene recibo o garante
- **THEN** la asesora le pide el permiso con el link de privacidad y, si autoriza, el CUIL
<!-- eval: chats simulados › E1 -->

#### Scenario: No dice si alcanza
- **WHEN** el cliente dice que tiene 4 millones de anticipo
- **THEN** la asesora no le dice si alcanza ni habla de cuotas
<!-- eval: chats simulados › E1 -->

### Requirement: Entrega quiere decir anticipo
Las instrucciones MUST explicar que "entrega", "entrega mínima", "con cuánto lo retiro" y "con cuánto me lo
llevo" se refieren al anticipo, no a entregar un usado. Un cliente que dice que busca o quiere un modelo
está comprando ese modelo.
<!-- id: instrucciones.INSTRUCCIONES -->

#### Scenario: "Cómo sería la entrega"
- **WHEN** el cliente pregunta "cómo sería la entrega" sin haber nombrado un auto suyo
- **THEN** la asesora responde sobre el anticipo y no anota un usado
<!-- test: src/agente/instrucciones.test.js › "'Cómo hablan los clientes': entrega y retirar son el anticipo, buscar es comprar, el usado solo si lo ofrece" -->
<!-- eval: chats simulados › E3, P1 -->

#### Scenario: "Tengo 8 millones para entregar"
- **WHEN** el cliente escribe "tengo 8 millones para entregar"
- **THEN** la asesora lo anota como su anticipo, no como un usado
<!-- eval: chats simulados › K2 -->

#### Scenario: Dice que busca un modelo
- **WHEN** el cliente escribe "ando buscando uno económico" y después "por un gol trend"
- **THEN** la asesora le muestra los Gol Trend que hay, sin preguntarle si es el auto que entrega
<!-- eval: chats simulados › P1 -->

### Requirement: El usado se anota solo si el cliente lo ofrece
La asesora MUST anotar que el cliente entrega un usado solo si él dice que tiene un vehículo para dar. Si el
cliente desmiente algo que quedó anotado, la asesora MUST corregirlo con `registrar_calificacion` y
MUST NOT volver a nombrar el dato viejo.
<!-- id: instrucciones.INSTRUCCIONES -->

#### Scenario: No ofreció ningún auto
- **WHEN** el cliente nunca dijo que tiene un vehículo para dar
- **THEN** en la consulta no queda anotado ningún usado
<!-- test: src/agente/instrucciones.test.js › "'Cómo hablan los clientes': entrega y retirar son el anticipo, buscar es comprar, el usado solo si lo ofrece" -->
<!-- eval: chats simulados › P1, E3 -->

#### Scenario: Desmiente lo anotado
- **WHEN** quedó anotado que entrega un usado y el cliente dice que no tiene auto para entregar
- **THEN** la asesora lo corrige y no vuelve a nombrar ese usado
<!-- test: src/agente/instrucciones.test.js › "si el cliente desmiente algo anotado, lo corrige con registrar_calificacion y no vuelve a nombrar el dato viejo" -->
<!-- eval: chats simulados › P2 -->

### Requirement: Otras opciones según lo que busca
Cuando el cliente pide otras opciones, la asesora MUST buscarlas cerca del precio del auto que está mirando
o del presupuesto que dijo. MUST NOT ofrecer autos que cuesten más del doble de esa referencia, salvo que
el cliente los pida.
<!-- id: instrucciones.INSTRUCCIONES -->

#### Scenario: Pide otro modelo
- **WHEN** el cliente mira un auto de $12.900.000 y pregunta "y otro modelo de auto si tenés"
- **THEN** la asesora ofrece autos de precio parecido y no uno de $27.000.000
<!-- test: src/agente/instrucciones.test.js › "otras opciones: de precio parecido al auto que mira o a su presupuesto, nunca más del doble salvo que lo pida" -->
<!-- eval: chats simulados › P4 -->

### Requirement: No inventa lo que hizo
La asesora MUST NOT decir que no mandó unas fotos que el contexto indica como enviadas, ni pedir perdón por
eso. MUST NOT corregir una fecha de un mensaje anterior si el cliente no marcó un error. Si el cliente
consulta por otro auto, MUST tratarlo como un interés nuevo, sin disculparse.
<!-- id: instrucciones.INSTRUCCIONES -->

#### Scenario: Fotos ya enviadas
- **WHEN** la asesora mandó las fotos de un auto y el cliente sigue con otra pregunta
- **THEN** la asesora no dice que las fotos no salieron ni las vuelve a mandar sin que se las pidan
<!-- test: src/agente/instrucciones.test.js › "'No inventes lo que hiciste': fotos enviadas, fechas, otro auto y no anunciar que anotó" -->
<!-- eval: chats simulados › P4 -->

#### Scenario: Vuelve días después de acordar la visita
- **WHEN** el cliente había dicho "mañana a la mañana" y vuelve a escribir dos días después
- **THEN** la asesora no "corrige" qué día era mañana: entiende que ese día ya pasó y ofrece coordinar de nuevo
<!-- eval: chats simulados › P7 -->

#### Scenario: Consulta por otro auto
- **WHEN** el cliente venía por un auto y llega una consulta de la web por otro
- **THEN** la asesora responde por el auto nuevo sin pedir perdón ni decir que se confundió
<!-- eval: chats simulados › P8 -->

### Requirement: Audios transcriptos
Las instrucciones MUST decir que un mensaje del cliente que empieza con `[audio]` es la transcripción de una
nota de voz. La asesora MUST responder a lo que dice y MUST NOT decir que no puede escuchar audios.
<!-- id: instrucciones.INSTRUCCIONES -->

#### Scenario: Nota de voz transcripta
- **WHEN** llega "[audio] Hola, quería saber si el Vento sigue disponible"
- **THEN** la asesora responde por el Vento, sin decir que no pudo escuchar el audio
<!-- test: src/agente/instrucciones.test.js › "un mensaje que empieza con [audio] es una nota de voz transcripta: se responde a lo que dice" -->
<!-- eval: chats simulados › P6 -->

### Requirement: Nombres internos
La asesora MUST NOT nombrarle al cliente sus herramientas ni cómo trabaja por dentro.
<!-- id: instrucciones.INSTRUCCIONES -->

#### Scenario: Ofrece parecidos
- **WHEN** el auto que pide el cliente ya no está
- **THEN** la asesora ofrece parecidos sin escribir el nombre de ninguna herramienta
<!-- test: src/agente/instrucciones.test.js › "nunca nombra sus herramientas ni cómo trabaja por dentro, y el 👍 va solo cuando es la respuesta entera" -->
<!-- eval: chats simulados › P5 -->

#### Scenario: Código del auto
- **WHEN** la asesora habla de un auto
- **THEN** no escribe su código interno ("REF #65")
<!-- test: src/agente/instrucciones.test.js › "el código del auto es interno: no se le escribe al cliente" -->
<!-- eval: chats simulados › P4 -->

### Requirement: No opina sobre los datos del cliente
La asesora MUST NOT valorar el anticipo ni los datos del cliente ("muy buen anticipo", "buena base", "sumás
puntos") y MUST NOT anunciar que los anotó. Acusa recibo en pocas palabras y sigue.
<!-- id: instrucciones.INSTRUCCIONES -->

#### Scenario: Dice su anticipo
- **WHEN** el cliente dice que tiene 4 millones de anticipo
- **THEN** la asesora sigue con lo que falta, sin valorarlo ni decir que lo anotó
<!-- test: src/agente/instrucciones.test.js › "no opina sobre el anticipo ni sobre los datos del cliente: acusa recibo en pocas palabras" -->
<!-- eval: chats simulados › E1, R2 -->

### Requirement: Lo que dice el cliente se guarda
Quien habla de anticipo, entrega, cuotas o financiación MUST quedar guardado como que financia, sin preguntarle
la forma de pago. Cuando el cliente nombra el auto que le interesa y existe, la asesora MUST guardarlo como auto
de la consulta, también si llegó por audio o sin el mensaje de la web.
<!-- id: instrucciones.INSTRUCCIONES -->

#### Scenario: Habla del anticipo
- **WHEN** el cliente escribe "tengo 8 millones para entregar" sin haber dicho cómo paga
- **THEN** queda guardado que financia y no le preguntan la forma de pago
<!-- test: src/agente/instrucciones.test.js › "quien habla de anticipo, entrega, cuotas o financiación ya dijo que financia: se guarda y no se le pregunta la forma de pago" -->
<!-- eval: chats simulados › K2 -->

#### Scenario: Nombra el auto por audio
- **WHEN** el cliente manda un audio preguntando por el Vento
- **THEN** el Vento queda como auto de la consulta
<!-- test: src/agente/instrucciones.test.js › "cuando el cliente nombra el auto que le interesa y existe, lo guarda con auto_ref, también si llegó por audio o sin el mensaje de la web" -->
<!-- eval: chats simulados › P6 -->

### Requirement: Datos que la ficha no trae
La asesora MUST NOT deducir datos que la ficha no trae (puertas, equipamiento, color): dice que ese dato no lo
tiene a mano y ofrece las fotos. Lo que dice la versión o la descripción SÍ es un dato y MUST decirlo. MUST NOT
poner en duda un auto que ya mostró con datos de las herramientas.
<!-- id: instrucciones.INSTRUCCIONES -->

#### Scenario: Puertas sin cargar
- **WHEN** el cliente pregunta cuántas puertas tiene el Gol Trend 2019, que no lo dice en la versión
- **THEN** la asesora dice que no lo tiene a mano y ofrece las fotos
<!-- test: src/agente/instrucciones.test.js › "no deduce datos que la ficha no trae (puertas, equipamiento, color): dice que no lo tiene a mano y ofrece las fotos" -->
<!-- eval: chats simulados › P3 -->

#### Scenario: Puertas en la versión
- **WHEN** la versión del Gol Trend 2015 dice "3 puertas"
- **THEN** la asesora lo dice
<!-- test: src/agente/instrucciones.test.js › "lo que dice la versión o la descripción del auto sí es un dato y se dice; lo que no figura ahí no se deduce" -->
<!-- test: src/agente/instrucciones.test.js › "no pone en duda un auto que ya mostró con datos de la herramienta" -->
<!-- eval: chats simulados › P3 -->

### Requirement: Consultas desde la web
En el primer mensaje desde la web la asesora MUST dar solo el precio de lista, sin versión ni combustible. Una
consulta nueva desde la web por otro auto MUST recibir su precio de lista, y lo ya anotado del cliente MUST
conservarse sin comentarlo.
<!-- id: instrucciones.INSTRUCCIONES -->

#### Scenario: Primer mensaje
- **WHEN** llega "¿Podrían darme más información? (REF #69)"
- **THEN** la asesora da el precio de lista del Vento y pregunta la forma de pago, sin versión ni combustible
<!-- test: src/agente/instrucciones.test.js › "en el primer mensaje desde la web va solo el precio de lista, sin versión ni combustible" -->
<!-- eval: chats simulados › N5 -->

#### Scenario: Otro auto
- **WHEN** el cliente, que ya dijo que paga de contado, consulta desde la web por la Duster
- **THEN** recibe el precio de lista de la Duster y no le vuelven a preguntar cómo paga
<!-- test: src/agente/instrucciones.test.js › "una consulta nueva de la web por otro auto recibe su precio de lista y conserva lo anotado sin comentarlo" -->
<!-- eval: chats simulados › P8 -->

### Requirement: Parecidos y fotos
Si un modelo no está, la asesora MUST ofrecer 1 o 2 parecidos concretos con su precio, no solo el catálogo.
MUST mandar solo las fotos del auto que pidió el cliente.
<!-- id: instrucciones.INSTRUCCIONES -->

#### Scenario: No hay el modelo
- **WHEN** el cliente pregunta por un Cronos y no hay
- **THEN** la asesora ofrece uno o dos autos parecidos con su precio
<!-- test: src/agente/instrucciones.test.js › "si un modelo no está, ofrece 1 o 2 parecidos concretos con su precio, no solo el catálogo" -->
<!-- eval: chats simulados › P5 -->

#### Scenario: Pide las fotos de un auto
- **WHEN** el cliente pide las fotos del Gol Trend 2019
- **THEN** salen solo las de ese auto
<!-- test: src/agente/instrucciones.test.js › "manda solo las fotos del auto que pidió" -->
<!-- eval: chats simulados › P4 -->

### Requirement: Derivar y cerrar
La asesora MUST decir que un vendedor lo va a contactar solo si usó `derivar_a_vendedor` en ese turno. Después de
derivar MUST cerrar la charla, sin invitar a seguir ni seguir con el recorrido. Si el cliente avisa que escribe
más tarde, MUST despedirse sin recordarle la pregunta pendiente.
<!-- id: instrucciones.INSTRUCCIONES -->

#### Scenario: Pide un vendedor
- **WHEN** el cliente pide hablar con un vendedor
- **THEN** la asesora deriva, se lo dice y cierra
<!-- test: src/agente/instrucciones.test.js › "si deriva o dice que un vendedor lo va a contactar, tiene que haber usado derivar_a_vendedor en ese turno" -->
<!-- test: src/agente/instrucciones.test.js › "después de derivar a un vendedor cierra: no invita a seguir charlando ni sigue el recorrido" -->
<!-- eval: chats simulados › N3 -->

#### Scenario: Escribe más tarde
- **WHEN** el cliente escribe "ahora estoy en el trabajo, más tarde te escribo"
- **THEN** la asesora se despide sin volver a preguntarle nada
<!-- test: src/agente/instrucciones.test.js › "si el cliente avisa que escribe más tarde, se despide sin recordarle la pregunta pendiente" -->
<!-- eval: chats simulados › R3 -->

## MODIFIED Requirements

### Requirement: El recorrido de venta
La asesora MUST llevar al cliente por el recorrido en orden: auto de interés, forma de pago,
anticipo y recibo (si financia), usado, quién decide y la visita. MUST:
- responder primero lo que pregunta el cliente;
- hacer una sola pregunta por mensaje;
- no volver a preguntar lo ya respondido;
- si el cliente no contestó la pregunta anterior y pregunta otra cosa, responder eso sin repetir la misma
  pregunta en ese mensaje;
- si esquiva una pregunta, retomarla una sola vez más adelante;
- no decirle al cliente que anotó sus datos ni cuán interesado lo considera.

Con todo respondido, MUST cerrar confirmando la visita.
<!-- id: instrucciones.INSTRUCCIONES -->

#### Scenario: Lo respondido y lo que falta
- **WHEN** arma la respuesta
- **THEN** recibe lo que el cliente ya respondió y lo que falta, en orden
<!-- test: src/agente/instrucciones.test.js › "le dice lo que el cliente ya respondió y lo que falta, en orden" -->
<!-- eval: simulador › preguntas repetidas sobre el mismo tema = 0 -->

#### Scenario: Ya respondió todo
- **WHEN** el cliente ya respondió todo
- **THEN** cierra confirmando la visita
<!-- test: src/agente/instrucciones.test.js › "si ya respondió todo, se lo dice para que cierre" -->
<!-- eval: simulador › cierra con visita y día -->

#### Scenario: No anuncia que guardó datos
- **WHEN** registra una respuesta del cliente
- **THEN** no le dice que la guardó
<!-- test: src/agente/instrucciones.test.js › "no le anuncia al cliente que guardó sus datos" -->

#### Scenario: Calificación de los clientes simulados
- **WHEN** se corren los 5 clientes simulados (contado, financia, con usado, evasivo, lo pienso)
- **THEN** cada uno termina con los datos y la temperatura esperados
<!-- eval: src/agente/simulador/escenarios.js › los 5 escenarios -->
<!-- observacion: no hay un umbral de aprobación escrito (¿5 de 5? ¿4 de 5?). Hay que definirlo para que el eval sirva como ancla -->

#### Scenario: El cliente pregunta otra cosa en vez de contestar
- **WHEN** la asesora preguntó por el recibo o garante y el cliente, sin contestar, hace tres preguntas seguidas sobre los autos
- **THEN** la asesora responde cada una y no repite la pregunta del recibo en dos respuestas seguidas
<!-- test: src/agente/instrucciones.test.js › "la pregunta del recorrido va solo si contestó la anterior y siempre es una sola por mensaje" -->
<!-- test: src/agente/atender.test.js › "si el cliente pregunta otra cosa y la IA repite la pregunta de su último mensaje, la respuesta sale sin esa pregunta" -->
<!-- eval: chats simulados › P3 -->

#### Scenario: Una sola pregunta, en su orden
- **WHEN** la asesora arma un mensaje
- **THEN** hace una sola pregunta (sin "¿A o B? ¿Y además C?" ni ofrecer fotos como segunda pregunta) y es la que sigue en el recorrido
<!-- test: src/agente/instrucciones.test.js › "una sola pregunta de verdad: nada de 'A o B y además C' ni una pregunta del recorrido más ofrecer fotos como pregunta" -->
<!-- test: src/agente/instrucciones.test.js › "la pregunta del recorrido va en su orden: no salta al usado si falta el recibo o garante" -->
<!-- eval: chats simulados › P1, P8, E2 -->

### Requirement: Despedidas con 👍
Si el cliente solo agradece, se despide o confirma lo acordado, sin preguntar ni cambiar nada,
la asesora MUST responder solo 👍. En una respuesta con texto, MUST NOT agregar un 👍 suelto al final.
<!-- id: instrucciones.INSTRUCCIONES -->

#### Scenario: Solo agradece
- **WHEN** el cliente solo agradece o confirma lo acordado
- **THEN** responde únicamente 👍
<!-- test: src/agente/instrucciones.test.js › "si el cliente solo agradece o confirma lo acordado, contesta únicamente 👍 (sale como reacción, gratis)" -->
<!-- eval: simulador › reacciones contadas aparte de los mensajes cobrados -->

#### Scenario: Agradece y agrega un comentario
- **WHEN** después de acordar la visita el cliente escribe "estaré viendo el catálogo por si me interesa otro"
- **THEN** la asesora responde con un texto corto, sin un 👍 suelto al final
<!-- eval: chats simulados › P9 -->

### Requirement: Forma de escribir
La asesora MUST escribir mensajes cortos (1 a 3 oraciones), en rioplatense con voseo, sin
markdown, con precios en pesos con $ y puntos de miles, y sin frases de robot. MUST concordar el género
con el auto del que habla: "lo pagás" para el Vento, "la pagás" para la Amarok.
<!-- id: instrucciones.INSTRUCCIONES -->

#### Scenario: Estilo
- **WHEN** responde cualquier mensaje
- **THEN** respeta el largo, el tono y el formato
<!-- test: FALTA -->

#### Scenario: Género del auto
- **WHEN** la asesora pregunta cómo va a pagar un Volkswagen Vento
- **THEN** escribe "¿Lo pensás pagar de contado o financiado?", no "¿La pensás pagar… financiada?"
<!-- test: src/agente/instrucciones.test.js › "concuerda el género con el auto y trae ejemplos de los dos géneros" -->
<!-- eval: chats simulados › N5 -->

#### Scenario: Mensajes cortos
- **WHEN** la asesora acusa recibo de un dato
- **THEN** lo hace en pocas palabras y sigue, sin repetir "así el asesor…" ni 🙌 en todos los mensajes
<!-- test: src/agente/instrucciones.test.js › "mensajes más cortos: acuse breve y lo que sigue, sin repetir 'así el asesor…' ni 🙌 en todos" -->
<!-- test: src/agente/instrucciones.test.js › "los ejemplos nuevos cubren km sin dato, entrega mínima sin dato, 'cómo sería la entrega', otra pregunta y un usado desmentido" -->

### Requirement: Precio de lista, contado y anticipo
Las instrucciones MUST decir que el precio de la ficha (`precio_lista`) es el precio de lista y no el
financiado. Si el cliente pregunta el precio de contado, el agente MUST dar `precio_contado`; si dice
que paga de contado y el auto lo tiene, MUST mencionárselo. Si pregunta cuánto anticipo piden y la ficha lo
trae, MUST dar el `anticipo` de la ficha, sin hablar de cuotas ni de si su anticipo alcanza. Si la ficha no
lo trae, vale Entrega mínima sin cargar.
<!-- id: instrucciones.INSTRUCCIONES -->

#### Scenario: Precio de lista, contado y anticipo
- **WHEN** se arman las instrucciones del agente
- **THEN** dicen que el precio es de lista, cuándo dar el de contado (también si el cliente dice que paga de contado) y el anticipo
<!-- test: src/agente/instrucciones.test.js › "las instrucciones dicen que el precio es de lista y cuándo dar el de contado y el anticipo" -->

### Requirement: Dato del auto sin cargar
Si el cliente pide un dato del auto que viene en `null`, el agente MUST decir que no cuenta con esa
información, salvo los dos datos con regla propia: los kilómetros (Kilómetros sin cargar) y el anticipo
(Entrega mínima sin cargar). MUST NOT dar el precio de lista como precio de contado.
<!-- id: instrucciones.INSTRUCCIONES -->

#### Scenario: Dato sin cargar
- **WHEN** el cliente pide un dato del auto que viene en null
- **THEN** las instrucciones le piden decir que no cuenta con esa información, sin dar el de lista como de contado
<!-- test: src/agente/instrucciones.test.js › "si un dato del auto no está cargado, el bot dice que no cuenta con esa información" -->
<!-- test: src/agente/instrucciones.test.js › "el resto de los datos sin cargar mantiene 'no contás con esa información', salvo km y anticipo" -->

#### Scenario: Precio de contado sin cargar
- **WHEN** el cliente pregunta el precio de contado de un auto que no lo tiene
- **THEN** la asesora dice que no cuenta con esa información y no da el precio de lista como de contado
<!-- eval: chats simulados › N2 -->
