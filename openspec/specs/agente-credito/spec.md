# agente-credito

> Decisiones del dueño del 2026-11-01: el semáforo del BCRA es SOLO INFORMATIVO (no suma ni
> resta puntos ni cambia la temperatura), el CUIL se le pide directo al cliente y la regla
> "sin recibo → FRIO" no se toca. El 2026-11-03 el dueño decidió que esté siempre activo, sin
> opción para apagarlo: lo único que lo frena es no tener la política de privacidad publicada.
> La autorización del BCRA y la revisión legal (Ley 25.326) quedan a cargo de la agencia.
> Tras la revisión de código y seguridad (2026-11-01), el dueño decidió: (a) se consulta aunque
> la ficha no tenga DNI contra qué comparar el CUIL; el asesor ve el nombre que da el BCRA y
> verifica en persona (riesgo aceptado: un tercero podría dar un CUIL ajeno); (b) el semáforo
> lo ven todos los usuarios del panel, como el resto de la consulta.
> Fuente: src/credito/*, src/agente/herramientas.js (registrar_consentimiento,
> verificar_situacion_crediticia), src/agente/atender.js, src/mappers/lead.mapper.js,
> src/services/terminos.service.js.

## Purpose

Darle al asesor un dato más sobre el cliente que financia: su situación en la Central de
Deudores del BCRA, resumida en un semáforo. El BCRA no es una financiera: no ve ingresos ni
el scoring de una prendaria, así que el semáforo no decide nada; solo prepara al asesor.

## Requirements

### Requirement: Semáforo crediticio
El sistema MUST resumir la respuesta del BCRA en un semáforo, mirando el último período
informado:

| Semáforo | Cuándo |
|---|---|
| rojo | alguna deuda en situación 3 o peor, irrecuperable por disposición técnica, situación jurídica, proceso judicial, o un cheque SIN FONDOS sin pagar |
| amarillo | alguna deuda en situación 2, refinanciada o recategorizada (y nada rojo) |
| verde | todas las deudas en situación 1 y sin cheques sin fondos impagos |
| sin_datos | el BCRA no informa deudas ni cheques sin fondos impagos de esa persona |

Una deuda "en revisión" MUST NOT empeorar el semáforo por sí sola.
<!-- id: semaforo.semaforoCrediticio -->

#### Scenario: Todo en situación 1
- **WHEN** todas las deudas del último período están en situación 1 y no hay cheques
- **THEN** el semáforo es verde
<!-- test: src/credito/semaforo.test.js › "todas las deudas en situación 1 y sin cheques: verde" -->

#### Scenario: Atraso leve
- **WHEN** alguna deuda está en situación 2, refinanciada o recategorizada
- **THEN** el semáforo es amarillo
<!-- test: src/credito/semaforo.test.js › "situación 2, refinanciación o recategorización: amarillo" -->

#### Scenario: Atraso grave
- **WHEN** alguna deuda está en situación 3 o peor, o con proceso judicial o situación jurídica
- **THEN** el semáforo es rojo
<!-- test: src/credito/semaforo.test.js › "situación 3 o peor, proceso judicial o situación jurídica: rojo" -->

#### Scenario: Cheque sin fondos
- **WHEN** tiene un cheque rechazado SIN FONDOS que no pagó
- **THEN** el semáforo es rojo; si ya lo pagó, no cuenta
<!-- test: src/credito/semaforo.test.js › "cheque sin fondos impago: rojo; pagado no cuenta" -->

#### Scenario: Sin historial
- **WHEN** el BCRA no informa deudas ni cheques sin fondos impagos (un cheque ya pagado no cuenta)
- **THEN** el semáforo es sin_datos, que no es una mala señal
<!-- test: src/credito/semaforo.test.js › "sin deudas ni cheques: sin_datos" -->

#### Scenario: Períodos viejos
- **WHEN** hubo atrasos en un período anterior pero el último está en situación 1
- **THEN** cuenta solo el último período
<!-- test: src/credito/semaforo.test.js › "cuenta solo el último período informado" -->

#### Scenario: Deuda en revisión
- **WHEN** una deuda en situación 1 figura "en revisión"
- **THEN** el semáforo sigue verde
<!-- test: src/credito/semaforo.test.js › "una deuda en revisión no empeora el semáforo" -->

### Requirement: El semáforo es solo informativo
El resultado del BCRA MUST NOT sumar ni restar puntos ni cambiar la temperatura de la
consulta. La IA MUST NOT recibir el resultado (así no puede contárselo al cliente ni
cambiar su trato), y el cliente MUST NOT enterarse por el bot de su semáforo.
<!-- id: herramientas.verificar_situacion_crediticia -->

#### Scenario: La herramienta no devuelve el semáforo
- **WHEN** la IA pide verificar la situación crediticia y el BCRA responde
- **THEN** recibe solo que quedó registrado, sin el semáforo, y la consulta conserva su puntaje y temperatura
<!-- test: src/agente/herramientas.test.js › "verificar_situacion_crediticia no le devuelve el semáforo a la IA ni toca la calificación" -->

#### Scenario: El resumen no toca la sesión
- **WHEN** se guarda el resultado de una consulta al BCRA
- **THEN** no se actualiza la sesión (ni puntaje ni temperatura)
<!-- test: src/credito/verificacion.test.js › "se guarda solo el resumen de la consulta" -->

#### Scenario: Instrucciones del agente
- **WHEN** el agente atiende a alguien con la verificación activa
- **THEN** pide permiso con el link de privacidad, nunca dice el resultado ni si califica, y si le dicen que no, no insiste
<!-- test: src/agente/instrucciones.test.js › "la verificación crediticia: nunca le dice el resultado ni insiste si dice que no" -->

#### Scenario: Sin la verificación conectada
- **WHEN** la IA usa las herramientas de crédito sin que el backend las haya conectado
- **THEN** no hacen nada
<!-- test: src/agente/herramientas.test.js › "sin la verificación conectada, las herramientas de crédito no hacen nada" -->

### Requirement: CUIL de la persona que escribe
El CUIL MUST tener 11 dígitos, un prefijo de persona (20, 23, 24 o 27) y el dígito
verificador correcto ANTES de llamar al BCRA (la API no lo valida y un CUIL mal escrito
devuelve "sin datos"). Si la ficha ya tiene DNI, el CUIL MUST contenerlo; si la ficha ya
tiene otro CUIL, MUST NOT reemplazarse. En esos casos no se consulta.
<!-- id: cuil.validarCuil -->

#### Scenario: CUIL válido
- **WHEN** el cliente da un CUIL con puntos, guiones o espacios y dígito verificador correcto
- **THEN** se acepta y se guarda solo con números
<!-- test: src/credito/cuil.test.js › "acepta un CUIL válido con o sin separadores y devuelve los 11 dígitos" -->

#### Scenario: CUIL inválido
- **WHEN** tiene otro largo, un prefijo de empresa o el dígito verificador mal
- **THEN** se rechaza
<!-- test: src/credito/cuil.test.js › "rechaza largo, prefijo de empresa o dígito verificador incorrectos" -->

#### Scenario: El CUIL contiene el DNI
- **WHEN** se compara el CUIL con el DNI de la ficha
- **THEN** coincide con o sin el cero adelante de un DNI de 7 dígitos
<!-- test: src/credito/cuil.test.js › "el CUIL contiene el DNI de la persona, con o sin cero adelante" -->

#### Scenario: Formulario de la herramienta
- **WHEN** la IA manda en el CUIL algo que no son números y separadores
- **THEN** se rechaza antes de llegar al backend del BCRA
<!-- test: src/agente/herramientas.test.js › "verificar_situacion_crediticia solo acepta números y separadores en el CUIL" -->

#### Scenario: Fusión de fichas
- **WHEN** se unen dos fichas de la misma persona
- **THEN** el CUIL pasa a la que queda si no tenía; con CUIL distintos no se unen (409), y sus consentimientos y consultas pasan a la ficha que queda
<!-- test: src/services/clientes.service.test.js › "la fusión pasa el CUIL del origen si el destino no tiene; con CUIL distintos no se fusionan (409)" -->

#### Scenario: CUIL de otra persona
- **WHEN** el CUIL no contiene el DNI de la ficha, o la ficha ya tiene otro CUIL
- **THEN** no se consulta al BCRA y la IA ofrece un vendedor
<!-- test: src/credito/verificacion.test.js › "un CUIL que no es el de la ficha no se consulta" -->

### Requirement: Consentimiento antes de consultar
El sistema MUST consultar al BCRA solo si la última respuesta del cliente al aviso de
privacidad fue "sí". Cada respuesta (sí o no) MUST guardarse con la versión vigente de los
términos y la fecha. Un "no" posterior MUST revocar el sí anterior. Decir que no MUST NOT
afectar la calificación.
<!-- id: verificacion.registrarConsentimiento -->

El consentimiento MUST guardar el `wamid` del mensaje de WhatsApp en que el cliente respondió,
como prueba.

#### Scenario: Sin consentimiento
- **WHEN** el cliente no dijo que sí, o dijo que no
- **THEN** no se llama al BCRA
<!-- test: src/credito/verificacion.test.js › "sin un sí vigente no se consulta al BCRA" -->

#### Scenario: Registro del consentimiento
- **WHEN** el cliente responde al aviso
- **THEN** queda guardado con la versión de los términos vigente y el wamid de su respuesta
<!-- test: src/credito/verificacion.test.js › "el consentimiento se guarda con la versión vigente de los términos" -->

#### Scenario: El wamid llega desde el mensaje real
- **WHEN** el cliente responde por WhatsApp y la IA registra su respuesta
- **THEN** el orquestador guarda el id de ese mensaje como prueba
<!-- test: src/agente/atender.test.js › "el consentimiento guarda el wamid del mensaje en que el cliente respondió" -->

#### Scenario: Revocación
- **WHEN** dijo que sí y después dijo que no
- **THEN** ya no se consulta
<!-- test: src/credito/verificacion.test.js › "un no posterior revoca el sí" -->

#### Scenario: La IA pasa la respuesta tal cual
- **WHEN** el cliente responde sí o no al aviso
- **THEN** la herramienta registra exactamente esa respuesta
<!-- test: src/agente/herramientas.test.js › "registrar_consentimiento pasa el sí o el no del cliente" -->

### Requirement: Cuándo se consulta
La verificación MUST estar siempre activa, sin opción para apagarla. El sistema MUST consultar
solo si la agencia publicó su política de privacidad, el cliente financia y ya respondió si
tiene recibo o garante. Con pago de contado MUST NOT consultarse.
<!-- id: verificacion.verificarSituacion -->

#### Scenario: Sin política publicada
- **WHEN** la agencia todavía no publicó su política de privacidad
- **THEN** no se pide consentimiento ni se consulta
<!-- test: src/credito/verificacion.test.js › "sin política publicada no se consulta" -->

#### Scenario: Con la política publicada
- **WHEN** la política está publicada
- **THEN** la verificación está activa, sin depender de ninguna configuración
<!-- test: src/credito/verificacion.test.js › "con la política publicada está activa: no depende de ninguna configuración" -->

#### Scenario: No se puede apagar
- **WHEN** alguien intenta guardar un valor para apagarla en la configuración
- **THEN** se ignora
<!-- test: src/services/config.service.test.js › "la verificación del BCRA no se puede apagar desde la configuración" -->

#### Scenario: Paga de contado
- **WHEN** el cliente paga de contado o todavía no dijo lo del recibo o garante
- **THEN** no se consulta
<!-- test: src/credito/verificacion.test.js › "solo se consulta si financia y ya dijo lo del recibo o garante" -->

#### Scenario: Aviso en el contexto
- **WHEN** la verificación está activa y el cliente financia
- **THEN** el contexto del agente lo dice, con el link de privacidad
<!-- test: src/agente/instrucciones.test.js › "con la verificación activa el contexto lo dice con el link de privacidad" -->

#### Scenario: En qué paso está
- **WHEN** se arma el contexto de cada mensaje
- **THEN** pide el permiso si no respondió, el CUIL si dijo que sí, y nada si dijo que no o ya se consultó en los últimos 30 días
<!-- test: src/credito/verificacion.test.js › "estadoCredito: pide el permiso, después el CUIL, y nada más si dijo que no o ya se consultó" -->

#### Scenario: Orquestador
- **WHEN** llega un mensaje de un cliente que financia con la verificación activa
- **THEN** el pedido de permiso le llega a Claude en el contexto, con el link a /privacidad de la web pública
<!-- test: src/agente/atender.test.js › "con la verificación activa y el cliente financiando, el agente recibe el pedido de permiso con el link de privacidad" -->

#### Scenario: Un fallo no frena la respuesta
- **WHEN** falla averiguar en qué paso está la verificación
- **THEN** el cliente recibe la respuesta igual, sin el pedido
<!-- test: src/agente/atender.test.js › "si falla averiguar en qué va la verificación crediticia, la respuesta sale igual" -->

### Requirement: Consulta al BCRA
El sistema MUST consultar deudas y cheques rechazados de la Central de Deudores con un
tiempo máximo de espera, respetar el límite de 10 consultas cada 10 segundos y reutilizar
una consulta del mismo cliente de los últimos 30 días (el dato es mensual). Un 404 MUST
leerse como "sin datos". Un error, un 429 o una caída MUST NOT frenar la conversación:
queda registrado como "error" (sin verificar) y MUST NOT reintentarse durante una hora; después
sí. El resumen MUST incluir el nombre con que el BCRA tiene registrado el CUIL.
<!-- id: bcra.consultarBcra -->

#### Scenario: Respuesta normal
- **WHEN** el BCRA responde deudas y cheques
- **THEN** se devuelven los dos resultados
<!-- test: src/credito/bcra.test.js › "consulta deudas y cheques del CUIL" -->

#### Scenario: Sin registros
- **WHEN** el BCRA responde 404
- **THEN** se lee como sin datos
<!-- test: src/credito/bcra.test.js › "un 404 es sin datos" -->

#### Scenario: BCRA caído
- **WHEN** el BCRA da error, 429 o no responde a tiempo
- **THEN** se informa como error, sin lanzar
<!-- test: src/credito/bcra.test.js › "un error, un 429 o el tiempo agotado se informan como error sin lanzar" -->

#### Scenario: El CUIL en la URL
- **WHEN** lo que llega no son exactamente 11 dígitos
- **THEN** no se arma la URL del BCRA (no se puede cambiar la ruta)
<!-- test: src/credito/bcra.test.js › "un CUIL que no son 11 dígitos no llega a la URL del BCRA" -->

#### Scenario: Pruebas locales sin consultar a nadie
- **WHEN** se prueba con el chat por terminal (`scripts/chat-local.js`) o el simulador de ventas
- **THEN** se usa un BCRA simulado con el semáforo elegido; por WhatsApp, en cambio, la consulta es real
<!-- test: src/agente/simulador/bcra-simulado.test.js › "el BCRA simulado devuelve la respuesta que da cada semáforo elegido, con el nombre de prueba" -->

#### Scenario: El simulado falla como el real
- **WHEN** se elige el resultado `error` o un semáforo que no existe
- **THEN** responde como un BCRA caído, o rechaza el valor
<!-- test: src/agente/simulador/bcra-simulado.test.js › "el BCRA simulado puede fallar como el real, y no acepta un semáforo que no existe" -->

#### Scenario: Límite de consultas
- **WHEN** ya se hicieron 10 consultas en los últimos 10 segundos
- **THEN** no se llama al BCRA y se informa como error
<!-- test: src/credito/bcra.test.js › "más de 10 consultas en 10 segundos no llegan al BCRA" -->

#### Scenario: Reutilización
- **WHEN** el cliente ya tiene una consulta con resultado de los últimos 30 días
- **THEN** no se vuelve a llamar al BCRA
<!-- test: src/credito/verificacion.test.js › "una consulta de los últimos 30 días se reutiliza" -->

#### Scenario: Resultado guardado
- **WHEN** el BCRA responde
- **THEN** se guarda solo el resumen (semáforo, peor situación, período y el nombre que da el BCRA), no la respuesta entera
<!-- test: src/credito/verificacion.test.js › "se guarda solo el resumen de la consulta" -->

#### Scenario: Reintento tras un error
- **WHEN** el BCRA falló hace menos de una hora
- **THEN** no se vuelve a llamar; si falló hace más, sí
<!-- test: src/credito/verificacion.test.js › "un error de la última hora no se reintenta; uno más viejo sí" -->

#### Scenario: El log no lleva datos personales
- **WHEN** falla una herramienta de crédito
- **THEN** el log lleva solo el código del error, nunca el CUIL
<!-- test: src/agente/herramientas.test.js › "si falla una herramienta de crédito, el log no lleva el CUIL ni el mensaje del error" -->

#### Scenario: BCRA caído durante la charla
- **WHEN** el BCRA falla al verificar
- **THEN** queda registrado como error (sin verificar) y la IA sigue con la charla
<!-- test: src/credito/verificacion.test.js › "si el BCRA falla queda registrado como error y la charla sigue" -->

### Requirement: Semáforo en el panel
El panel MUST mostrar en la consulta del cliente su último semáforo con la fecha, el nombre
que da el BCRA ("a nombre de…", para verificar en persona) y una sugerencia para el asesor.
Rojo MUST NOT descartar ni ocultar la consulta. Lo ven todos los usuarios del panel
(decisión del dueño).
<!-- id: lead.mapper.creditoDelCliente -->

#### Scenario: Cliente verificado
- **WHEN** el cliente tiene una consulta crediticia
- **THEN** el lead trae el semáforo, el período y la fecha de la última
<!-- test: src/mappers/lead.mapper.test.js › "el lead trae el último semáforo crediticio del cliente" -->

#### Scenario: Cliente sin verificar
- **WHEN** no tiene ninguna consulta crediticia
- **THEN** el lead trae credito null
<!-- test: src/mappers/lead.mapper.test.js › "sin consulta crediticia el lead trae credito null" -->

#### Scenario: Lista de Consultas
- **WHEN** el panel lista las consultas
- **THEN** cada una trae el último semáforo de su cliente, o null si no se verificó
<!-- test: src/mappers/consulta.mapper.test.js › "la consulta trae el último semáforo crediticio del cliente, o null si no se verificó" -->

### Requirement: Términos de privacidad versionados
El texto de privacidad MUST guardarse por versión; publicar uno nuevo MUST crear otra
versión sin borrar las anteriores (los consentimientos apuntan a la versión que aceptaron).
La página pública /privacidad MUST mostrar la versión vigente.
<!-- id: terminos.publicarTerminos -->

#### Scenario: Publicar una versión
- **WHEN** el admin publica un texto nuevo
- **THEN** queda como vigente y las anteriores se conservan
<!-- test: src/services/terminos.service.test.js › "publicar crea una versión nueva y la deja vigente" -->

#### Scenario: Texto vacío
- **WHEN** el texto está vacío o es muy largo
- **THEN** se rechaza con 400
<!-- test: src/services/terminos.service.test.js › "un texto vacío o demasiado largo se rechaza" -->

#### Scenario: Sin política publicada
- **WHEN** la agencia no publicó ninguna versión
- **THEN** no hay vigente (la página lo dice y la verificación no se puede activar)
<!-- test: src/services/terminos.service.test.js › "sin términos publicados no hay vigentes" -->

#### Scenario: Texto limpio
- **WHEN** el texto trae caracteres invisibles o de control
- **THEN** se sacan; los saltos de línea quedan
<!-- test: src/services/terminos.service.test.js › "los caracteres invisibles se sacan; los saltos de línea quedan" -->

#### Scenario: Solo el admin publica
- **WHEN** un asesor intenta publicar
- **THEN** recibe 403
<!-- test: src/routes/permisos-terminos.routes.test.js › "un asesor no puede publicar la política de privacidad" -->

#### Scenario: Publicar sin sesión
- **WHEN** alguien sin sesión intenta publicar
- **THEN** recibe 401
<!-- test: src/routes/permisos-terminos.routes.test.js › "sin sesión, tampoco" -->

#### Scenario: La API sin política publicada
- **WHEN** se pide `GET /api/privacidad` y no hay ninguna versión
- **THEN** responde 200 con `data: null`, para que el panel distinga "todavía no hay" de un error
<!-- test: FALTA -->

### Requirement: El permiso se guarda una sola vez
Si el cliente ya respondió al permiso y la IA vuelve a guardar la misma respuesta con la misma versión de
los términos, el sistema MUST NOT crear otro registro: MUST conservar el primero, con el `wamid` del mensaje
en que el cliente respondió. Una respuesta distinta (un "no" después de un "sí", o al revés) MUST guardarse
como un registro nuevo, igual que hoy.
<!-- id: verificacion.registrarConsentimiento -->

#### Scenario: La IA repite el mismo "sí"
- **WHEN** el cliente autorizó y, dos mensajes después, la IA vuelve a guardar un "sí"
- **THEN** queda un solo registro, con el `wamid` del mensaje en que el cliente dijo que sí
<!-- test: src/credito/verificacion.test.js › "si la IA repite el mismo sí con la misma versión de términos, queda un solo registro con el wamid del primero" -->
<!-- eval: chats simulados › P10 -->

#### Scenario: Cambia de respuesta
- **WHEN** el cliente había dicho que sí y después dice que no
- **THEN** se guarda el "no" como un registro nuevo y revoca el anterior
<!-- test: src/credito/verificacion.test.js › "si cambia de respuesta (sí y después no), se guarda un registro nuevo que revoca el anterior" -->
<!-- test: src/credito/verificacion.test.js › "el mismo no repetido tampoco crea otro registro" -->

#### Scenario: Términos nuevos
- **WHEN** el cliente repite el "sí" después de que se publicó una versión nueva de los términos
- **THEN** se guarda otra vez, con la versión nueva
<!-- test: src/credito/verificacion.test.js › "el mismo sí pero con una versión nueva de los términos se guarda otra vez" -->

### Requirement: El CUIL se consulta con la herramienta
Apenas el cliente autoriza, la asesora MUST pedir el CUIL en ese mismo mensaje, y al recibirlo MUST consultarlo
con `verificar_situacion_crediticia` antes de contestar. MUST NOT afirmar un resultado que la herramienta no dio;
después de consultar dice solo que el asesor le arma las opciones. MUST seguir también lo que devuelve
`registrar_calificacion` en lo que falta, aunque el contexto del turno no lo diga.
<!-- id: instrucciones.INSTRUCCIONES -->

#### Scenario: Autoriza y manda el CUIL
- **WHEN** el cliente dice "si, autorizo" y después manda "20-12345678-6"
- **THEN** la asesora pide el CUIL en la respuesta al "sí", lo consulta con la herramienta y dice solo que el asesor arma las opciones
<!-- test: src/agente/instrucciones.test.js › "apenas el cliente autoriza, pide el CUIL en ese mismo mensaje y guarda el permiso una sola vez por respuesta" -->
<!-- test: src/agente/instrucciones.test.js › "con el CUIL: usa SIEMPRE verificar_situacion_crediticia, no inventa que no coincide ni que falló, y después solo dice que el asesor arma las opciones" -->
<!-- eval: chats simulados › E1, P10 -->

#### Scenario: El contexto se armó antes de guardar el recibo
- **WHEN** `registrar_calificacion` devuelve el permiso primero en lo que falta
- **THEN** la asesora pide el permiso en ese mismo mensaje
<!-- test: src/agente/instrucciones.test.js › "la verificación también se pide cuando registrar_calificacion devuelve el permiso o el CUIL primero en faltan (el contexto se armó antes de guardar)" -->
<!-- eval: chats simulados › P10 -->
