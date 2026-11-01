# agente-cobranza

> BORRADOR — extraído del código el 2026-10-30, pendiente de revisión del dueño.
> Fuente: src/agente/atender.js, src/services/avisos-cuotas.service.js (avisoReciente,
> esBaja, darDeBaja), src/agente/herramientas.js (avisar_administracion),
> src/agente/instrucciones.js (recordatorioDeCuota).
> El envío de los recordatorios (cuándo y a quién) es de la capacidad de financiaciones.

## Purpose

Qué hace el agente cuando quien escribe es un cliente que recibió un recordatorio de
cuota: reconocer la cuota, resolver la BAJA sin IA y dejarle el aviso al administrador.

## Requirements

### Requirement: Respuesta a un recordatorio de cuota
Si el número recibió un recordatorio en las últimas 72 horas, el sistema MUST decirle al agente
de qué cuota se trata: número, total de cuotas, vencimiento e importe. En ese caso MUST NOT
empujar el recorrido de venta. El número MUST reconocerse escriba con 549 o con 54. Pasadas
las 72 horas, la charla MUST volver a ser de venta.
<!-- id: avisos-cuotas.avisoReciente -->
<!-- dueña-futura: financiaciones-avisos — el agente se queda solo con "no empujar la venta" -->

#### Scenario: Responde a un recordatorio
- **WHEN** el cliente escribe dentro de las 72 horas del recordatorio
- **THEN** el agente sabe de qué cuota se trata
<!-- test: src/agente/atender.test.js › "si responde a un recordatorio, Agustina sabe de qué cuota se trata" -->
<!-- test: src/services/avisos-cuotas.test.js › "reconoce la respuesta a un recordatorio de las últimas 72 h, escriba con 549 o con 54" -->

#### Scenario: Sin recordatorio reciente
- **WHEN** no hay recordatorio reciente
- **THEN** la charla es de venta como siempre
<!-- test: src/agente/atender.test.js › "sin recordatorio reciente, la charla es de venta como siempre" -->

#### Scenario: Pasaron las 72 horas
- **WHEN** el recordatorio es de hace más de 72 horas
- **THEN** ya no se toma como respuesta a él
<!-- test: src/services/avisos-cuotas.test.js › "pasadas las 72 h ya no es una respuesta al recordatorio" -->

#### Scenario: n8n no informó el envío
- **WHEN** n8n no llegó a informar que el recordatorio se envió
- **THEN** la respuesta se reconoce igual
<!-- test: src/services/avisos-cuotas.test.js › "la respuesta se reconoce aunque n8n no haya llegado a informar el envío" -->

#### Scenario: El contexto no empuja la venta
- **WHEN** hay un recordatorio reciente
- **THEN** el contexto dice cuál es la cuota y no incluye el recorrido de venta
<!-- test: src/agente/instrucciones.test.js › "si le mandamos un recordatorio de cuota, el contexto dice cuál y no empuja el recorrido de venta" -->

### Requirement: BAJA se resuelve sin IA
Si el mensaje es BAJA, o una forma común de pedirla ("no me manden más", "quiero darme de
baja", "stop", con o sin "gracias"), y el número recibió recordatorios, el sistema MUST, sin IA:
- apagar los avisos de las financiaciones de ese número;
- dejarle una alerta al administrador, una sola vez;
- confirmarle al cliente que no va a recibir más recordatorios.

Si el número nunca recibió un recordatorio, MUST atenderlo el agente. Un texto como "quiero
dar de baja el auto" o "bajá el precio" MUST NOT tomarse como BAJA.
<!-- id: avisos-cuotas.darDeBaja -->
<!-- dueña-futura: financiaciones-avisos — el agente se queda solo con "se resuelve sin IA" -->


#### Scenario: BAJA a un recordatorio
- **WHEN** el cliente responde BAJA a un recordatorio
- **THEN** se apagan los avisos sin llamar a la IA y se le confirma
<!-- test: src/agente/atender.test.js › "BAJA a un recordatorio: se apagan los avisos sin llamar a la IA y se le confirma" -->
<!-- test: src/services/avisos-cuotas.test.js › "BAJA apaga los avisos de sus financiaciones y le deja una alerta al admin" -->

#### Scenario: BAJA de alguien sin recordatorios
- **WHEN** escribe "baja" alguien que nunca recibió un recordatorio
- **THEN** no se hace nada y lo atiende el agente
<!-- test: src/agente/atender.test.js › "'baja' de alguien que nunca recibió un recordatorio lo atiende Agustina" -->
<!-- test: src/services/avisos-cuotas.test.js › "BAJA de alguien que nunca recibió un recordatorio no hace nada" -->

#### Scenario: Formas de pedir la baja
- **WHEN** escribe "BAJA", " baja. ", "Baja!" u otras formas comunes
- **THEN** se reconoce como BAJA; "quiero dar de baja el auto" y "bajá el precio" no
<!-- test: src/services/avisos-cuotas.test.js › "BAJA se reconoce sola, sin importar mayúsculas ni el punto" -->
<!-- test: src/services/avisos-cuotas.test.js › "otras formas de pedir la baja" -->

#### Scenario: BAJA repetida
- **WHEN** el cliente manda BAJA dos veces
- **THEN** la alerta al administrador no se duplica y se le confirma igual
<!-- test: src/services/avisos-cuotas.test.js › "BAJA repetida no duplica la alerta del admin" -->

### Requirement: Aviso al administrador sobre la cuota
`avisar_administracion` MUST dejarle al administrador un aviso atado a la cuota del
recordatorio. Los tipos MUST ser solo: paga en la agencia, transferencia, ya pagó, no puede
pagar, número equivocado u otro. La financiación MUST salir del recordatorio que encontró el
backend, nunca de la IA. Sin recordatorio reciente, MUST NOT crear nada. El mismo aviso MUST
NOT duplicarse. "Número equivocado" MUST frenar los recordatorios a ese número hasta que el
administrador lo atienda.
<!-- id: herramientas.avisar_administracion -->

#### Scenario: Aviso atado a la cuota
- **WHEN** el agente avisa al administrador sobre la cuota del recordatorio
- **THEN** el aviso queda atado a esa cuota
<!-- test: src/agente/herramientas.test.js › "avisar_administracion deja el aviso para el admin, atado a la cuota del recordatorio" -->

#### Scenario: Número equivocado
- **WHEN** el cliente dice que es un número equivocado
- **THEN** no se le mandan más avisos hasta que el administrador lo atienda
<!-- test: src/agente/herramientas.test.js › "avisar_administracion acepta número equivocado (deja de mandarle avisos a ese número)" -->
<!-- test: src/services/avisos-cuotas.test.js › "si avisaron que es un número equivocado, no se le mandan más avisos hasta que el admin lo atienda" -->

#### Scenario: Sin recordatorio reciente
- **WHEN** el agente intenta avisar sin un recordatorio reciente
- **THEN** no se crea nada (la IA no elige la financiación)
<!-- test: src/agente/herramientas.test.js › "avisar_administracion sin un recordatorio reciente no crea nada (la IA no elige la financiación)" -->

#### Scenario: Tipos inventados o links
- **WHEN** el aviso trae un tipo que no existe o un link en el detalle
- **THEN** se rechaza
<!-- test: src/agente/herramientas.test.js › "avisar_administracion no acepta tipos inventados ni links en el detalle" -->

#### Scenario: Aviso repetido
- **WHEN** el agente manda dos veces el mismo aviso
- **THEN** se guarda una sola vez
<!-- test: FALTA -->
