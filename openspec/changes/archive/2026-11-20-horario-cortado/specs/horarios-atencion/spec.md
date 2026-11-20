## ADDED Requirements

### Requirement: Horario corrido o cortado
Cada día abierto MUST tener una primera franja (`apertura`, `cierre`) y MAY tener una segunda (`apertura_2`,
`cierre_2`), completa o ausente, que abre después del cierre de la primera y antes de su propio cierre. Un
día cerrado MUST guardarse sin horas. Las horas MUST ser HH:MM en 24 h. La lectura MUST devolver los seis
campos de cada día, con `null` en lo que no tiene.
<!-- id: horarios.franjas -->

#### Scenario: Día corrido
- **WHEN** se guarda el lunes de 08:00 a 21:00 sin segunda franja
- **THEN** queda con `apertura_2` y `cierre_2` en null
<!-- test: src/services/horarios.service.test.js › "un día corrido se guarda con una sola franja" -->

#### Scenario: Día cortado
- **WHEN** se guarda el lunes de 08:00 a 13:00 y de 16:00 a 21:00
- **THEN** quedan guardadas las dos franjas
<!-- test: src/services/horarios.service.test.js › "un día cortado se guarda con las dos franjas" -->

#### Scenario: Segunda franja incompleta
- **WHEN** llega `apertura_2` sin `cierre_2`, o al revés
- **THEN** responde 400 con el nombre del día
<!-- test: src/services/horarios.service.test.js › "una segunda franja incompleta se rechaza" -->

#### Scenario: Segunda franja que se pisa con la primera
- **WHEN** el lunes llega de 08:00 a 13:00 y de 12:00 a 21:00
- **THEN** responde 400 con el nombre del día
<!-- test: src/services/horarios.service.test.js › "una segunda franja que empieza antes del primer cierre se rechaza" -->

#### Scenario: Segunda franja al revés
- **WHEN** el lunes llega de 08:00 a 13:00 y de 21:00 a 16:00
- **THEN** responde 400 con el nombre del día
<!-- test: src/services/horarios.service.test.js › "una segunda franja que abre después de cerrar se rechaza" -->

#### Scenario: Día cerrado con horas
- **WHEN** el domingo llega cerrado pero con las cuatro horas cargadas
- **THEN** se guarda cerrado y sin ninguna hora
<!-- test: src/services/horarios.service.test.js › "un día cerrado se guarda sin horas aunque lleguen" -->

#### Scenario: Lectura con las dos franjas
- **WHEN** se leen los horarios
- **THEN** cada día trae `dia`, `abierto`, `apertura`, `cierre`, `apertura_2` y `cierre_2`
<!-- test: src/services/horarios.service.test.js › "los horarios se leen con las dos franjas" -->

### Requirement: Un día que no sirve no guarda nada
Si un día no cumple las reglas de las franjas, la API MUST responder 400 con el nombre del día y MUST NOT
guardar ningún día del pedido.
<!-- id: horarios.todo-o-nada -->

#### Scenario: Un día malo no guarda ninguno
- **WHEN** llegan el lunes bien y el martes con una segunda franja que se pisa
- **THEN** responde 400 y no se escribe ningún día
<!-- test: src/services/horarios.service.test.js › "si un día no sirve no se guarda ninguno" -->

### Requirement: La base protege la segunda franja
La migración 088 MUST agregar `apertura_2` y `cierre_2` (CHAR(5), NULL) a `horarios_atencion` con CHECKs de
formato HH:MM y de coherencia: las dos en null, o el día abierto con las dos cargadas, `apertura_2` mayor que
`cierre` y `cierre_2` mayor que `apertura_2`. MUST NOT cambiar los datos que ya están.
<!-- id: horarios.migracion-088 -->

#### Scenario: Base local
- **WHEN** se aplica la 088 en la base local
- **THEN** los 7 días quedan como estaban, una segunda franja válida se guarda y una que se pisa con la primera la rechaza la base
<!-- verificación manual en la base local, registrada en BITACORA.md -->

### Requirement: El bot dice el horario cortado
`horariosEnPalabras` MUST decir las dos franjas de un día cortado ("de 08:00 a 13:00 y de 16:00 a 21:00") y
MUST agrupar solo los días seguidos con las mismas franjas. Un día suelto entre dos tramos iguales MUST
plegarse como excepción solo si está cerrado, o si tiene las mismas franjas salvo la primera apertura
("desde las …") o el último cierre ("hasta las …"). Los días corridos MUST decirse como hasta ahora.
<!-- id: horarios.bot-palabras -->

#### Scenario: Semana cortada
- **WHEN** la agencia abre de lunes a viernes de 08:00 a 13:00 y de 16:00 a 21:00, el sábado de 08:00 a 13:00 y cierra el domingo
- **THEN** dice "lunes a viernes de 08:00 a 13:00 y de 16:00 a 21:00, sábados de 08:00 a 13:00, domingos cerrado"
<!-- test: src/agente/instrucciones.test.js › "horariosEnPalabras dice las dos franjas de un horario cortado" -->

#### Scenario: Un día corrido entre días cortados
- **WHEN** el miércoles es de 08:00 a 21:00 y el resto de lunes a viernes es cortado
- **THEN** el miércoles sale aparte: "lunes y martes de 08:00 a 13:00 y de 16:00 a 21:00, miércoles de 08:00 a 21:00, jueves y viernes de 08:00 a 13:00 y de 16:00 a 21:00, …"
<!-- test: src/agente/instrucciones.test.js › "horariosEnPalabras no junta un día corrido con días cortados" -->

#### Scenario: Día cerrado en una semana cortada
- **WHEN** el miércoles cierra y el resto de lunes a viernes es cortado
- **THEN** dice "lunes a viernes de 08:00 a 13:00 y de 16:00 a 21:00 (miércoles cerrado), …"
<!-- test: src/agente/instrucciones.test.js › "horariosEnPalabras pliega un día cerrado en una semana cortada" -->

#### Scenario: Día cortado que abre más tarde
- **WHEN** el miércoles es de 09:00 a 13:00 y de 16:00 a 21:00 y el resto de lunes a viernes abre a las 08:00
- **THEN** dice "lunes a viernes de 08:00 a 13:00 y de 16:00 a 21:00 (miércoles desde las 09:00), …"
<!-- test: src/agente/instrucciones.test.js › "horariosEnPalabras pliega un día cortado que solo abre más tarde" -->

### Requirement: La herramienta del bot da el horario de cada día en palabras
`horarios_atencion` MUST devolver por día `dia` (nombre), `abierto` y `horario`: "de 09:00 a 18:00",
"de 08:00 a 13:00 y de 16:00 a 21:00" o "cerrado".
<!-- id: horarios.herramienta -->

#### Scenario: Día cortado en la herramienta
- **WHEN** el bot pide los horarios y el lunes es cortado
- **THEN** el lunes trae `horario` "de 08:00 a 13:00 y de 16:00 a 21:00"
<!-- test: src/agente/herramientas.test.js › "horarios_atencion dice las dos franjas de un día cortado" -->

#### Scenario: Días corridos y cerrados en la herramienta
- **WHEN** el bot pide los horarios con el domingo cerrado y el lunes de 09:00 a 18:00
- **THEN** el domingo trae "cerrado" y el lunes "de 09:00 a 18:00"
<!-- test: src/agente/herramientas.test.js › "horarios_atencion devuelve los días con su nombre" -->

### Requirement: El panel edita el horario cortado
En Configuración, cada día abierto MUST tener un interruptor "Cortado" que muestra la segunda franja. Al
prenderlo, el día MUST partirse a las 13:00 y a las 16:00 (de 08:00 a 21:00 pasa a 08:00 a 13:00 y 16:00 a
21:00); al apagarlo, el día MUST volver a ser corrido, de la primera apertura al último cierre. El panel
MUST validar lo mismo que la API antes de mandar, y MUST mandar `apertura_2` y `cierre_2` en null para los
días que no son cortados.
<!-- id: front.horarios-panel -->

#### Scenario: Prender "Cortado"
- **WHEN** el lunes está de 08:00 a 21:00 y se prende "Cortado"
- **THEN** queda de 08:00 a 13:00 y de 16:00 a 21:00
<!-- test: ../sea_automotores/lib/horarios.test.js › "al prender cortado, el día se parte a las 13 y a las 16" -->

#### Scenario: Apagar "Cortado"
- **WHEN** el lunes está de 08:00 a 13:00 y de 16:00 a 21:00 y se apaga "Cortado"
- **THEN** queda de 08:00 a 21:00, sin segunda franja
<!-- test: ../sea_automotores/lib/horarios.test.js › "al apagar cortado, el día vuelve a ser corrido de punta a punta" -->

#### Scenario: Validación en el panel
- **WHEN** el lunes es cortado de 08:00 a 13:00 y de 12:00 a 21:00
- **THEN** el panel muestra el error con el nombre del día y no manda nada
<!-- test: ../sea_automotores/lib/horarios.test.js › "el panel rechaza una segunda franja que se pisa con la primera" -->

#### Scenario: Hora que no es HH:MM en el panel
- **WHEN** el lunes llega con apertura "8:00", o es cortado con una segunda franja "16h"
- **THEN** el panel muestra el error con el nombre del día y no manda nada, igual que la API
<!-- test: ../sea_automotores/lib/horarios.test.js › "el panel rechaza una hora que no es HH:MM" -->

#### Scenario: Lo que se manda
- **WHEN** se guarda una semana con días cortados, corridos y cerrados
- **THEN** solo los cortados llevan `apertura_2` y `cierre_2`; el resto los lleva en null
<!-- test: ../sea_automotores/lib/horarios.test.js › "solo los días cortados mandan la segunda franja" -->

### Requirement: La portada muestra el horario cortado
La sección Contacto de la portada MUST mostrar cada día con sus franjas: "08:00 - 13:00 y 16:00 - 21:00",
"09:00 - 18:00" o "Cerrado".
<!-- id: front.horarios-portada -->

#### Scenario: Día cortado en la portada
- **WHEN** el lunes es cortado
- **THEN** se lee "Lunes: 08:00 - 13:00 y 16:00 - 21:00"
<!-- test: ../sea_automotores/lib/horarios.test.js › "un día cortado se muestra con las dos franjas" -->

#### Scenario: Días corridos y cerrados en la portada
- **WHEN** el lunes es de 09:00 a 18:00 y el domingo cierra
- **THEN** se leen "09:00 - 18:00" y "Cerrado", como hasta ahora
<!-- test: ../sea_automotores/lib/horarios.test.js › "un día corrido y uno cerrado se muestran como antes" -->
