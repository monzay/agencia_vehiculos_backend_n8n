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
- **THEN** le pide el CUIL diciendo para qué es, nunca le dice el resultado ni si califica, y si no quiere pasarlo, no insiste
<!-- test: src/agente/instrucciones.test.js › "la verificación crediticia: pide el CUIL diciendo para qué es, nunca dice el resultado y no insiste si no quiere pasarlo" -->

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
El sistema MUST consultar al BCRA solo con la autorización del cliente. **Pasar el CUIL es la autorización**:
la asesora se lo pide diciendo para qué es (que el asesor pueda consultar su situación en la Central de
Deudores del BCRA) y, si el cliente lo manda, acepta esa consulta. Al recibir después del aviso un CUIL
válido y suyo, el sistema MUST guardar un "sí" con la versión vigente de los términos y la fecha, y recién
después consultar. Un CUIL ajeno MUST NOT dejar un "sí".
Si el cliente dice que no quiere pasarlo, MUST guardarse un "no", y MUST NOT volver a pedírselo. El último
registro manda: un "no" posterior revoca el "sí", y un CUIL mandado después de un "no" es un "sí" nuevo.
No pasar el CUIL MUST NOT afectar la calificación.

El **aviso** es un mensaje de la agencia (del bot, o del asesor si intervino) en la consulta en curso, de un
turno anterior al que se responde, que nombra el CUIL y la Central de Deudores o el BCRA. Cuándo se crea el "sí" y qué mensaje lo prueba:
- **CUIL después del aviso:** el mensaje del cliente que se responde trae el CUIL. El "sí" se guarda con el
  `wamid` de ese mensaje.
- **CUIL antes del aviso** (por su cuenta, o en el mismo mensaje que lo del recibo): MUST NOT consultarse ni
  guardarse nada todavía. Cuando corresponda pedir el CUIL, la asesora le dice para qué es y le pide que se lo
  vuelva a mandar si está de acuerdo. Esa explicación es el aviso, y el CUIL que manda después es el caso
  normal. Así el "sí" sale siempre de un CUIL que llega después del aviso y pasa por las mismas
  validaciones.
- **CUIL tomado de la charla:** MUST NOT consultarse sin un "sí" vigente, aunque haya aviso. La IA no puede
  autorizar un CUIL viejo por su cuenta.
- **CUIL después de un "no"** (el "no" vino después del aviso): es un "sí" nuevo, con el `wamid` del mensaje
  del CUIL.
- **Un "dale, consultá" sin CUIL:** no guarda nada. La asesora le pide el CUIL y el "sí" se guarda cuando
  llega.
- **Un "sí" vigente al permiso anterior al cambio** (dado después del aviso con el link): ya es la
  autorización. El CUIL se consulta apenas llega, aunque no haya aviso nuevo.

Un "sí" vigente es el último registro del cliente cuando es un "sí", de cualquier versión de los términos
(como hoy). La consulta MUST quedar atada al último "sí". Un CUIL en el mensaje después del aviso MUST
registrar su "sí" aunque ya hubiera uno vigente: con la misma versión no se duplica (se conserva el primero),
y con una versión nueva se guarda otro.

En todos los casos, el aviso en la consulta en curso o un "sí" vigente es condición. Un "no" anterior no la
reemplaza: un CUIL que llega después de un "no", pero sin aviso en la consulta en curso (por ejemplo, el "no"
fue en una consulta anterior), se trata como "CUIL antes del aviso".

Un "no" MUST guardarse solo si el cliente dice claramente que no quiere pasarlo. Si esquiva la pregunta o la
respuesta no es clara, MUST NOT guardarse nada.

Las respuestas guardadas antes de este cambio (el "sí" o el "no" al permiso con el link) MUST seguir
valiendo.
<!-- id: verificacion.registrarConsentimiento -->

El "sí" y el "no" MUST guardar el `wamid` del mensaje del cliente que se está respondiendo cuando se
registran. Es la prueba: para el "sí", el mensaje en que llegó el CUIL; para el "no", el mensaje en que dijo
que no. El "sí" MUST registrarlo solo el sistema al recibir el CUIL; la herramienta `registrar_consentimiento`
guarda solo el "no".

#### Scenario: Sin consentimiento
- **WHEN** el cliente todavía no pasó su CUIL después del aviso, o su último registro es un "no" y no mandó un CUIL después
- **THEN** no se llama al BCRA (un CUIL válido y suyo mandado después del aviso sí autoriza: ver "Cambia de idea")
<!-- test: src/credito/verificacion.test.js › "sin aviso ni un sí vigente no se consulta al BCRA ni se guarda nada" -->

#### Scenario: Pasar el CUIL es la autorización
- **WHEN** la asesora le pidió el CUIL diciendo para qué es y el cliente lo manda
- **THEN** se guarda un "sí" con la versión vigente de los términos, y recién después se consulta
<!-- test: src/credito/verificacion.test.js › "con el aviso en un turno anterior, el CUIL en el mensaje guarda el sí con el wamid de ese mensaje y recién después consulta" -->
<!-- test: src/credito/verificacion.test.js › "el aviso tiene que ser de un turno anterior de esta consulta y nombrar el CUIL y el BCRA" -->
<!-- test: src/agente/temas-preguntados.test.js › "esAvisoDelCuil reconoce el pedido del dueño, aunque la Central de Deudores esté en la oración afirmativa" -->
<!-- test: src/agente/temas-preguntados.test.js › "esAvisoDelCuil exige las dos cosas: el CUIL y la Central de Deudores o el BCRA" -->

#### Scenario: El wamid llega desde el mensaje real
- **WHEN** el cliente manda el CUIL por WhatsApp y la IA lo consulta en ese turno
- **THEN** el orquestador guarda el id de ese mensaje como prueba del "sí"; si la IA lo vuelve a consultar en un turno posterior, el registro original no cambia
<!-- test: src/agente/atender.test.js › "el sí guarda el wamid del mensaje que trae el CUIL: el orquestador le pasa a verificar los mensajes del turno" -->
<!-- test: src/agente/atender.test.js › "en una ráfaga de dos mensajes con el CUIL en el primero, el sí guarda el wamid del primero" -->
<!-- test: src/credito/verificacion.test.js › "en un lote de varios mensajes, el sí queda con el wamid del mensaje que trae el CUIL" -->
<!-- test: src/credito/verificacion.test.js › "el CUIL mandado dos veces deja un solo sí con el wamid del primero" -->

#### Scenario: No quiere pasarlo
- **WHEN** el cliente dice claramente que prefiere no pasar el CUIL
- **THEN** se guarda un "no" con la versión vigente de los términos, no se consulta y no se le vuelve a pedir
<!-- test: src/credito/verificacion.test.js › "el no se guarda con la versión vigente y deja de pedir el CUIL" -->
<!-- eval: chats simulados › P12 -->

#### Scenario: Esquiva la pregunta
- **WHEN** después del pedido, el cliente contesta otra cosa o no queda claro si quiere pasarlo
- **THEN** no se guarda ni un "sí" ni un "no", y el CUIL sigue pendiente
<!-- test: src/agente/instrucciones.test.js › "si no quiere pasarlo guarda el no claro con registrar_consentimiento; si esquiva la pregunta no guarda nada" -->

#### Scenario: CUIL viejo sin un sí en el mensaje
- **WHEN** hubo aviso, el cliente ya había mandado su CUIL antes, y en el mensaje que se responde dice "sí" o habla de otra cosa
- **THEN** la IA no puede consultar ese CUIL: la herramienta no consulta ni guarda nada, porque el mensaje no trae el CUIL ni hay un "sí" vigente
<!-- test: src/credito/verificacion.test.js › "un CUIL viejo de la charla no se consulta sin un sí vigente, aunque haya aviso" -->
<!-- eval: chats simulados › P13 -->

#### Scenario: CUIL antes del aviso
- **WHEN** el cliente, sin un "sí" vigente, manda su CUIL antes de que la asesora le dijera para qué es (por su cuenta, o en el mismo mensaje que lo del recibo)
- **THEN** no se consulta ni se guarda nada. Cuando corresponde pedir el CUIL, la asesora le dice para qué es (nombrando el CUIL y la Central de Deudores: es el aviso) y le pide que se lo vuelva a mandar si está de acuerdo. El CUIL anticipado no se guarda nunca. El que manda después se trata como el caso normal: se valida; si es válido y suyo, se guarda el "sí" con el wamid de ese mensaje y se consulta; si es ajeno, queda solo como CUIL informado, sin "sí"
<!-- test: src/credito/verificacion.test.js › "un CUIL antes del aviso no se consulta ni se guarda, y el motivo pide decir para qué es y que lo vuelva a mandar" -->
<!-- eval: chats simulados › P13 -->

#### Scenario: CUIL antes de que corresponda
- **WHEN** el cliente manda un CUIL válido antes de responder lo del recibo o garante
- **THEN** no se consulta ni se guarda (tampoco como CUIL informado de la consulta). Cuando llega el momento del CUIL, la asesora dice para qué es y le pide que se lo vuelva a mandar si está de acuerdo, igual que en "CUIL antes del aviso"
<!-- test: src/credito/verificacion.test.js › "un CUIL antes de lo del recibo no se guarda y el motivo dice que siga el recorrido" -->
<!-- eval: chats simulados › P14 -->

#### Scenario: Después de un "no", sin aviso en esta consulta
- **WHEN** el cliente dijo que no en una consulta anterior y, en la consulta nueva, manda el CUIL antes de cualquier aviso
- **THEN** se trata como "CUIL antes del aviso": no se consulta; la asesora dice para qué es y le pide que se lo vuelva a mandar si está de acuerdo
<!-- test: src/credito/verificacion.test.js › "después de un no de otra consulta, un CUIL sin aviso en esta consulta no se consulta" -->

#### Scenario: Cambia de idea
- **WHEN** dijo que no y, más adelante, manda el CUIL igual
- **THEN** la asesora lo consulta con la herramienta aunque el contexto del turno no pedía el CUIL; se guarda un "sí" nuevo, que reemplaza al "no", y se consulta
<!-- test: src/credito/verificacion.test.js › "después de un no, el CUIL en el mensaje tras el aviso crea un sí nuevo y consulta (sí, no, CUIL: tres registros)" -->
<!-- test: src/agente/instrucciones.test.js › "con el CUIL: usa SIEMPRE verificar_situacion_crediticia, no inventa que no coincide ni que falló, y después solo dice que el asesor arma las opciones" -->

#### Scenario: CUIL inválido o de otra persona
- **WHEN** después del aviso, el cliente manda un CUIL que no es válido, o uno válido que no es el suyo
- **THEN** si no es válido, no se guarda nada y la asesora se lo pide una vez más. Si es válido pero no es suyo, se guarda solo el CUIL informado de la consulta (como hoy, para que el asesor vea cuál dio), sin ningún "sí", no se consulta y la asesora ofrece un vendedor. Antes del aviso, ninguno de los dos guarda nada
<!-- test: src/credito/verificacion.test.js › "con el aviso, un CUIL inválido no guarda nada y uno ajeno guarda solo el CUIL informado, sin sí" -->

#### Scenario: Revocación
- **WHEN** pasó el CUIL y después dice que no quiere que lo consulten
- **THEN** se guarda un "no" y ya no se consulta
<!-- test: src/credito/verificacion.test.js › "un no posterior revoca el sí" -->

#### Scenario: Respuestas anteriores al cambio
- **WHEN** el cliente ya había respondido el permiso anterior (con el link): "sí" o "no"
- **THEN** con el "sí", se le pide el CUIL sin volver a pedir permiso y se consulta apenas llega, aunque no haya aviso nuevo (ese "sí" sigue valiendo aunque mande un CUIL inválido); con el "no", no se le pide
<!-- test: src/credito/verificacion.test.js › "un sí del permiso anterior sigue valiendo: el CUIL se consulta sin aviso nuevo, y con un no viejo no se pide" -->

#### Scenario: Registro del consentimiento
- **WHEN** se guarda un "sí" o un "no"
- **THEN** queda con la versión de los términos vigente y el wamid del mensaje del cliente
<!-- test: src/credito/verificacion.test.js › "el consentimiento se guarda con la versión vigente de los términos" -->

#### Scenario: La IA pasa la respuesta tal cual
- **WHEN** el cliente dice claramente que no quiere pasar el CUIL
- **THEN** la herramienta registra exactamente ese "no". Si la IA le pide un "sí", no se guarda nada y la herramienta responde que el "sí" es el CUIL que manda el cliente después del aviso
<!-- test: src/agente/herramientas.test.js › "registrar_consentimiento pasa el no del cliente tal cual; un sí no queda registrado y vuelve con el motivo" -->
<!-- test: src/credito/verificacion.test.js › "registrarConsentimiento guarda el no, pero un sí pedido por la herramienta no se guarda" -->
<!-- test: src/agente/atender.test.js › "un sí pedido con registrar_consentimiento no se guarda: el sí es el CUIL" -->

### Requirement: Cuándo se consulta
La verificación MUST estar siempre activa, sin opción para apagarla. El sistema MUST pedir el CUIL y
consultar solo si la agencia publicó su política de privacidad, el cliente financia y ya respondió si tiene
recibo o garante. Con pago de contado MUST NOT pedirse ni consultarse.
<!-- id: verificacion.verificarSituacion -->

#### Scenario: Sin política publicada
- **WHEN** la agencia todavía no publicó su política de privacidad
- **THEN** el contexto no trae el pedido del CUIL, el CUIL no figura en lo que falta y la herramienta no consulta
<!-- test: src/credito/verificacion.test.js › "sin política publicada no se consulta" -->
<!-- test: src/credito/verificacion.test.js › "sin términos, estadoCredito y permisoAnticipado no piden el CUIL" -->

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
- **THEN** el contexto le dice al agente que pida el CUIL con la frase de para qué es, sin el link de privacidad; el link va aparte, solo para si el cliente pregunta qué se hace con sus datos
<!-- test: src/agente/instrucciones.test.js › "con la verificación activa, el contexto pide el CUIL con para qué es y deja el link de privacidad solo para si pregunta" -->

#### Scenario: En qué paso está
- **WHEN** se arma el contexto de cada mensaje
- **THEN** pide el CUIL si no lo pasó y no dijo que no; nada si dijo que no, si ya se consultó en los últimos 30 días o si el BCRA falló hace menos de una hora
<!-- test: src/credito/verificacion.test.js › "estadoCredito: pide el CUIL si no lo pasó y no dijo que no; nada si dijo que no, ya se consultó o el BCRA falló hace menos de una hora" -->

#### Scenario: Orquestador
- **WHEN** llega un mensaje de un cliente que financia, con la verificación activa
- **THEN** el pedido del CUIL le llega a Claude en el contexto, y el link a /privacidad de la web pública, solo como respuesta para si pregunta
<!-- test: src/agente/atender.test.js › "con la verificación activa y el cliente financiando, el agente recibe el pedido del CUIL con para qué es, y el link de privacidad solo para si pregunta" -->

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
Si el cliente ya respondió (pasó su CUIL o dijo que no) y se vuelve a guardar la misma respuesta con la misma
versión de los términos, el sistema MUST NOT crear otro registro: MUST conservar el primero, con el `wamid`
del mensaje en que el cliente respondió. Una respuesta distinta (un "no" después de un "sí", o un CUIL
después de un "no") MUST guardarse como un registro nuevo.
<!-- id: verificacion.registrarConsentimiento -->

#### Scenario: La IA repite el mismo "sí"
- **WHEN** el cliente ya pasó su CUIL y lo vuelve a mandar, o la IA lo vuelve a consultar
- **THEN** queda un solo "sí", con el `wamid` del primer mensaje con el CUIL
<!-- test: src/credito/verificacion.test.js › "el CUIL mandado dos veces deja un solo sí con el wamid del primero" -->
<!-- test: src/credito/verificacion.test.js › "con un sí vigente de la misma versión, el CUIL en el mensaje tras el aviso consulta sin crear otro sí ni cambiar su wamid" -->
<!-- eval: chats simulados › P10 -->

#### Scenario: La IA repite el mismo "no"
- **WHEN** el cliente dijo que no y la IA vuelve a guardar un "no"
- **THEN** queda un solo registro
<!-- test: src/credito/verificacion.test.js › "el mismo no repetido tampoco crea otro registro" -->

#### Scenario: Cambia de respuesta
- **WHEN** el cliente había pasado el CUIL y después dice que no
- **THEN** se guarda el "no" como un registro nuevo y revoca el anterior
<!-- test: src/credito/verificacion.test.js › "si cambia de respuesta (sí y después no), se guarda un registro nuevo que revoca el anterior" -->

#### Scenario: Términos nuevos
- **WHEN** el cliente vuelve a mandar el CUIL después de que se publicó una versión nueva de los términos
- **THEN** se guarda otra vez, con la versión nueva
<!-- test: src/credito/verificacion.test.js › "el mismo sí pero con una versión nueva de los términos se guarda otra vez" -->

### Requirement: El CUIL se consulta con la herramienta
Cuando el contexto o lo que devuelve `registrar_calificacion` en lo que falta indican el CUIL, la asesora
MUST pedirlo en ese mismo mensaje, corto, diciendo para qué es: que el asesor puede consultar su situación en
la Central de Deudores del BCRA. Por ejemplo: "¿Me pasás tu CUIL? Así el asesor puede consultar tu situación
en la Central de Deudores del BCRA". MUST NOT pedir permiso aparte, preguntar "sí o no", decir "tus datos se
usan solo para eso" ni pasar el link de privacidad. La excepción es que el cliente pregunte para qué es o qué
se hace con sus datos: ahí contesta en una línea y pasa el link.

Al recibir el CUIL, la asesora MUST consultarlo con `verificar_situacion_crediticia` antes de contestar.
MUST NOT afirmar un resultado que la herramienta no dio. Después de consultar dice solo que el asesor le arma
las opciones. Si la herramienta responde que el CUIL llegó antes del aviso, la asesora dice para qué es y le
pide que se lo vuelva a mandar si está de acuerdo (`agente-credito` › Consentimiento antes de consultar).

Si el cliente dice claramente que no quiere pasarlo, MUST guardar el "no" con `registrar_consentimiento`, sin
insistir ni preguntar por qué, y seguir el recorrido. Si esquiva la pregunta, no guarda nada.
<!-- id: instrucciones.INSTRUCCIONES -->

#### Scenario: Pide el CUIL directo
- **WHEN** el cliente financia y ya dijo lo del recibo o garante
- **THEN** la asesora le pide el CUIL en un mensaje corto, diciendo que el asesor puede consultar su situación en la Central de Deudores del BCRA, sin pedir permiso aparte, sin "sí o no" y sin el link de privacidad
<!-- test: src/agente/instrucciones.test.js › "pide el CUIL directo con el ejemplo del dueño, sin permiso aparte, sin sí o no y sin el link" -->
<!-- eval: chats simulados › E1, P10 -->

#### Scenario: Autoriza y manda el CUIL
- **WHEN** después del pedido, el cliente manda "20-12345678-6"
- **THEN** la asesora lo consulta con la herramienta antes de contestar y dice solo que el asesor le arma las opciones
<!-- test: src/agente/instrucciones.test.js › "con el CUIL: usa SIEMPRE verificar_situacion_crediticia, no inventa que no coincide ni que falló, y después solo dice que el asesor arma las opciones" -->
<!-- eval: chats simulados › E1, P10 -->

#### Scenario: Pregunta qué hacen con sus datos
- **WHEN** después del pedido, el cliente pregunta para qué es o qué hacen con sus datos
- **THEN** la asesora contesta en una línea (lo ve solo el asesor, para armarle la financiación) y le pasa el link de /privacidad
<!-- test: src/agente/instrucciones.test.js › "si pregunta para qué es o qué hacen con sus datos, contesta en una línea y pasa el link de privacidad" -->
<!-- eval: chats simulados › P11 -->

#### Scenario: No quiere pasarlo
- **WHEN** el cliente dice que prefiere no pasar el CUIL
- **THEN** la asesora guarda el "no", no insiste ni pregunta por qué, y sigue con lo que falta del recorrido
<!-- test: src/agente/instrucciones.test.js › "si no quiere pasarlo guarda el no claro con registrar_consentimiento; si esquiva la pregunta no guarda nada" -->
<!-- eval: chats simulados › P12 -->

#### Scenario: El contexto se armó antes de guardar el recibo
- **WHEN** `registrar_calificacion` devuelve el CUIL primero en lo que falta
- **THEN** la asesora pide el CUIL en ese mismo mensaje
<!-- test: src/agente/instrucciones.test.js › "el CUIL también se pide cuando registrar_calificacion lo devuelve primero en faltan (el contexto se armó antes de guardar)" -->
<!-- test: src/agente/herramientas.test.js › "registrar_calificacion devuelve en faltan el CUIL, con para qué es, según el estado de la verificación" -->
<!-- eval: chats simulados › P10 -->

### Requirement: El CUIL que informa la persona queda en la consulta
Con la verificación activa y el "sí" vigente del cliente, un CUIL válido MUST guardarse en
`sesiones.cuil_informado` aunque no coincida con la ficha: si el cliente lo corrige, el asesor
ve qué informó. El último informado reemplaza al anterior de esa consulta. Un CUIL inválido o
dado sin permiso MUST NOT guardarse. `clientes.cuil` no cambia con esto y la IA MUST NOT poder
escribir esta columna.
<!-- id: verificacion.verificarSituacion -->

#### Scenario: CUIL informado distinto al de la ficha
- **WHEN** el cliente da un CUIL válido que no coincide con el de su ficha
- **THEN** queda en la consulta, la ficha conserva el suyo y no se consulta al BCRA
<!-- test: src/credito/verificacion.test.js › "el CUIL que informa la persona queda en la consulta, aunque no coincida con la ficha" -->

#### Scenario: CUIL que no se guarda
- **WHEN** el CUIL es inválido, o el cliente no dio su permiso
- **THEN** la consulta no guarda nada
<!-- test: src/credito/verificacion.test.js › "un CUIL inválido o sin permiso no queda en la consulta" -->

### Requirement: El CUIL se ve entre los datos de la consulta
El detalle de la consulta MUST mostrar el CUIL informado y, si es distinto o no hay informado,
el de la ficha, con el formato `20-12345678-6`. Sin CUIL no se agrega ninguna fila.
<!-- id: consulta.construirRespuestas -->

#### Scenario: CUIL informado y CUIL de la ficha
- **WHEN** se arman los datos de una consulta
- **THEN** se ve el informado, y el de la ficha solo si es otro
<!-- test: src/mappers/consulta.mapper.test.js › "la consulta muestra el CUIL informado y el de la ficha solo si es distinto" -->

#### Scenario: El detalle lee el CUIL de la ficha
- **WHEN** el panel pide el detalle de una consulta cuyo cliente tiene CUIL en la ficha
- **THEN** ese CUIL aparece entre las respuestas
<!-- test: src/services/consultas.service.test.js › "el detalle muestra el CUIL de la ficha entre los datos de la consulta" -->

#### Scenario: Formato
- **WHEN** se muestra un CUIL de 11 dígitos
- **THEN** va con guiones; un valor que no tiene 11 dígitos se muestra tal cual
<!-- test: src/credito/cuil.test.js › "formatearCuil pone los guiones y deja igual lo que no tiene 11 dígitos" -->

### Requirement: La política de privacidad está en la web
La web pública MUST mostrar, en el pie de sus páginas, un link "Política de privacidad" a /privacidad, donde
está la versión vigente. Es el lugar de la política: el bot MUST NOT mandar el link salvo que el cliente
pregunte qué se hace con sus datos (ver "El CUIL se consulta con la herramienta").
<!-- id: seccion-pie.SeccionPie -->

#### Scenario: Link en el pie
- **WHEN** alguien entra a la portada, al catálogo, a la ficha de un auto o a /privacidad
- **THEN** el pie muestra el link "Política de privacidad", que lleva a /privacidad
<!-- test: ../sea_automotores/lib/constantes.test.js › "el pie de la web tiene el link a la política de privacidad" -->
<!-- test: ../sea_automotores/components/inicio/seccion-pie.test.js › "las páginas públicas usan el pie con el link a la política de privacidad" -->
<!-- test: ../sea_automotores/components/inicio/seccion-pie.test.js › "la consulta de cuotas, que pide el DNI y no usa el pie, también enlaza la política de privacidad" -->
<!-- test: ../sea_automotores/e2e/politica-privacidad.spec.mjs › "el pie de la portada, el catálogo, la ficha de un auto y /privacidad lleva a la política de privacidad" -->
<!-- test: ../sea_automotores/e2e/politica-privacidad.spec.mjs › "la consulta de cuotas, que pide el DNI, también muestra el link a la política" -->

#### Scenario: Sin política publicada
- **WHEN** la agencia todavía no publicó ninguna versión
- **THEN** el link sigue en el pie y la página dice "La política de privacidad todavía no está publicada."
<!-- test: ../sea_automotores/e2e/politica-privacidad.spec.mjs › "sin política publicada, el link sigue en el pie y la página lo dice" -->
