## ADDED Requirements

### Requirement: Reparto por turnos de las consultas nuevas
Cada consulta nueva sin link de asesor válido, y sin asesor que heredar, MUST asignarse por turnos
entre los asesores habilitados, con `atribuido` en falso. Habilitado MUST significar: asesor activo, no
borrado, con "recibe consultas" y que no esté vinculado a una cuenta de administrador vigente
(`usuarios.vendedor_id` con rol admin, activa y no borrada).
<!-- id: reparto.idsDelTurno -->

#### Scenario: Rotación
- **WHEN** llegan seis consultas sin link con tres asesores habilitados y uno excluido
- **THEN** reciben 1, 2, 3, 1, 2, 3 y el excluido nunca recibe
<!-- test: src/agente/reparto.test.js › "seis consultas sin link rotan 1, 2, 3, 1, 2, 3 y nunca llegan al excluido, al inactivo ni al borrado" -->
<!-- test: src/agente/atender.test.js › "seis consultas nuevas sin link se reparten 1, 2, 3, 1, 2, 3 y el excluido nunca recibe" -->

#### Scenario: El turno no atribuye
- **WHEN** una consulta recibe asesor por turno
- **THEN** queda con `atribuido` en falso
<!-- test: src/agente/reparto.test.js › "el turno asigna sin atribuir" -->

#### Scenario: Administradores
- **WHEN** un asesor está vinculado a una cuenta de administrador vigente
- **THEN** no recibe del turno; una cuenta de administrador dada de baja o un usuario asesor no lo excluyen
<!-- test: src/agente/reparto.test.js › "el asesor vinculado a una cuenta de administrador no recibe del turno" -->
<!-- test: src/agente/reparto.test.js › "una cuenta de administrador dada de baja o un usuario asesor no excluyen al vendedor" -->

### Requirement: Orden del turno y puntero
El turno MUST seguir el orden de `id` y dar la vuelta. El último asesor que recibió por turno MUST
guardarse en `configuracion.reparto_ultimo_vendedor`; el siguiente es el primero habilitado con `id` mayor,
o el primero si no hay. El puntero MUST avanzar solo cuando se asigna. Elegir y guardar MUST hacerse en una
transacción que lee el puntero con `SELECT ... FOR UPDATE` parametrizado, para que dos consultas
simultáneas no reciban el mismo turno.
<!-- id: reparto.asesorPorTurno -->

#### Scenario: Puntero
- **WHEN** el último que recibió ya no está habilitado, es mayor que todos, o el puntero es ilegible
- **THEN** el turno sigue con el primero de `id` mayor, o vuelve al primero
<!-- test: src/agente/reparto.test.js › "el siguiente es el primero con id mayor al último, aunque el último ya no esté" -->
<!-- test: src/agente/reparto.test.js › "si el último es mayor que todos los elegibles, vuelve al primero" -->
<!-- test: src/agente/reparto.test.js › "un puntero ilegible arranca desde el primero" -->
<!-- test: src/agente/reparto.test.js › "el puntero queda guardado en la configuración con el id del último que recibió" -->

#### Scenario: Consultas simultáneas
- **WHEN** seis consultas piden turno al mismo tiempo
- **THEN** ninguna repite turno antes de dar la vuelta, porque el puntero se lee con `FOR UPDATE` dentro de una transacción
<!-- test: src/agente/reparto.test.js › "seis consultas simultáneas reciben seis turnos distintos: ninguno se repite antes de dar la vuelta" -->
<!-- test: src/agente/reparto.test.js › "el turno lee el puntero con SELECT ... FOR UPDATE parametrizado dentro de una transacción" -->

### Requirement: Sin reparto o sin asesores habilitados
Con el reparto apagado (`reparticion_equitativa` en `0`) o sin ningún asesor habilitado, la consulta MUST
quedar sin asignar y el puntero MUST NOT moverse. Sin la fila `reparticion_equitativa`, el reparto MUST
considerarse encendido. Si el turno falla (deadlock, timeout), la consulta MUST quedar sin asignar y el
mensaje MUST atenderse igual; solo un deadlock se reintenta, una vez.
<!-- id: reparto.asesorPorTurno.sinReparto -->

#### Scenario: Reparto apagado
- **WHEN** `reparticion_equitativa` está en `0`
- **THEN** la consulta queda sin asignar y el puntero no se mueve
<!-- test: src/agente/reparto.test.js › "con el reparto apagado nadie recibe y el puntero no se mueve" -->
<!-- test: src/agente/atender.test.js › "con el reparto apagado las consultas sin link quedan sin asignar" -->

#### Scenario: Encendido por defecto
- **WHEN** no existe la fila `reparticion_equitativa`
- **THEN** el reparto funciona
<!-- test: src/agente/reparto.test.js › "sin la fila de configuración el reparto está encendido" -->

#### Scenario: El turno falla
- **WHEN** la transacción del turno falla, o da deadlock otra vez en el reintento
- **THEN** la consulta se crea sin asignar, el error se registra y el mensaje se guarda y se responde
<!-- test: src/agente/reparto.test.js › "si la transacción del turno falla, la consulta queda sin asignar y el error se registra" -->
<!-- test: src/agente/reparto.test.js › "si el reintento del deadlock también falla, queda sin asignar y no se reintenta de nuevo" -->
<!-- test: src/agente/atender.test.js › "si el turno falla, la consulta se crea igual sin asesor y el mensaje se guarda y se responde" -->

#### Scenario: Deadlock reintentado
- **WHEN** la transacción del turno da deadlock una vez y el reintento sale bien
- **THEN** se asigna el turno y el puntero avanza
<!-- test: src/agente/reparto.test.js › "un deadlock (P2034) se reintenta una vez y, si el reintento sale bien, asigna y avanza el puntero" -->

#### Scenario: Aislamiento de la transacción
- **WHEN** se abre la transacción del turno
- **THEN** pide READ COMMITTED, con tope de espera y de duración
<!-- test: src/agente/reparto.test.js › "la transacción del turno pide READ COMMITTED con tope de espera y de duración" -->

#### Scenario: Ningún asesor participa
- **WHEN** no hay ningún asesor habilitado
- **THEN** la consulta queda sin asignar y el puntero no se mueve
<!-- test: src/agente/reparto.test.js › "si ningún asesor participa queda sin asignar y el puntero no se mueve" -->
<!-- test: src/agente/atender.test.js › "si ningún asesor participa, la consulta queda sin asignar" -->

### Requirement: Solo se reparte al crear la consulta
Una consulta abierta sin asesor MUST NOT reasignarse en mitad de la charla, salvo por el link de un
asesor. Una consulta vencida MUST NOT conservar su asesor: la que se abre después va por turno.
<!-- id: atender.sesionDe.soloAlCrear -->

#### Scenario: Solo al crear la consulta
- **WHEN** llega un mensaje sin link a una consulta abierta sin asesor
- **THEN** no se reasigna; si la consulta estaba vencida, la nueva va por turno
<!-- test: src/agente/atender.test.js › "una consulta abierta sin asesor no se reparte en mitad de la charla" -->
<!-- test: src/agente/atender.test.js › "una consulta vencida no sigue con su asesor: la nueva va por turno" -->

### Requirement: El puntero del reparto es interno
`reparto_ultimo_vendedor` MUST NOT salir por la API de configuración ni poder escribirse desde ella.
<!-- id: config.service.puntero -->

#### Scenario: El puntero es interno
- **WHEN** se pide o se actualiza la configuración
- **THEN** `reparto_ultimo_vendedor` no sale en la respuesta y no se escribe
<!-- test: src/services/config.service.test.js › "el puntero del reparto por turnos no sale por la API" -->
<!-- test: src/services/config.service.test.js › "el puntero del reparto por turnos no se puede escribir desde la configuración" -->

## MODIFIED Requirements

### Requirement: Consultas que llegan desde la web
Si el mensaje trae `(REF #<ref>)` del botón "Consultar" de la web, el sistema MUST abrir la
consulta con origen `web`. Si el auto está disponible, MUST pasar a ser el auto de interés;
si no, MUST NOT cargarse, y el agente MUST saber que ya no está.

Si trae `[AS:<slug>]` de un asesor activo y no borrado, la consulta en la que sigue la charla (la nueva,
la abierta, o la de otro auto que se abre o se retoma) MUST quedar asignada a ese asesor, con `atribuido`,
aunque tuviera otro. El link MUST valer aunque el asesor no participe del reparto por turnos, y MUST NOT
gastar turno. Con un código inexistente, inactivo o borrado, el código MUST ignorarse y la consulta
MUST seguir como si no lo trajera: una consulta nueva va por turno (ver Reparto por turnos de las
consultas nuevas) y una abierta conserva su asesor. El código del asesor MUST quitarse del texto. Una ref
o un código con caracteres raros MUST ignorarse.
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

#### Scenario: El link se queda con una consulta sin asignar
- **WHEN** la consulta abierta no tenía asesor y llega con el link de uno
- **THEN** pasa a ser de ese asesor, sin gastar turno
<!-- test: src/agente/atender.test.js › "el link de un asesor se queda con una consulta que estaba sin asignar" -->

#### Scenario: El link del mismo asesor
- **WHEN** el link es del asesor que ya tiene la consulta
- **THEN** no se escribe nada de más
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
- **THEN** se abre (o se retoma) la consulta de ese auto (ver Una consulta por auto)
<!-- test: src/agente/atender.test.js › "desde la web por otro auto con la consulta abierta: abre otra consulta para ese auto" -->

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

### Requirement: Una consulta por auto
Cuando un cliente con una consulta por un auto se interesa en OTRO auto disponible, el sistema
MUST llevar ese auto en su propia consulta. Solo dos señales MUST contar como interés:
- la IA registra otro auto de interés (`registrar_calificacion`);
- el cliente llega desde la web con el link de otro auto.

Pedir fotos, comparar o preguntar por otro auto MUST NOT abrir una consulta.

Si el cliente ya tiene una consulta vigente (últimas 24 horas) por ese auto, MUST retomarse y
completarse con las respuestas de la persona que le falten. Si el mensaje trae el link de un asesor, la
consulta retomada MUST pasar a ser de ese asesor; sin link, MUST NOT tocarse su asesor. Si no hay consulta
vigente, MUST abrirse una nueva que:
- copia las respuestas de la persona: forma de pago, anticipo, recibo o garante, si entrega
  un usado (con sus datos), quién decide y cuándo puede venir;
- no copia la visita acordada, que es por el otro auto;
- queda con el mismo origen;
- queda con el asesor del link del mensaje, si lo trae; si no, con el de la consulta actual (y su
  `atribuido`) mientras siga activo y no borrado; si no tiene o ya no está activo, va por turno (ver
  Reparto por turnos de las consultas nuevas);
- nace con el puntaje y la temperatura recalculados (ver `agente-calificacion` › Temperatura del cliente).

La consulta anterior MUST quedar como estaba, con su temperatura. El resto del turno (otras
herramientas y el cierre) MUST seguir en la consulta del auto nuevo. Crear la consulta MUST
hacerlo el backend con su usuario de base: el usuario de la IA no puede crear consultas.
<!-- id: consultas-por-auto.consultaPorAuto -->

#### Scenario: Otro auto sin consulta
- **WHEN** el cliente se interesa en otro auto y no tiene consulta por ese auto
- **THEN** se abre una consulta nueva con las respuestas de la persona, el usado y el mismo asesor
<!-- test: src/agente/consultas-por-auto.test.js › "otro auto sin consulta: abre una nueva con las respuestas de la persona, el usado y el mismo asesor" -->
<!-- test: src/agente/consultas-por-auto.test.js › "otro auto sin consulta: heredar al asesor activo no gasta turno" -->
<!-- test: src/agente/atender.test.js › "desde la web por otro auto sin link: la consulta nueva sigue con el asesor de la anterior" -->

#### Scenario: El asesor heredado ya no está
- **WHEN** el asesor de la consulta actual está inactivo o borrado, o la consulta no tiene asesor
- **THEN** la consulta nueva va por turno
<!-- test: src/agente/consultas-por-auto.test.js › "otro auto sin consulta: si el asesor ya no está activo o fue borrado, la nueva va por turno" -->
<!-- test: src/agente/consultas-por-auto.test.js › "otro auto sin consulta: si la consulta actual no tiene asesor, la nueva va por turno" -->

#### Scenario: El link gana al asesor heredado
- **WHEN** el mensaje trae el link de otro asesor
- **THEN** la consulta nueva es de ese asesor, atribuida, y no se gasta turno
<!-- test: src/agente/consultas-por-auto.test.js › "otro auto sin consulta: el link de otro asesor gana al heredado" -->
<!-- test: src/agente/atender.test.js › "desde la web por otro auto con el link de Pepito: la consulta nueva es de Pepito y la anterior no se toca" -->

#### Scenario: Vuelve a un auto que ya consultó
- **WHEN** el cliente vuelve a un auto que tiene una consulta vigente
- **THEN** se retoma esa consulta y se le completa lo que faltaba de la persona
<!-- test: src/agente/consultas-por-auto.test.js › "otro auto con consulta abierta: la retoma y le completa lo que faltaba de la persona" -->

#### Scenario: Retomar con link de un asesor
- **WHEN** se retoma una consulta y el mensaje trae el link de un asesor
- **THEN** la consulta pasa a ser de ese asesor; sin link, su asesor no se toca
<!-- test: src/agente/consultas-por-auto.test.js › "otro auto con consulta abierta: el link de un asesor se la queda aunque fuera de otro" -->
<!-- test: src/agente/consultas-por-auto.test.js › "otro auto con consulta abierta: sin link no se toca el asesor de la que se retoma" -->

#### Scenario: Consulta vieja de ese auto
- **WHEN** la única consulta por ese auto es de hace más de 24 horas
- **THEN** no se retoma: se abre una nueva
<!-- test: src/agente/consultas-por-auto.test.js › "una consulta de ese auto de hace más de 24 h no se retoma" -->

#### Scenario: La IA registra otro auto
- **WHEN** la IA registra un auto de interés distinto al de la consulta
- **THEN** las respuestas se guardan en la consulta de ese auto y la anterior no se toca
<!-- test: src/agente/herramientas.test.js › "registrar_calificacion con otro auto registra en la consulta de ese auto y no toca la anterior" -->

#### Scenario: Mismo auto o consulta sin auto
- **WHEN** la IA registra el mismo auto, o la consulta todavía no tenía auto
- **THEN** sigue en la misma consulta
<!-- test: src/agente/herramientas.test.js › "registrar_calificacion con el mismo auto, o si la consulta no tenía auto, sigue en la misma consulta" -->

#### Scenario: El resto del turno sigue en la consulta nueva
- **WHEN** una herramienta cambia de consulta en medio del turno
- **THEN** las herramientas siguientes y el cierre del turno usan la consulta nueva
<!-- test: src/agente/agente.test.js › "si una herramienta cambia de consulta, las siguientes del turno usan la nueva y la respuesta la informa" -->
<!-- test: src/agente/atender.test.js › "el turno se cierra en la consulta del auto que quedó activo" -->

#### Scenario: Pedir fotos de otro auto
- **WHEN** el cliente pide fotos de otro auto
- **THEN** no se abre ninguna consulta
<!-- test: src/agente/herramientas.test.js › "pedir fotos de otro auto no abre una consulta" -->
