# agente-cupos

> BORRADOR — extraído del código el 2026-10-30, pendiente de revisión del dueño.
> Fuente: src/agente/limites.js, src/agente/atender.js (verificarCupo, responderAudio,
> transcribirAudio), src/agente/agente.js, src/agente/audio.js,
> src/services/ia-consumos.service.js.

## Purpose

Cuánto puede gastar y cuánto puede atender la IA. Todo se decide ANTES de llamar a
Claude o a Groq: si no hay cupo, no se gasta nada y el cliente pasa a un vendedor.

## Requirements

### Requirement: Límite de mensajes por cliente por día
El sistema MUST atender con IA hasta 25 mensajes por cliente por día (día de Argentina).
Desde el mensaje 26 MUST responder el mensaje fijo de "un vendedor te va a responder",
sin IA, y marcar la consulta para un vendedor. Este límite MUST aplicarse incluso al
cliente que ya venía hablando. Solo cuentan los mensajes de la conversación con el agente
(`paso_nodo = agente_ia`).
<!-- id: limites.decidirAtencion -->

#### Scenario: Mensaje 26 del día
- **WHEN** un cliente manda su mensaje 26 del día y todavía hay cupo en el mes
- **THEN** recibe el mensaje fijo, sin IA
<!-- test: src/agente/limites.test.js › "el mensaje 26 del día del mismo cliente: mensaje fijo, aunque haya cupo" -->

#### Scenario: El límite por cliente le gana al que venía hablando
- **WHEN** el cliente ya habló hoy y llega al límite
- **THEN** igual recibe el mensaje fijo
<!-- test: src/agente/limites.test.js › "el límite por cliente gana también al que ya venía hablando" -->

#### Scenario: Pasado el límite se marca para un vendedor
- **WHEN** un cliente supera el límite del día
- **THEN** recibe el mensaje fijo y la consulta queda marcada para un vendedor
<!-- test: src/agente/atender.test.js › "mensaje 41 del día: mensaje fijo y marcado para vendedor" -->
<!-- observacion: el nombre del test dice "41", pero el límite vigente es 25. El test pasa (41 > 25) pero describe una regla vieja: es deriva entre el nombre y la regla -->

#### Scenario: Solo cuenta la conversación del agente
- **WHEN** el cliente tiene mensajes del bot de menús anterior
- **THEN** esos mensajes no cuentan para el límite ni entran al contexto
<!-- test: src/agente/atender.test.js › "el agente arma su contexto y cuenta el límite del día solo con su propia conversación" -->

#### Scenario: El mensaje reserva su lugar antes de llamar a Claude
- **WHEN** llega un mensaje con cupo
- **THEN** se guarda antes de llamar a Claude, así ya cuenta para el límite del día
<!-- test: src/agente/atender.test.js › "el mensaje del cliente se guarda antes de llamar a Claude (reserva el cupo del día)" -->

### Requirement: Gasto máximo por cliente por día
El sistema MUST dejar de usar IA con un cliente que ya gastó US$ 0,50 en el día. Desde ahí
MUST responder el mensaje fijo y marcar la consulta para un vendedor.
<!-- id: limites.decidirAtencion -->

#### Scenario: Cliente que ya gastó US$ 0,50
- **WHEN** un cliente que ya gastó US$ 0,50 hoy escribe de nuevo
- **THEN** pasa a un vendedor sin gastar más
<!-- test: src/agente/limites.test.js › "un cliente que ya gastó US$ 0,50 hoy pasa a un vendedor" -->
<!-- test: src/agente/atender.test.js › "un cliente que ya gastó US$ 0,50 hoy pasa a un vendedor sin gastar más" -->

### Requirement: Tope de gasto del mes
El sistema MUST respetar un tope mensual de gasto en IA (`IA_TOPE_USD_MES`, US$ 10 si no está
configurado). Al llegar al tope:
- un cliente que no habló hoy MUST recibir el mensaje fijo;
- un cliente que ya venía hablando hoy MUST seguir con IA hasta el 110 % del tope;
- pasado el 110 %, MUST cortarse para todos.

En cada caso de corte, la consulta MUST quedar marcada para un vendedor.
<!-- id: limites.decidirAtencion -->
<!-- dueña-futura: ia-costos — el tope y su cálculo; el agente se queda con qué hace al alcanzarlo -->

#### Scenario: Con cupo y dentro del límite
- **WHEN** el gasto del mes está por debajo del tope
- **THEN** atiende la IA
<!-- test: src/agente/limites.test.js › "con cupo y dentro del límite: atiende la IA" -->

#### Scenario: Tope alcanzado y cliente nuevo del día
- **WHEN** se alcanzó el tope y escribe alguien que no habló hoy
- **THEN** recibe el mensaje fijo, sin IA, y queda marcado para un vendedor
<!-- test: src/agente/limites.test.js › "tope alcanzado y cliente nuevo: mensaje fijo" -->
<!-- test: src/agente/atender.test.js › "tope del mes alcanzado y cliente nuevo del día: mensaje fijo, sin IA y marcado para vendedor" -->

#### Scenario: Tope alcanzado y cliente que venía hablando
- **WHEN** se alcanzó el tope y escribe alguien que ya habló hoy
- **THEN** sigue la IA
<!-- test: src/agente/limites.test.js › "tope alcanzado pero el cliente ya venía hablando hoy: sigue la IA" -->
<!-- test: src/agente/atender.test.js › "tope alcanzado pero ya venía hablando hoy: sigue la IA" -->

#### Scenario: Pasado el 110 % del tope
- **WHEN** el gasto del mes supera el 110 % del tope
- **THEN** se corta para todos, aunque vinieran hablando
<!-- test: src/agente/limites.test.js › "pasado el 110% del tope corta a todos, aunque vinieran hablando" -->

#### Scenario: Los límites son los acordados
- **WHEN** se leen los límites configurados
- **THEN** coinciden con los acordados con la agencia
<!-- test: src/agente/limites.test.js › "los límites son los acordados con la agencia" -->

### Requirement: La consulta se marca para un vendedor una sola vez
Al responder un mensaje fijo por falta de cupo, el sistema MUST marcar la consulta para un
vendedor con su motivo. Si la consulta ya estaba marcada, MUST NOT volver a marcarla: se
conserva el motivo original.
<!-- id: atender.cierreDeSesion -->

#### Scenario: Consulta ya marcada
- **WHEN** una consulta ya marcada para un vendedor recibe otro mensaje fijo
- **THEN** no se vuelve a marcar y conserva el motivo original
<!-- test: src/agente/atender.test.js › "con mensaje fijo, una sesión ya marcada para vendedor no se vuelve a marcar" -->

### Requirement: Audios con límite de duración y de costo
El sistema MUST transcribir solo notas de voz de hasta 2 minutos. El control de cupo MUST ir
antes que la transcripción: sin cupo, el audio no se transcribe.
- Si el audio es más largo, o pesa más de 2 MB y no trae su duración, MUST pedir que lo resuma, sin transcribir.
- Si pesa menos de 100 bytes, MUST NOT mandarse a Groq.
- Si la transcripción falla o viene vacía, MUST pedir que lo escriba, sin llamar a Claude.

El costo de Groq MUST sumar al tope del mes. Se toma lo mayor entre lo medido en el archivo
y lo que informa Groq; si Groq mide más de 2 minutos, el texto no llega a Claude.
<!-- id: atender.responderAudio -->

#### Scenario: Audio de más de 2 minutos
- **WHEN** llega un audio de más de 2 minutos
- **THEN** pide que lo resuma, sin transcribir ni llamar a la IA
<!-- test: src/agente/atender.test.js › "audio de más de 2 minutos: pide que lo resuma, sin transcribir ni llamar a la IA" -->
<!-- test: src/agente/limites.test.js › "audios de hasta 2 minutos" -->

#### Scenario: Nota de voz normal
- **WHEN** llega una nota de voz de menos de 2 minutos y hay cupo
- **THEN** se transcribe, el costo de Groq suma al tope y el agente responde al texto
<!-- test: src/agente/atender.test.js › "nota de voz: la transcribe, suma el costo de Groq al tope y el agente responde al texto" -->

#### Scenario: Sin cupo
- **WHEN** llega un audio y el cliente no tiene cupo
- **THEN** no se transcribe
<!-- test: src/agente/atender.test.js › "sin cupo, el audio ni se transcribe" -->
<!-- test: src/agente/atender.test.js › "audio largo de un cliente sin cupo: responde el mensaje de cupo (el control va primero)" -->

#### Scenario: Audio pesado que no es nota de voz
- **WHEN** llega un audio de más de 2 MB que no trae su duración
- **THEN** se responde el mensaje fijo sin transcribir
<!-- test: src/agente/atender.test.js › "audio que no es nota de voz y pesa demasiado: mensaje fijo sin transcribir" -->

#### Scenario: Falla la transcripción
- **WHEN** Groq no puede transcribir el audio
- **THEN** pide que lo escriba, sin llamar a Claude
<!-- test: src/agente/atender.test.js › "si la transcripción falla, le pide que lo escriba sin llamar a Claude" -->

#### Scenario: Audio vacío
- **WHEN** el audio es solo ruido y la transcripción viene vacía
- **THEN** se cobra lo que midió Groq y pide que lo escriba
<!-- test: src/agente/atender.test.js › "un audio vacío (solo ruido) se cobra pero pide que lo escriba" -->

#### Scenario: Audio casi vacío
- **WHEN** el audio pesa menos de 100 bytes
- **THEN** no se manda a Groq
<!-- test: src/agente/atender.test.js › "audio vacío o casi vacío: no se manda a Groq" -->

#### Scenario: Duración falsificada en el archivo
- **WHEN** el archivo ogg declara una duración corta, pero Groq mide más de 2 minutos
- **THEN** se cobra lo que midió Groq y el texto no llega a Claude
<!-- test: src/agente/atender.test.js › "ogg con duración falsificada: se cobra lo que midió Groq y, si pasa los 2 minutos, no llega a Claude" -->

### Requirement: Recortes antes de mandar a Claude
El sistema MUST recortar cada mensaje a 1500 caracteres antes de guardarlo y de mandarlo a
Claude. MUST mandar como máximo los últimos 20 mensajes del historial y hasta 8000 caracteres
en total, quedándose con los más recientes. La respuesta MUST tener como máximo 2048 tokens.
<!-- id: limites.historialParaClaude -->

#### Scenario: Texto largo
- **WHEN** llega un texto de más de 1500 caracteres
- **THEN** se recorta antes de guardarlo y de mandarlo a Claude
<!-- test: src/agente/atender.test.js › "el texto largo se recorta antes de guardarlo y de mandarlo a Claude" -->

#### Scenario: Mensaje largo en el historial
- **WHEN** el historial tiene un mensaje de más de 1500 caracteres
- **THEN** se recorta
<!-- test: src/agente/limites.test.js › "recorta cada mensaje largo del historial" -->

#### Scenario: Historial demasiado largo
- **WHEN** el historial supera los 8000 caracteres
- **THEN** quedan solo los mensajes más recientes
<!-- test: src/agente/limites.test.js › "si el historial es muy largo, quedan solo los mensajes más recientes" -->

### Requirement: Máximo de herramientas por mensaje
El sistema MUST permitir hasta 5 usos de herramientas por respuesta. Pasado eso, MUST pedirle
a Claude que responda con lo que tiene, sin más herramientas. Si insiste, MUST responder el
mensaje de respaldo y derivar a un vendedor.
<!-- id: agente.responderConIA -->

#### Scenario: Pasadas las 5 herramientas
- **WHEN** el agente ya usó 5 herramientas en la misma respuesta
- **THEN** se le pide responder con lo que tiene, sin más herramientas
<!-- test: src/agente/agente.test.js › "pasadas las 5 herramientas, le pide que responda con lo que tiene y sin más herramientas" -->

#### Scenario: Insiste después del límite
- **WHEN** después del límite vuelve a pedir una herramienta
- **THEN** responde el mensaje de respaldo
<!-- test: src/agente/agente.test.js › "si después del límite insiste con herramientas, responde el mensaje de respaldo" -->

### Requirement: Cada llamada a la IA registra su costo
El sistema MUST registrar el costo de cada llamada a Claude y de cada transcripción de Groq,
con el cliente y la consulta. Si falla el registro, la respuesta MUST salir igual y el
consumo completo MUST quedar en el log para cargarlo a mano.
<!-- id: agente.registrarSinCortar -->
<!-- dueña-futura: ia-costos — el registro de consumos lo comparte con el panel de gasto -->


#### Scenario: Respuesta normal
- **WHEN** Claude responde
- **THEN** se registra el costo de la llamada
<!-- test: src/agente/agente.test.js › "responde con el texto de Claude y registra el costo de la llamada" -->

#### Scenario: Falla el registro del costo
- **WHEN** no se puede guardar el costo
- **THEN** igual responde y el error no corta el agente
<!-- test: src/agente/agente.test.js › "si falla registrar el costo, igual responde (y el error no corta el agente)" -->
