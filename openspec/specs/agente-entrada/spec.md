# agente-entrada

> BORRADOR — extraído del código el 2026-10-30, pendiente de revisión del dueño.
> Fuente: src/routes/agente.routes.js, src/controllers/agente.controller.js,
> src/middlewares/secreto-agente.js, src/agente/whatsapp.js, src/agente/rafagas.js,
> src/agente/atender.js (atenderMensaje, atenderUnaVez).

## Purpose

Cómo entra un mensaje de WhatsApp al agente: quién puede llamarlo, qué se valida
de lo que llega y cómo se evita responder dos veces o de más.

## Requirements

### Requirement: Solo n8n puede hablarle al agente
El sistema MUST atender `POST /api/agente/mensaje` solo si el header `x-agente-secreto`
coincide con `AGENTE_SECRETO`, comparado en tiempo constante. La clave MUST verificarse
antes del límite de pedidos y antes de leer el cuerpo (hasta 12 MB).
<!-- id: secreto-agente.requireSecretoAgente -->

#### Scenario: Pedido sin la clave o con otra
- **WHEN** llega un pedido sin `x-agente-secreto` o con un valor distinto
- **THEN** responde 401 y no atiende nada
<!-- test: src/routes/agente.routes.test.js › "sin la clave de n8n, o con otra, 401 y no se atiende nada" -->

#### Scenario: Backend sin clave configurada
- **WHEN** `AGENTE_SECRETO` falta o tiene menos de 32 caracteres
- **THEN** responde 503 y no atiende nada
<!-- test: src/routes/agente.routes.test.js › "si el backend no tiene AGENTE_SECRETO (o es corto), no atiende: 503" -->

#### Scenario: La clave se revisa antes de leer el cuerpo grande
- **WHEN** llega un pedido de varios MB sin la clave
- **THEN** se rechaza sin parsear el cuerpo ni gastar el cupo de pedidos
<!-- test: FALTA -->

### Requirement: El mensaje tiene que venir firmado por Meta
El sistema MUST verificar la firma `X-Hub-Signature-256` (HMAC-SHA256 del cuerpo crudo
con `WA_APP_SECRET`) y rechazar el pedido si no coincide, aunque la clave de n8n sea correcta.
<!-- id: whatsapp.firmaValida -->

#### Scenario: Firma inválida con la clave de n8n correcta
- **WHEN** la clave de n8n es correcta pero la firma de Meta no coincide
- **THEN** responde 401
<!-- test: src/routes/agente.routes.test.js › "con la firma de Meta inválida, 401 aunque la clave de n8n esté bien" -->

#### Scenario: Cuerpo alterado o firma mal formada
- **WHEN** el cuerpo fue modificado, se firmó con otra clave, o la firma está vacía o mal formada
- **THEN** la firma no es válida
<!-- test: src/agente/whatsapp.test.js › "rechaza un cuerpo alterado, otra clave, firma vacía o mal formada" -->

#### Scenario: Sin secreto de Meta configurado
- **WHEN** `WA_APP_SECRET` no está configurado
- **THEN** ninguna firma es válida
<!-- test: src/agente/whatsapp.test.js › "sin secreto configurado, nada es válido" -->

### Requirement: Solo llega al agente lo que firmó Meta
El sistema MUST rechazar con 400 un pedido sin cuerpo o sin firma, con un cuerpo que no
es JSON, o con un archivo que no corresponde al id del mensaje firmado. Al orquestador
MUST llegar solo lo que trae el mensaje firmado (más el archivo de ese mensaje): nunca
`ahora` ni `topeUsd`.
<!-- id: agente.controller.crearRecibirMensaje -->

#### Scenario: Pedido incompleto o que no es JSON
- **WHEN** faltan campos o el cuerpo no es JSON
- **THEN** responde 400
<!-- test: src/routes/agente.routes.test.js › "pedido sin los campos o con un cuerpo que no es JSON: 400" -->

#### Scenario: Foto con su archivo
- **WHEN** el mensaje firmado trae una foto y n8n manda el archivo con ese mismo id
- **THEN** la foto llega al agente
<!-- test: src/routes/agente.routes.test.js › "foto: pasa el archivo que bajó n8n, si es el del mensaje firmado" -->

#### Scenario: Nota de voz con su archivo
- **WHEN** el mensaje firmado trae una nota de voz
- **THEN** el audio llega al agente
<!-- test: src/routes/agente.routes.test.js › "nota de voz: pasa el audio" -->

#### Scenario: Campos de prueba en el pedido
- **WHEN** el pedido trae `ahora` o `topeUsd`
- **THEN** se ignoran
<!-- test: src/routes/agente.routes.test.js › "nunca toma `ahora` ni `topeUsd` de lo que llega" -->

### Requirement: Lectura del mensaje de WhatsApp
El sistema MUST tomar el primer mensaje del payload. El texto sale del cuerpo, del epígrafe
de una foto o del título del botón tocado. Otros tipos MUST llegar como `[tipo]`. Los avisos
de estado (entregado, leído) MUST NOT tratarse como mensajes.
<!-- id: whatsapp.mensajeDeMeta -->

#### Scenario: Mensaje de texto
- **WHEN** llega un mensaje de texto
- **THEN** se toma su cuerpo
<!-- test: src/agente/whatsapp.test.js › "mensaje de texto" -->

#### Scenario: Foto con epígrafe
- **WHEN** llega una foto con epígrafe
- **THEN** el epígrafe es el texto y el tipo de archivo se toma sin parámetros
<!-- test: src/agente/whatsapp.test.js › "foto con epígrafe: el epígrafe es el texto y el tipo va sin parámetros" -->

#### Scenario: Nota de voz
- **WHEN** llega una nota de voz
- **THEN** se toma el audio, sin texto
<!-- test: src/agente/whatsapp.test.js › "nota de voz" -->

#### Scenario: Ubicación, sticker o documento
- **WHEN** llega una ubicación, un sticker o un documento
- **THEN** llega como un aviso de texto `[tipo]`
<!-- test: src/agente/whatsapp.test.js › "otros tipos (ubicación, sticker, documento) llegan como aviso de texto" -->

#### Scenario: Respuesta a un botón
- **WHEN** el cliente toca un botón
- **THEN** el título del botón se lee como texto
<!-- test: src/agente/whatsapp.test.js › "las respuestas a botones se leen como texto" -->

#### Scenario: Aviso de estado
- **WHEN** Meta avisa que un mensaje se entregó o se leyó
- **THEN** no se responde
<!-- test: src/routes/agente.routes.test.js › "un aviso de estado (entregado, leído) no se responde" -->

### Requirement: Límites de lo que se acepta
El sistema MUST rechazar, sin tocar la base:
- un teléfono con menos de 8 o más de 15 dígitos,
- más de 3 fotos, o fotos que no sean JPEG, PNG, GIF o WEBP,
- audios que no sean OGG, MPEG o MP4,
- archivos de más de ~5 MB,
- textos de más de 4096 caracteres.
<!-- id: atender.atenderMensaje -->

#### Scenario: Número inválido
- **WHEN** el número tiene menos de 8 o más de 15 dígitos
- **THEN** se rechaza sin tocar nada
<!-- test: src/agente/atender.test.js › "un número inválido se rechaza sin tocar nada" -->

#### Scenario: Fotos o texto fuera de límite
- **WHEN** llega una imagen que no es foto, más de 3 fotos o un texto enorme
- **THEN** se rechaza sin tocar nada
<!-- test: src/agente/atender.test.js › "entradas inválidas se rechazan sin tocar nada: imagen que no es foto, más de 3 fotos o texto enorme" -->

#### Scenario: Audio en un formato que no se puede leer
- **WHEN** llega un audio en un formato que no lee Groq
- **THEN** la ruta responde 400
<!-- test: src/agente/atender.test.js › "audio de un formato que Groq no lee: se rechaza" -->
<!-- test: src/routes/agente.routes.test.js › "si el orquestador rechaza la entrada (p. ej. un formato de audio que no se lee), 400" -->

### Requirement: Límite de pedidos por minuto
El sistema MUST aceptar hasta 300 pedidos por minuto en la entrada del agente. Pasado ese
número MUST responder 429 con `Retry-After`.
<!-- id: agente.routes.crearRouterAgente -->

#### Scenario: Se supera el límite
- **WHEN** llega el pedido 301 dentro del mismo minuto
- **THEN** responde 429 con `Retry-After`
<!-- test: src/middlewares/rateLimit.test.js › "F1/F4 — permite hasta max y luego responde 429 con Retry-After" -->
<!-- observacion: el test prueba el middleware en general; no hay test que fije el valor 300 en la ruta del agente -->

### Requirement: Mensajes en ráfaga se responden una sola vez
El sistema MUST esperar 4 segundos después de cada mensaje de un número. Si en ese tiempo
llegan otros del mismo número, MUST responder una sola vez, al último, con todos los textos
juntos y en orden. Los anteriores no responden nada. Un mensaje con foto o audio MUST salir
sin esperar, junto con lo que ya estaba esperando. Cada parte se guarda con su propio id.
<!-- id: rafagas.juntarRafaga -->
<!-- observacion: riesgo aceptado y documentado en el código: si el backend se reinicia durante la espera, esos mensajes se pierden -->

#### Scenario: Un solo mensaje
- **WHEN** llega un solo mensaje y la espera es 0
- **THEN** sigue como está, sin esperar
<!-- test: src/agente/rafagas.test.js › "un mensaje solo sigue como está (sin esperar si la espera es 0)" -->

#### Scenario: Varios mensajes seguidos
- **WHEN** llegan "hola", "vi la amarok" y "sigue disponible?" dentro de la espera
- **THEN** responde el último, una sola vez, con los tres juntos
<!-- test: src/agente/rafagas.test.js › "mensajes seguidos del mismo número: los responde el último, todos juntos" -->
<!-- test: src/agente/atender.test.js › "mensajes seguidos: se responde una sola vez, a todos juntos, y se guarda cada uno" -->
<!-- test: src/routes/agente.routes.test.js › "un mensaje que se juntó con otro de la misma ráfaga no responde (responde el último)" -->

#### Scenario: Mensaje con foto o audio
- **WHEN** llega un mensaje con foto o audio
- **THEN** sale ya, con lo que estaba esperando
<!-- test: src/agente/rafagas.test.js › "un mensaje con foto o audio no espera: sale ya, con lo que estaba esperando" -->

#### Scenario: Números distintos
- **WHEN** escriben dos números distintos al mismo tiempo
- **THEN** sus mensajes no se mezclan
<!-- test: src/agente/rafagas.test.js › "números distintos no se mezclan" -->

#### Scenario: Después de responder
- **WHEN** ya se respondió una ráfaga
- **THEN** el próximo mensaje arranca una ráfaga nueva
<!-- test: src/agente/rafagas.test.js › "después de responder, el próximo mensaje arranca una ráfaga nueva" -->

### Requirement: Un mensaje se atiende una sola vez
El sistema MUST NOT procesar dos veces el mismo mensaje de WhatsApp (mismo `wamid`): ni gastar
en IA ni responder. Dentro del proceso lo frena la ráfaga o la cola; entre procesos, el
índice único de `historial_mensajes.wamid`.
<!-- id: atender.atenderUnaVez -->

#### Scenario: Meta reintenta un mensaje ya atendido
- **WHEN** vuelve a llegar un mensaje que ya fue atendido
- **THEN** no se procesa, no gasta y no se responde
<!-- test: src/agente/atender.test.js › "un reintento del mismo mensaje no se procesa de nuevo (ni gasta ni responde)" -->
<!-- test: src/routes/agente.routes.test.js › "un reintento ya procesado no se responde" -->

#### Scenario: Otro proceso ya lo guardó
- **WHEN** otro proceso ya guardó el mismo `wamid` (choque del índice único)
- **THEN** se toma como duplicado, sin llamar a Claude
<!-- test: src/agente/atender.test.js › "si otro proceso ya guardó el mismo mensaje (choque del índice único), se toma como duplicado sin llamar a Claude" -->

#### Scenario: Reintento dentro de una ráfaga
- **WHEN** el mismo mensaje llega dos veces durante una ráfaga
- **THEN** se toma una sola vez
<!-- test: src/agente/rafagas.test.js › "el mismo mensaje dos veces dentro de la ráfaga (reintento) se toma una sola vez" -->
<!-- test: src/agente/atender.test.js › "un mensaje ya respondido que vuelve a llegar dentro de una ráfaga no se responde de nuevo" -->

#### Scenario: Sin nada para mandar
- **WHEN** el turno no produce ningún envío
- **THEN** la ruta contesta sin pedir que se responda
<!-- test: src/routes/agente.routes.test.js › "sin nada para mandar no se responde" -->

### Requirement: Los mensajes de un mismo número se atienden de a uno
El sistema MUST atender en orden los mensajes simultáneos de un mismo número, uno detrás del
otro, para que los conteos del día y el historial vean siempre el mensaje anterior.
<!-- id: atender.deAUno -->
<!-- observacion: la cola vive en memoria; alcanza mientras el backend sea un solo proceso -->

#### Scenario: Dos mensajes simultáneos del mismo número
- **WHEN** llegan a la vez dos mensajes del mismo número
- **THEN** el segundo se atiende cuando termina el primero
<!-- test: src/agente/atender.test.js › "los mensajes simultáneos de un mismo número se atienden de a uno" -->
