## ADDED Requirements

### Requirement: El chat completo de una consulta
El detalle de una consulta MUST devolver la conversación completa de esa sesión: los mensajes
entrantes (del cliente) y los salientes (del bot y de una persona), ordenados por fecha. Cada
mensaje MUST traer su `autor`: `cliente` (entrante), `bot` (saliente del agente de IA) o
`humano` (saliente con `paso_nodo = "humano"`). La ventana de la sesión se calcula como hoy:
desde su inicio hasta el inicio de la sesión siguiente del mismo cliente.
<!-- id: consultas.service.obtenerConsulta -->

#### Scenario: Chat con mensajes del bot y del cliente
- **WHEN** se abre una consulta que tuvo ida y vuelta con el bot
- **THEN** devuelve entrantes y salientes intercalados por fecha, cada uno con su `autor`
<!-- test: src/services/consultas.service.test.js › "el chat trae los mensajes del cliente, del bot y de una persona, en orden y con su autor" -->

#### Scenario: Mensaje escrito por una persona
- **WHEN** un saliente tiene `paso_nodo = "humano"`
- **THEN** su `autor` es `humano`, distinto del `bot`
<!-- test: src/mappers/consulta.mapper.test.js › "el autor del mensaje sale de la dirección y el paso: cliente, bot o humano" -->

#### Scenario: Se conservan las respuestas estructuradas
- **WHEN** se abre una consulta
- **THEN** sigue devolviendo las respuestas pregunta→respuesta además del chat
<!-- test: src/services/consultas.service.test.js › "el detalle trae las respuestas de la sesión y los mensajes del cliente con su pregunta" -->

### Requirement: Tomar la conversación pausa al bot y la marca atendida
Cuando una persona manda el primer mensaje desde el panel, el sistema MUST poner
`sesiones.bot_pausado = true` antes de enviar y MUST marcar la consulta como atendida
(`atendido_at` y `atendido_por` con el usuario que intervino). La conversación queda "tomada":
ver `agente-entrada` › "Con la conversación tomada por una persona, el bot no responde".
<!-- id: consultas.service.responderComoHumano -->

#### Scenario: Primer mensaje del asesor
- **WHEN** el asesor manda un mensaje en una consulta con el bot activo
- **THEN** `bot_pausado` pasa a `true` y la consulta queda atendida con quién y cuándo
<!-- test: src/services/consultas.service.test.js › "responder como persona: envía por WhatsApp, pausa el bot, marca atendida y guarda el saliente humano" -->

#### Scenario: Sesión inexistente
- **WHEN** se intenta intervenir una sesión que no existe
- **THEN** responde 404 sin tocar nada
<!-- test: src/services/consultas.service.test.js › "responder en una consulta que no existe da no_encontrada" -->

### Requirement: Responder como persona por WhatsApp
Un mensaje escrito desde el panel MUST enviarse al cliente por WhatsApp y guardarse como
saliente con `paso_nodo = "humano"` y la fecha del envío. MUST guardarse **solo si el envío a
Meta fue exitoso**: si Meta rechaza el mensaje, el sistema MUST devolver el error y NO dejar un
saliente fantasma en el historial. El texto MUST validarse y el teléfono MUST ir en formato de WhatsApp.
<!-- id: consultas.service.responderComoHumano -->

#### Scenario: Teléfono guardado sin código de país
- **WHEN** la ficha tiene el teléfono en 10 dígitos o con `549` adelante
- **THEN** se envía como `54` + los 10 dígitos
<!-- test: src/services/consultas.service.test.js › "el teléfono se manda a Meta en formato de WhatsApp, sea cual sea cómo está guardado" -->

#### Scenario: Teléfono que no se puede convertir
- **WHEN** el teléfono de la ficha no es un celular argentino reconocible
- **THEN** no llama a Meta, no toca el historial ni la sesión, y avisa `sin_telefono`
<!-- test: src/services/consultas.service.test.js › "teléfono que no se puede convertir a WhatsApp: no envía a ciegas y avisa" -->

#### Scenario: Envío exitoso
- **WHEN** el asesor manda un texto válido y Meta lo acepta
- **THEN** sale por WhatsApp y queda un saliente `humano` en el historial
<!-- test: src/services/consultas.service.test.js › "responder como persona: envía por WhatsApp, pausa el bot, marca atendida y guarda el saliente humano" -->

#### Scenario: Meta rechaza el envío
- **WHEN** la Graph API devuelve un error
- **THEN** responde error y no guarda ningún saliente
<!-- test: src/services/consultas.service.test.js › "si Meta rechaza el envío, no se guarda ningún saliente ni se pausa el bot" -->

#### Scenario: Texto inválido
- **WHEN** el texto está vacío o supera 4096 caracteres
- **THEN** responde 400 sin enviar nada
<!-- test: src/services/consultas.service.test.js › "texto vacío o demasiado largo: no envía y avisa" -->

### Requirement: Envío saliente directo a la Graph API
El sistema MUST enviar el mensaje del panel a la WhatsApp Cloud API con `WA_TOKEN` y
`WA_PHONE_NUMBER_ID`, reusando el armado de cuerpos de `enviosDeRespuesta` (un mensaje de
texto). Si falta `WA_TOKEN` o `WA_PHONE_NUMBER_ID`, el sistema MUST fallar con un error claro,
sin intentar el envío.
<!-- id: whatsapp-envio.enviarTexto -->

#### Scenario: Falta la configuración de WhatsApp
- **WHEN** no está `WA_TOKEN` o `WA_PHONE_NUMBER_ID`
- **THEN** falla con un error claro y no llama a Meta
<!-- test: src/agente/whatsapp-envio.test.js › "falta WA_TOKEN o WA_PHONE_NUMBER_ID: no llama a Meta y avisa" -->

#### Scenario: Cuerpo del mensaje
- **WHEN** se envía un texto al cliente
- **THEN** el cuerpo es el de un mensaje de texto de la Cloud API, con el teléfono del cliente
<!-- test: src/agente/whatsapp-envio.test.js › "arma el cuerpo de un mensaje de texto de la Cloud API, con el teléfono del cliente" -->

### Requirement: Ventana de 24 h de WhatsApp
Antes de un envío de texto libre desde el panel, el sistema MUST verificar que la ventana de
atención esté abierta: el último mensaje **entrante** del cliente tiene menos de 24 h. Si está
cerrada, MUST NOT enviar y MUST avisar que la ventana venció. El detalle de la consulta MUST
informar si la ventana está abierta para que el panel lo muestre.
<!-- id: consultas.service.ventanaAbierta -->

#### Scenario: Ventana abierta
- **WHEN** el cliente escribió hace menos de 24 h
- **THEN** el envío de texto libre está permitido y el detalle lo informa
<!-- test: src/services/consultas.service.test.js › "el detalle informa si la ventana está abierta y si la tomó una persona" -->

#### Scenario: Ventana cerrada
- **WHEN** el último mensaje del cliente fue hace más de 24 h
- **THEN** el sistema no envía y avisa que la ventana venció
<!-- test: src/services/consultas.service.test.js › "fuera de la ventana de 24 h: no envía y avisa que venció" -->

### Requirement: Devolver la conversación al bot
El sistema MUST poder volver a `sesiones.bot_pausado = false` desde el panel. A partir de ahí
el bot vuelve a responder en la misma sesión.
<!-- id: consultas.service.reanudarBot -->

#### Scenario: El asesor devuelve el control
- **WHEN** el asesor pulsa "Devolver al bot" en una consulta tomada
- **THEN** `bot_pausado` pasa a `false`
<!-- test: src/services/consultas.service.test.js › "devolver la conversación al bot pone bot_pausado en false" -->

### Requirement: Solo usuarios autenticados intervienen
Los endpoints de intervención (ver chat, tomar, responder, devolver) MUST exigir el mismo
usuario autenticado que el resto del panel. Un pedido sin sesión válida MUST responder 401.
Cualquier usuario autenticado MUST poder intervenir cualquier consulta, sin restricción por
asesor asignado (decisión v1).
<!-- id: consultas.routes -->

#### Scenario: Pedido sin autenticar
- **WHEN** se llama a un endpoint de intervención sin sesión válida
- **THEN** responde 401
<!-- test: FALTA -->
<!-- observacion: lo hace cumplir el mismo `requireAuth` que las demás rutas de consultas (GET /:id, PATCH /:id/atendido); falta un test de ruta propio del 401 para estos endpoints -->

