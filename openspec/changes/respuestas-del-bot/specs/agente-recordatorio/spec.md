## ADDED Requirements

### Requirement: Cuándo corresponde el recordatorio
El sistema MUST mandarle un recordatorio al cliente cuando el último mensaje de la consulta es de la asesora
virtual, ese mensaje pregunta o pide algo, pasaron 10 minutos o más (y menos de 60) y el cliente no escribió
después. Reemplaza la regla del 15/10/2026 ("al cliente que deja de responder no se le escribe").
<!-- id: recordatorio.consultasParaRecordar -->

#### Scenario: Deja sin contestar una pregunta
- **WHEN** la asesora preguntó "¿Con cuánto de anticipo contás?" y pasan 10 minutos sin respuesta
- **THEN** el cliente recibe un recordatorio
<!-- test: FALTA -->
<!-- eval: chats simulados › R1 -->

#### Scenario: Todavía no pasaron 10 minutos
- **WHEN** pasaron 9 minutos desde la pregunta
- **THEN** no sale nada
<!-- test: FALTA -->

#### Scenario: El último mensaje no preguntaba nada
- **WHEN** el último mensaje de la asesora no pregunta ni pide nada
- **THEN** no sale nada
<!-- test: FALTA -->

#### Scenario: El cliente ya escribió
- **WHEN** el cliente escribió después de la pregunta
- **THEN** no sale nada
<!-- test: FALTA -->

#### Scenario: Justo a los 10 minutos
- **WHEN** pasaron exactamente 10 minutos desde la pregunta
- **THEN** el recordatorio corresponde
<!-- test: FALTA -->

#### Scenario: Justo a los 60 minutos
- **WHEN** pasaron exactamente 60 minutos desde la pregunta
- **THEN** ya no corresponde
<!-- test: FALTA -->

#### Scenario: El sistema estuvo apagado
- **WHEN** pasó más de una hora desde la pregunta
- **THEN** no sale nada, aunque nunca se haya mandado un recordatorio
<!-- test: FALTA -->

### Requirement: Consultas que no reciben recordatorio
El sistema MUST NOT mandar el recordatorio si la consulta tiene la visita acordada o un "no sabe cuándo
viene", si está derivada a un vendedor, si está tomada por una persona (`bot_pausado`), si el último mensaje
lo escribió un asesor, si el cliente pidió la baja, o si la charla es por un recordatorio de cuota.
<!-- id: recordatorio.consultasParaRecordar -->

#### Scenario: Visita ya acordada
- **WHEN** el cliente ya dijo cuándo viene y deja sin contestar a qué hora
- **THEN** no sale nada
<!-- test: FALTA -->
<!-- eval: chats simulados › R4 -->

#### Scenario: Consulta derivada a un vendedor
- **WHEN** la consulta ya tiene el aviso para un vendedor
- **THEN** no sale nada
<!-- test: FALTA -->

#### Scenario: Consulta tomada por un asesor
- **WHEN** un asesor tomó la charla desde el panel, o fue el último en escribir
- **THEN** no sale nada
<!-- test: FALTA -->

#### Scenario: Charla por una cuota
- **WHEN** el cliente escribió por un recordatorio de pago de una cuota
- **THEN** no sale nada
<!-- test: FALTA -->

### Requirement: Un recordatorio por consulta cada 24 horas
El sistema MUST mandar como máximo un recordatorio por consulta cada 24 horas. Si el cliente tampoco
responde al recordatorio, MUST NOT mandarle otro mensaje.
<!-- id: recordatorio.consultasParaRecordar -->

#### Scenario: No responde al recordatorio
- **WHEN** el cliente recibió el recordatorio y pasan otros 30 minutos sin respuesta
- **THEN** no recibe un segundo mensaje
<!-- test: FALTA -->
<!-- eval: chats simulados › R1 -->

#### Scenario: Responde y vuelve a callar el mismo día
- **WHEN** el cliente respondió al recordatorio, la charla siguió y deja otra pregunta sin contestar una hora después
- **THEN** no recibe otro recordatorio ese día
<!-- test: FALTA -->

### Requirement: Qué dice el recordatorio
El recordatorio MUST ser un solo mensaje corto, escrito por la IA con las instrucciones de la asesora, que
retome su última pregunta con otras palabras. MUST NOT saludar de nuevo, presionar ni agregar datos nuevos.
La IA MUST NOT usar herramientas para escribirlo.
<!-- id: recordatorio.textoDelRecordatorio -->

#### Scenario: Retoma la pregunta
- **WHEN** la pregunta sin contestar era por el anticipo
- **THEN** el recordatorio vuelve sobre el anticipo en una o dos oraciones, sin repetir el mensaje anterior palabra por palabra
<!-- test: FALTA -->
<!-- eval: chats simulados › R1, R2 -->

### Requirement: El cliente avisó que escribía después
Si el cliente había avisado que estaba ocupado, que escribía más tarde o se había despedido, la IA MUST
responder que el recordatorio no corresponde y el sistema MUST NOT mandar nada. La consulta MUST quedar
marcada igual, para no volver a evaluarla cada minuto.
<!-- id: recordatorio.textoDelRecordatorio -->

#### Scenario: Está en el trabajo
- **WHEN** el cliente escribió "ahora estoy en el trabajo, más tarde te escribo" y la asesora igual le dejó una pregunta
- **THEN** no sale el recordatorio
<!-- test: FALTA -->
<!-- eval: chats simulados › R3 -->

### Requirement: Texto fijo si la IA no puede
Si la llamada a la IA falla, o se alcanzó el tope de gasto del mes, el recordatorio MUST salir con el texto
fijo "¿Seguís por ahí? Cuando puedas, contame y seguimos 🙂", salvo que el último mensaje del cliente avise
una demora ("más tarde", "después te escribo", "estoy ocupado", "estoy en el trabajo" y parecidos): en ese
caso MUST NOT salir nada.
<!-- id: recordatorio.textoDelRecordatorio -->

#### Scenario: La IA falla
- **WHEN** la llamada a Claude falla
- **THEN** sale el texto fijo
<!-- test: FALTA -->

#### Scenario: La IA falla y el cliente había avisado
- **WHEN** la llamada a Claude falla y el último mensaje del cliente decía "más tarde te escribo"
- **THEN** no sale nada
<!-- test: FALTA -->

#### Scenario: Tope de gasto alcanzado
- **WHEN** se alcanzó el tope de gasto de IA del mes
- **THEN** sale el texto fijo, sin llamar a Claude
<!-- test: FALTA -->

### Requirement: Cómo sale el recordatorio
El recordatorio MUST salir del backend directo a la WhatsApp Cloud API, con `WA_TOKEN` y
`WA_PHONE_NUMBER_ID`. Si Meta rechaza el envío, el mensaje MUST NOT quedar guardado en la charla, la
consulta MUST quedar marcada igual y el error MUST quedar en el log. MUST NOT reintentarse.
<!-- id: recordatorio.enviarRecordatorio -->

#### Scenario: Envío aceptado
- **WHEN** WhatsApp acepta el mensaje
- **THEN** sale un solo mensaje de texto al número del cliente
<!-- test: FALTA -->

#### Scenario: Meta rechaza el envío
- **WHEN** WhatsApp responde con un error
- **THEN** no queda un mensaje fantasma en la charla y no se reintenta
<!-- test: FALTA -->

### Requirement: Qué queda guardado
El recordatorio enviado MUST quedar guardado en la charla como un mensaje de la asesora virtual, y la
consulta MUST anotar cuándo salió (`recordatorio_en`). MUST NOT cambiar `ultimo_mensaje`, la temperatura ni
el aviso al vendedor. El costo de la IA MUST registrarse como cualquier otra llamada.
<!-- id: recordatorio.enviarRecordatorio -->

#### Scenario: Queda en la charla
- **WHEN** sale un recordatorio
- **THEN** el panel lo muestra como un mensaje del bot y la asesora lo ve en el historial del próximo mensaje
<!-- test: FALTA -->

#### Scenario: No cambia la consulta
- **WHEN** sale un recordatorio
- **THEN** la consulta conserva su último mensaje, su temperatura y su aviso al vendedor
<!-- test: FALTA -->

### Requirement: La consulta se reserva antes de enviar
Antes de escribir o enviar el recordatorio, el sistema MUST reservar la consulta con una sola escritura
condicional sobre `recordatorio_en` (solo si sigue vacío o tiene más de 24 horas). Si la reserva no cambia
ninguna fila, MUST NOT enviar. `recordatorio_en` es entonces el momento en que la consulta se evaluó para un
recordatorio, haya salido o no. Un envío con resultado incierto (timeout) MUST NOT reintentarse.
<!-- id: recordatorio.enviarRecordatorio -->

#### Scenario: Dos revisiones a la vez
- **WHEN** dos revisiones eligen la misma consulta al mismo tiempo
- **THEN** solo una la reserva y sale un único recordatorio
<!-- test: FALTA -->

#### Scenario: Timeout al enviar
- **WHEN** el envío a WhatsApp no responde a tiempo
- **THEN** no se reintenta y la consulta queda reservada
<!-- test: FALTA -->

### Requirement: El recordatorio no pisa un mensaje nuevo
El recordatorio de un número MUST pasar por la misma cola que atiende los mensajes de ese número. Antes de
enviarlo, el sistema MUST volver a comprobar que el cliente no escribió.
<!-- id: recordatorio.enviarRecordatorio -->

#### Scenario: El cliente escribe justo antes
- **WHEN** el cliente escribe mientras se arma el recordatorio
- **THEN** el recordatorio no sale y el cliente recibe solo la respuesta a su mensaje
<!-- test: FALTA -->

### Requirement: Revisión cada minuto y apagado
El backend MUST revisar una vez por minuto si hay recordatorios para mandar, sin superponer dos revisiones.
Los minutos de espera MUST poder cambiarse con `RECORDATORIO_MINUTOS` (por defecto 10); con 0, MUST quedar
apagado. Sin `WA_TOKEN` o `WA_PHONE_NUMBER_ID`, MUST quedar apagado y avisarlo una vez en el log. Los tests
MUST NOT arrancar la revisión automática.
<!-- id: recordatorio.iniciarRecordatorios -->

#### Scenario: Apagado
- **WHEN** `RECORDATORIO_MINUTOS` es 0
- **THEN** no se revisa ni se manda nada
<!-- test: FALTA -->

#### Scenario: Sin credenciales de WhatsApp
- **WHEN** falta `WA_TOKEN` o `WA_PHONE_NUMBER_ID`
- **THEN** la revisión no arranca y queda un aviso en el log
<!-- test: FALTA -->

#### Scenario: Una revisión tarda más de un minuto
- **WHEN** una revisión todavía no terminó cuando toca la siguiente
- **THEN** la siguiente se saltea
<!-- test: FALTA -->
