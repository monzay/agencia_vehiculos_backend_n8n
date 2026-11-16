## ADDED Requirements

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

## MODIFIED Requirements

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
