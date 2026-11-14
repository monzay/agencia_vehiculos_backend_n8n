## ADDED Requirements

### Requirement: Pasado el plazo se pregunta todo de nuevo
Una consulta que se abre porque la anterior venció (más de 30 días sin mensajes) MUST nacer sin las
respuestas de las consultas anteriores: forma de pago, anticipo, recibo o garante, usado, quién decide y
visita. El asesor MUST definirse como en toda consulta nueva: el del link si lo trae; si no, por turno
(ver Solo se reparte al crear la consulta). El nombre del cliente MUST seguir siendo el de su ficha.
<!-- id: atender.sesionDe -->

#### Scenario: Vuelve a los 31 días
- **WHEN** un cliente que había respondido todo vuelve 31 días después de su último mensaje, sin link
- **THEN** se abre una consulta nueva sin respuestas, va por turno y a la IA le llega que falta todo
<!-- test: src/agente/atender.test.js › "vuelve a los 31 días con todo respondido y sin link: consulta nueva sin esas respuestas, por turno, y a la IA le falta todo" -->

#### Scenario: Vuelve a los 4 meses por un link
- **WHEN** el cliente vuelve 4 meses después con el link de un asesor
- **THEN** se abre una consulta nueva, sin respuestas ni la charla anterior, asignada y atribuida a ese asesor
<!-- test: src/agente/atender.test.js › "vuelve a los 4 meses con el link de un asesor: consulta nueva sin respuestas ni charla anterior, asignada y atribuida a ese asesor" -->

### Requirement: La IA ve solo la charla de la consulta en curso
El historial que se manda a Claude MUST incluir solo los mensajes del cliente creados desde el inicio de
la consulta en curso (`sesion_inicio`), con los recortes de `agente-cupos` › Recortes antes de mandar a
Claude. Los mensajes anteriores a ese inicio MUST NOT llegar a Claude. Si quedaron consultas superpuestas
de antes (una por auto), los mensajes posteriores a ese inicio MUST entrar igual: son la misma charla.
<!-- id: atender.responderConAgente -->

#### Scenario: Charla de una consulta vencida
- **WHEN** el cliente vuelve a los 31 días y en la consulta anterior había dicho "pago contado"
- **THEN** ese mensaje no llega a Claude
<!-- test: src/agente/atender.test.js › "el 'pago contado' dicho en una consulta vencida no le llega a Claude cuando el cliente vuelve a los 31 días" -->

#### Scenario: Charla dentro del plazo
- **WHEN** el cliente vuelve a los 10 días a la misma consulta
- **THEN** a Claude le llegan los mensajes de esa consulta, incluidos los de hace 10 días
<!-- test: src/agente/atender.test.js › "quien vuelve a los 10 días a la misma consulta: Claude recibe los mensajes de esa consulta, incluidos los de hace 10 días" -->

#### Scenario: Retoma después de una pausa
- **WHEN** el asesor tomó la charla, el cliente y el asesor se escribieron, y después se reanuda el bot dentro del plazo
- **THEN** a Claude le llegan esos mensajes del cliente y las respuestas del asesor
<!-- test: src/agente/atender.test.js › "al retomar después de una pausa dentro del plazo, Claude recibe lo que escribió el cliente mientras el asesor atendía y las respuestas del asesor" -->

#### Scenario: Muchos mensajes de antes
- **WHEN** la consulta vencida tiene 50 mensajes y la nueva tiene 3, el primero en el mismo segundo en que se abrió
- **THEN** a Claude le llegan los 3 de la consulta nueva y ninguno de la vencida
<!-- test: src/agente/atender.test.js › "la consulta vencida tiene 50 mensajes y la nueva 3 (el primero en el mismo instante en que se abrió): Claude recibe solo los 3 de la nueva" -->

#### Scenario: Consultas superpuestas de antes
- **WHEN** el cliente tiene dos consultas vigentes de antes del cambio (una por auto) y el mensaje cae en la del último mensaje
- **THEN** a Claude le llegan los mensajes desde el inicio de esa consulta, sean de una o de otra, y ninguno anterior
<!-- test: src/agente/atender.test.js › "con dos consultas vigentes de antes del cambio, Claude recibe la charla desde el inicio de la del último mensaje, sea de una o de otra, y nada anterior" -->

### Requirement: Una consulta dura 30 días desde el último mensaje
El sistema MUST seguir en la misma consulta (`chat_estado`) mientras su último mensaje sea de hace menos
de 30 días; con 30 días justos o más, MUST abrir una nueva. Dentro del plazo, la consulta MUST conservar
su asesor y sus respuestas. Cada consulta nueva MUST nacer con `ultimo_mensaje` cargado. Con varias
consultas vigentes, el mensaje MUST caer en la del último mensaje.
<!-- id: atender.sesionDe -->

#### Scenario: Varias consultas abiertas
- **WHEN** el cliente tiene dos consultas vigentes
- **THEN** el mensaje cae en la que tuvo el último mensaje, aunque sea la más vieja
<!-- test: src/agente/atender.test.js › "la conversación sigue en la consulta del último mensaje" -->

#### Scenario: Último mensaje de hace 29 o 31 días
- **WHEN** el último mensaje fue hace 29 días, y en otro caso hace 31 días
- **THEN** a los 29 días se reutiliza la consulta; a los 31 se abre una nueva
<!-- test: src/agente/atender.test.js › "una consulta con el último mensaje de hace 31 días no se reutiliza; una de hace 29 días, sí" -->

#### Scenario: 30 días justos
- **WHEN** el último mensaje fue hace exactamente 30 días
- **THEN** se abre una consulta nueva
<!-- test: src/agente/atender.test.js › "con el último mensaje de hace exactamente 30 días se abre una consulta nueva" -->

#### Scenario: Vuelve a los 10 días
- **WHEN** un cliente que ya dijo cómo paga y si entrega usado vuelve a los 10 días
- **THEN** sigue en la misma consulta, con el mismo asesor, y a la IA le llega que eso ya está respondido
<!-- test: src/agente/atender.test.js › "quien vuelve a los 10 días sigue en la misma consulta, con su asesor, y la IA recibe lo ya respondido" -->

#### Scenario: Consulta nueva
- **WHEN** se abre una consulta
- **THEN** nace con `ultimo_mensaje`, así vence a los 30 días
<!-- test: src/agente/atender.test.js › "la sesión nueva nace con ultimo_mensaje (así vence a los 30 días)" -->

### Requirement: Otro auto dentro del plazo sigue en la misma consulta
Si la IA registra otro auto disponible (`registrar_calificacion`) o el cliente llega desde la web con su
ref, el sistema MUST seguir en la misma consulta con ese auto, sin perder respuestas, usado, visita ni
asesor, y MUST recalcular la temperatura, marcarla para el asesor ("Ahora le interesa <nuevo>, antes
<anterior>"), volverla a pendiente y subirla en la lista. Pedir fotos o comparar MUST NOT contar.
<!-- id: consultas-por-auto.otroAuto -->

#### Scenario: La IA registra otro auto
- **WHEN** dentro del plazo la IA registra un auto de interés distinto al de la consulta
- **THEN** la consulta es la misma, con el auto nuevo, las mismas respuestas y el mismo asesor
<!-- test: src/agente/herramientas.test.js › "registrar_calificacion con otro auto cambia el auto de la misma consulta y registra las respuestas en ella" -->
<!-- test: src/agente/consultas-por-auto.test.js › "otro auto: sigue en la misma consulta y un solo update trae el auto nuevo, la temperatura, el aviso y el orden" -->
<!-- test: src/agente/atender.test.js › "el turno se cierra en la misma consulta cuando la IA registra otro auto" -->

#### Scenario: Llega desde la web por otro auto
- **WHEN** dentro del plazo el cliente llega desde la web con la ref de otro auto disponible
- **THEN** la consulta es la misma, con el auto nuevo
<!-- test: src/agente/atender.test.js › "desde la web por otro auto dentro del plazo: sigue en la misma consulta, con el auto nuevo y el aviso" -->
<!-- test: src/agente/atender.test.js › "desde la web por otro auto con el link de Pepito: sigue la misma consulta, con el auto nuevo, y queda de Pepito" -->

#### Scenario: Aviso al asesor
- **WHEN** la consulta cambia de auto
- **THEN** queda marcada para el asesor con "Ahora le interesa <nuevo>, antes <anterior>", aunque ya estuviera marcada por otro motivo
<!-- test: src/agente/consultas-por-auto.test.js › "el motivo del aviso se recorta a 120 caracteres" -->
<!-- test: src/agente/consultas-por-auto.test.js › "el aviso se pone aunque la consulta ya estuviera marcada por otro motivo, y lo pisa" -->

#### Scenario: Estaba atendida
- **WHEN** la consulta estaba marcada como atendida y cambia de auto
- **THEN** vuelve a pendiente y sube al principio de la lista
<!-- test: src/agente/consultas-por-auto.test.js › "si estaba atendida, vuelve a pendiente: atendido_at y atendido_por quedan en null" -->
<!-- test: src/agente/consultas-por-auto.test.js › "sube en la lista: orden_at es el momento del cambio" -->
<!-- test: src/agente/atender.test.js › "la IA registra otro auto en una consulta atendida: vuelve a pendiente y sube" -->

#### Scenario: Pedir fotos de otro auto
- **WHEN** el cliente pide fotos o compara con otro auto sin registrarlo como interés
- **THEN** la consulta no cambia de auto ni se marca
<!-- test: src/agente/herramientas.test.js › "pedir fotos de otro auto no abre una consulta" -->

#### Scenario: Mismo auto
- **WHEN** la IA registra el mismo auto que ya tiene la consulta
- **THEN** no se marca ni cambia el orden
<!-- test: src/agente/consultas-por-auto.test.js › "el mismo auto no escribe nada" -->
<!-- test: src/agente/herramientas.test.js › "registrar_calificacion con el mismo auto, o si la consulta no tenía auto, sigue en la misma consulta" -->

#### Scenario: Consulta con trámite o seña vigente
- **WHEN** la consulta tiene un trámite o una seña vigente y el cliente se interesa en otro auto
- **THEN** sigue en la misma consulta con el auto nuevo, el trámite o la seña no se tocan, y el asesor recibe el aviso
<!-- test: src/agente/consultas-por-auto.test.js › "con un trámite o una seña vigente sigue en la misma consulta y no los toca" -->

#### Scenario: Una sola consulta vigente
- **WHEN** el cliente cambia de auto dos veces dentro del plazo
- **THEN** sigue teniendo una sola consulta vigente
<!-- test: src/agente/consultas-por-auto.test.js › "dos cambios seguidos siguen siendo una sola consulta" -->

### Requirement: El cliente vuelve a escribir en una consulta atendida
Si llega un mensaje del cliente a una consulta marcada como atendida, el sistema MUST volverla a pendiente,
marcarla para el asesor con "Volvió a escribir" y subirla en la lista (ver `consultas-lista`). Vale también
con el bot en pausa porque un asesor tomó la charla, y en ese caso el bot MUST seguir en pausa. Un mensaje
a una consulta pendiente MUST NOT cambiar su motivo ni su orden.
<!-- id: atender.vuelveAEscribir -->

#### Scenario: Vuelve a los 10 días por el mismo auto
- **WHEN** la consulta está atendida y el cliente escribe 10 días después por el mismo auto
- **THEN** vuelve a pendiente, queda marcada "Volvió a escribir" y sube al principio de la lista
<!-- test: FALTA -->

#### Scenario: Responde enseguida, con el bot en pausa
- **WHEN** el asesor respondió desde el panel (la consulta quedó atendida y el bot en pausa) y el cliente contesta minutos después
- **THEN** vuelve a pendiente, con el aviso, sube, y el bot sigue en pausa: no responde
<!-- test: FALTA -->

#### Scenario: Consulta pendiente
- **WHEN** la consulta no está atendida y el cliente escribe
- **THEN** no cambia su motivo ni su orden
<!-- test: FALTA -->

#### Scenario: Vuelve por otro auto
- **WHEN** la consulta está atendida y en el mismo turno el cliente se interesa en otro auto
- **THEN** queda pendiente y arriba, y el motivo que queda es "Ahora le interesa <nuevo>, antes <anterior>"
<!-- test: FALTA -->

#### Scenario: Vuelve pasado el plazo
- **WHEN** la consulta atendida venció (30 días o más) y el cliente escribe
- **THEN** no se toca: se abre una consulta nueva (ver Pasado el plazo se pregunta todo de nuevo)
<!-- test: FALTA -->

## MODIFIED Requirements

### Requirement: Consultas que llegan desde la web
Si el mensaje trae `(REF #<ref>)` del botón "Consultar" de la web, el sistema MUST abrir la
consulta con origen `web`. Si el auto está disponible, MUST pasar a ser el auto de interés;
si no, MUST NOT cargarse, y el agente MUST saber que ya no está.

Si trae `[AS:<slug>]` de un asesor activo y no borrado, la consulta en la que sigue la charla (la nueva o
la abierta) MUST quedar asignada a ese asesor, con `atribuido`, aunque tuviera otro. Si eso le cambia el
asesor a una consulta abierta, la consulta MUST conservar su charla y sus respuestas, quedar marcada para el
asesor nuevo con el motivo "Llegó por tu link", volver a pendiente si estaba atendida y subir al principio
de la lista. El link MUST valer aunque el asesor no participe del reparto por turnos, y MUST NOT gastar
turno. Con un código inexistente, inactivo o borrado, el código MUST ignorarse y la consulta MUST seguir
como si no lo trajera: una consulta nueva va por turno (ver Reparto por turnos de las consultas nuevas) y
una abierta conserva su asesor. El código del asesor MUST quitarse del texto. Una ref o un código con
caracteres raros MUST ignorarse.
<!-- id: atender.sesionDe -->

#### Scenario: Desde la web con link de asesor
- **WHEN** el mensaje trae la ref de un auto disponible y el código de un asesor activo
- **THEN** la consulta arranca con origen web, ese auto como interés y ese asesor asignado
<!-- test: src/agente/atender.test.js › "desde la web: la consulta arranca con origen web, el auto cargado y el asesor que trajo al cliente" -->

#### Scenario: Asesor inexistente
- **WHEN** el código de asesor no corresponde a ninguno activo y no hay nadie en el turno
- **THEN** la consulta queda sin asesor
<!-- test: src/agente/atender.test.js › "desde la web con un asesor que no existe: la consulta queda sin asesor" -->

#### Scenario: Sin link de asesor
- **WHEN** el mensaje no trae código de asesor, venga de la web o escriba directo
- **THEN** la consulta nueva va por turno entre los asesores habilitados, sin atribuir
<!-- test: src/agente/atender.test.js › "sin link de un asesor la consulta va por turno, venga de la web o escriba directo" -->

#### Scenario: El cliente de otro asesor vuelve por un link
- **WHEN** el cliente de Juan, con la consulta abierta, vuelve por el link de Pepito
- **THEN** esa consulta pasa a ser de Pepito, atribuida, y sigue en la misma consulta
<!-- test: src/agente/atender.test.js › "el cliente de Juan que vuelve por el link de Pepito: la consulta abierta pasa a ser de Pepito" -->
<!-- test: src/agente/atender.test.js › "desde la web por el mismo auto con otro asesor: la consulta abierta pasa al del link" -->

#### Scenario: El asesor nuevo la recibe completa
- **WHEN** la consulta abierta de Juan, atendida y con respuestas, pasa a Pepito por su link
- **THEN** conserva la charla y las respuestas, queda marcada "Llegó por tu link", pendiente y arriba de la lista
<!-- test: FALTA -->

#### Scenario: El link se queda con una consulta sin asignar
- **WHEN** la consulta abierta no tenía asesor y llega con el link de uno
- **THEN** pasa a ser de ese asesor, sin gastar turno
<!-- test: src/agente/atender.test.js › "el link de un asesor se queda con una consulta que estaba sin asignar" -->

#### Scenario: El link del mismo asesor
- **WHEN** el link es del asesor que ya tiene la consulta
- **THEN** no se escribe nada de más: ni aviso ni cambio de orden
<!-- test: src/agente/atender.test.js › "el link del mismo asesor que ya tiene la consulta no escribe nada de más" -->

#### Scenario: Asesor fuera del turno
- **WHEN** el link es de un asesor con "recibe consultas" apagado
- **THEN** la consulta es suya igual y el turno no avanza
<!-- test: src/agente/atender.test.js › "el link de un asesor que no participa del turno vale igual y no gasta turno" -->
<!-- test: src/agente/reparto.test.js › "el link vale aunque el asesor no participe del turno" -->

#### Scenario: Link inválido
- **WHEN** el código es de un asesor inexistente, inactivo o borrado
- **THEN** se ignora y la consulta abierta sigue con su asesor
<!-- test: src/agente/atender.test.js › "un link inválido (inexistente, inactivo) se ignora: la consulta abierta sigue con su asesor" -->
<!-- test: src/agente/reparto.test.js › "un link sin código, inexistente, de un asesor inactivo o borrado se ignora" -->

#### Scenario: Consulta ya abierta, sin auto
- **WHEN** la consulta ya estaba abierta sin auto de interés y llega un mensaje de la web por un auto disponible
- **THEN** ese auto pasa a ser el de interés y suma sus puntos
<!-- test: src/agente/atender.test.js › "desde la web con la consulta abierta sin auto: el auto de la web pasa a ser el de interés y suma sus puntos" -->

#### Scenario: Consulta ya abierta, por otro auto
- **WHEN** la consulta abierta es por otro auto y llega un mensaje de la web por un auto disponible
- **THEN** sigue en la misma consulta con el auto nuevo (ver Otro auto dentro del plazo sigue en la misma consulta)
<!-- test: src/agente/atender.test.js › "desde la web por otro auto dentro del plazo: sigue en la misma consulta, con el auto nuevo y el aviso" -->

#### Scenario: Auto que ya no está
- **WHEN** la ref es de un auto que ya no está disponible
- **THEN** no se carga y se le avisa al agente
<!-- test: src/agente/atender.test.js › "desde la web por un auto que ya no está: no se carga y se le avisa al agente" -->

#### Scenario: Mensaje común
- **WHEN** el mensaje no trae ref
- **THEN** no se buscan autos y la consulta es de WhatsApp
<!-- test: src/agente/atender.test.js › "un mensaje común no busca autos ni asesores y la consulta es de whatsapp" -->
<!-- test: src/agente/origen-web.test.js › "un mensaje común no trae ref ni asesor y queda igual" -->

#### Scenario: Lectura del mensaje predefinido
- **WHEN** llega el mensaje predefinido de la web
- **THEN** se saca la ref y el código del asesor, y el código se quita del texto
<!-- test: src/agente/origen-web.test.js › "del mensaje predefinido de la web saca la ref del auto" -->
<!-- test: src/agente/origen-web.test.js › "saca el código del asesor y lo quita del texto (el cliente no tiene por qué verlo repetido)" -->
<!-- test: src/agente/origen-web.test.js › "una ref o un código con caracteres raros no se toman" -->

## REMOVED Requirements

### Requirement: Una consulta por auto
**Reason**: El user pidió que, dentro del mes, el interés por otro auto siga en la misma consulta
(`OBJETIVO.md`, punto 1).
**Migration**: Ver Otro auto dentro del plazo sigue en la misma consulta. Los tests de
`consultas-por-auto.test.js` se reemplazan por los de la regla nueva. Las consultas superpuestas que
quedaron de antes siguen la regla de varias consultas vigentes (va a la del último mensaje).

### Requirement: Una consulta dura 24 horas desde el último mensaje
**Reason**: El user pidió que la consulta dure un mes (`OBJETIVO.md`, puntos 1 y 2).
**Migration**: Ver Una consulta dura 30 días desde el último mensaje. El test de 23 y 25 horas se
reemplaza por el de 29 y 31 días.
