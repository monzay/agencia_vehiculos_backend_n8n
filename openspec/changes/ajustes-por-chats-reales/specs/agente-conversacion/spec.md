## MODIFIED Requirements

### Requirement: Una persona, una ficha
El sistema MUST reconocer al cliente por su número de WhatsApp o por el teléfono de una
ficha que ya existe. Si no existe, MUST crear la ficha y su canal de WhatsApp juntos, en
una transacción, con el teléfono guardado en 10 dígitos. El nombre del perfil de WhatsApp
MUST NOT guardarse en la ficha: una ficha nueva queda sin nombre hasta que el cliente lo dice
o alguien lo carga en el panel. MUST NOT tocar el nombre de las fichas que ya existen.
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

#### Scenario: Ficha nueva con perfil
- **WHEN** escribe un número nuevo cuyo perfil de WhatsApp dice "Mi Reina"
- **THEN** la ficha se crea sin nombre
<!-- test: FALTA -->

#### Scenario: La ficha no tiene nombre
- **WHEN** la ficha no tiene nombre y el perfil sí
- **THEN** la ficha sigue sin nombre
<!-- test: FALTA -->

#### Scenario: Financiación cargada por la web
- **WHEN** un cliente con financiación cargada por la web consulta desde WhatsApp
- **THEN** `mi_financiacion` la encuentra
<!-- test: src/agente/atender.test.js › "quien tenía una financiación cargada por la web: mi_financiacion la encuentra desde su WhatsApp" -->

### Requirement: Despedidas con 👍 en lugar de respuesta
Si la charla está cerrada (visita acordada, "no sabe cuándo viene" o ya derivada a un vendedor)
y el cliente solo agradece o se despide, el sistema MUST reaccionar con 👍 a su mensaje, sin
IA. "Solo agradece" significa: hasta 60 caracteres, sin pregunta, solo palabras de cierre o
emojis. Si la última respuesta de la asesora preguntaba o pedía algo, MUST responder la IA:
un "dale" ahí es un sí. Si falta pedir el nombre (ver `agente-calificacion` › El nombre después
de la visita), MUST responder la IA aunque el cliente solo agradezca. Si la IA contesta solo 👍,
MUST salir como reacción.
<!-- id: cierre.debeReaccionar -->

#### Scenario: Charla cerrada y solo agradece
- **WHEN** la charla está cerrada, el cliente solo agradece, la asesora no había preguntado nada y no falta pedir el nombre
- **THEN** se reacciona con 👍, gratis y sin IA
<!-- test: src/agente/cierre.test.js › "charla cerrada + solo agradece + Agustina no había preguntado nada: se reacciona" -->
<!-- test: src/agente/atender.test.js › "despedida con la charla cerrada: reacción 👍 (gratis) sin llamar a la IA" -->

#### Scenario: Falta pedir el nombre
- **WHEN** acordó la visita, no dijo su nombre, todavía no se le pidió y el cliente escribe "ok, gracias"
- **THEN** no se reacciona: responde la IA, que le pide el nombre
<!-- test: FALTA -->
<!-- eval: chats simulados › X9 -->

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

### Requirement: Limpieza final del texto
Antes de guardar y enviar una respuesta de la IA, el sistema MUST:
- quitar el código interno del auto;
- quitar lo que valora el anticipo o los datos del cliente, incluidas las opiniones sobre si puede financiar
  ("no es impedimento", "sirve para financiar", "queda cubierto", "lo podemos trabajar", "estás en buena
  posición");
- quitar lo que anuncia que guardó datos;
- quitar la presentación ("Soy José, asesor de ventas", con el nombre configurado, y el emoji o la puntuación
  que la siguen) si la asesora ya escribió antes en la consulta en curso. Se quita solo esa frase: un saludo
  que la precede ("¡Hola!") queda. Un segundo auto dentro del plazo sigue en la misma consulta, así que cuenta
  como "ya escribió";
- corregir un precio con símbolos extraños.

Si lo que hay que quitar está en la misma oración que una pregunta ("Perfecto, anotado 👍 ¿Tenés recibo…?"),
MUST quitarse solo esa parte y quedar la pregunta. Si una limpieza dejara el texto vacío, MUST quedar el texto
anterior.
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

#### Scenario: Opina sobre si puede financiar
- **WHEN** la respuesta dice "Monotributo no es impedimento para armarte opciones. ¿Tenés algún auto para dejar como parte de pago?"
- **THEN** sale solo "¿Tenés algún auto para dejar como parte de pago?"
<!-- test: FALTA -->

#### Scenario: Anuncia que anotó
- **WHEN** la respuesta dice "¡Anotado, con 5 millones de anticipo!"
- **THEN** sale sin esa oración
<!-- test: src/agente/agente.test.js › "sinAnuncioDeGuardado quita 'anotado', 'lo anoto', 'quedó registrado' y 'ya dejé registrado'" -->

#### Scenario: "Anotado" en la misma oración que la pregunta
- **WHEN** la respuesta dice "Perfecto, anotado 👍 ¿Tenés recibo de sueldo o contás con un garante?"
- **THEN** sale "¿Tenés recibo de sueldo o contás con un garante?"
<!-- test: FALTA -->

#### Scenario: Se presenta de nuevo
- **WHEN** la asesora ya escribió en la consulta y la respuesta empieza "¡Hola! Soy José, asesor de ventas 🙌 El Fiat Siena 2016 está a $13.500.000."
- **THEN** sale "¡Hola! El Fiat Siena 2016 está a $13.500.000."
<!-- test: FALTA -->

#### Scenario: El nombre del asesor en otra frase
- **WHEN** la asesora ya escribió y la respuesta dice "Cualquier cosa, preguntá por José en la agencia"
- **THEN** no se toca: solo se quita la frase de presentación
<!-- test: FALTA -->

#### Scenario: Primera respuesta de la consulta
- **WHEN** es el primer mensaje de la asesora en la consulta
- **THEN** la presentación sale como la escribió la IA
<!-- test: FALTA -->

#### Scenario: Precio mal escrito
- **WHEN** la respuesta trae "$19.800.£000"
- **THEN** sale "$19.800.000"
<!-- test: src/agente/agente.test.js › "precioNormalizado corrige un monto con símbolos extraños como $19.800.£000" -->
<!-- test: src/agente/agente.test.js › "la respuesta que sale pasa por las tres limpiezas" -->

## ADDED Requirements

### Requirement: El nombre del cliente en el contexto
El nombre del cliente que recibe el agente MUST ser el último que el cliente dijo en una charla, en la consulta
en curso o en una anterior (`sesiones.nombre_declarado`). El nombre de la ficha y el del perfil de WhatsApp
MUST NOT usarse para esto, porque en las fichas que llegaron antes de este cambio es el nombre del perfil. Si
el cliente nunca dijo su nombre, el contexto MUST NOT traer ninguno.
<!-- id: atender.contextoDelTurno -->

#### Scenario: Ficha vieja con el nombre del perfil
- **WHEN** escribe un cliente cuya ficha dice "El Chino" (cargado del perfil antes de este cambio) y nunca dijo su nombre
- **THEN** el contexto no trae nombre
<!-- test: FALTA -->

#### Scenario: Lo dijo en una consulta anterior
- **WHEN** el cliente dijo "soy Claudia" en una consulta que ya venció y escribe en una nueva
- **THEN** el contexto trae "Claudia"
<!-- test: FALTA -->

### Requirement: Las fotos del usado quedan guardadas
Las fotos que el cliente manda en una consulta en las 24 horas siguientes al pedido de fotos del usado
(`fotos_usado_pedidas_at`) MUST guardarse en el Blob privado (el de los papeles), hasta 10 por consulta, y su
pathname en la consulta, nunca una URL firmada. El asesor descarta las que no sean del usado. Un fallo o la
falta de store MUST NOT frenar la respuesta al cliente.
<!-- id: atender.atender -->

#### Scenario: El historial no cambia
- **WHEN** el cliente manda una foto
- **THEN** en el historial queda "[foto]", como hoy
<!-- test: FALTA -->

#### Scenario: Manda fotos después de decir que entrega
- **WHEN** el cliente dijo que entrega un Fox, la asesora le pidió fotos y después manda dos
- **THEN** las dos quedan en el Blob privado y su pathname en la consulta
<!-- test: FALTA -->

#### Scenario: Fotos sin usado
- **WHEN** el cliente manda una foto en una consulta en la que todavía no se pidieron las fotos del usado
- **THEN** no se guarda
<!-- test: FALTA -->

#### Scenario: Pasaron las 24 horas
- **WHEN** las fotos se pidieron el lunes a las 10 y el cliente manda una foto el martes a las 11
- **THEN** no se guarda
<!-- test: FALTA -->

#### Scenario: Lote que pasa el tope
- **WHEN** la consulta tiene 9 fotos guardadas y llegan 3 juntas
- **THEN** se guarda 1 y las otras 2 no; una subida que falló no cuenta para el tope
<!-- test: FALTA -->

#### Scenario: Falla la escritura en la base después de subir
- **WHEN** la foto se subió al Blob pero no se pudo anotar en la consulta
- **THEN** el cliente recibe la respuesta igual, el fallo queda en el log y el archivo suelto en el Blob se tolera (es privado y no se muestra)
<!-- test: FALTA -->

#### Scenario: Falla la subida
- **WHEN** el Blob privado no responde, o no hay store privado configurado
- **THEN** el cliente recibe la respuesta igual, en la consulta no queda ninguna foto a medias y el log registra el fallo sin datos del cliente
<!-- test: FALTA -->

#### Scenario: Tope
- **WHEN** la consulta ya tiene 10 fotos del usado y llega otra
- **THEN** no se guarda
<!-- test: FALTA -->
