## MODIFIED Requirements

### Requirement: Contexto de cada turno
En cada mensaje, el sistema MUST pasarle al agente:
- el nombre de la asesora;
- el nombre de la agencia (para usar solo si lo preguntan);
- la dirección y el mapa;
- el link del catálogo (solo si es https);
- la fecha y hora de Argentina;
- el nombre del cliente, saneado;
- el auto de la consulta, si tiene uno: su descripción y su código, para usar con las herramientas. Si el
  mensaje viene de la web por ese mismo auto, MUST NOT repetirse;
- lo que el cliente ya respondió y lo que falta, en orden.
<!-- id: atender.contextoDelTurno -->

#### Scenario: Mensaje normal
- **WHEN** llega un mensaje
- **THEN** el agente recibe lo ya respondido, lo que falta y la dirección de la agencia
<!-- test: src/agente/atender.test.js › "en cada mensaje el agente recibe lo que ya respondió, lo que falta y la dirección de la agencia" -->

#### Scenario: Consulta con un auto
- **WHEN** llega un mensaje en una consulta que ya tiene auto
- **THEN** el agente recibe la descripción del auto y su código, aunque el mensaje no lo nombre
<!-- test: src/agente/atender.test.js › "en cada mensaje el agente recibe el auto de la consulta con su código" -->
<!-- test: src/agente/instrucciones.test.js › "el contexto dice cuál es el auto de la consulta y su código" -->

#### Scenario: No se puede leer el auto de la consulta
- **WHEN** falla la lectura del auto de la consulta
- **THEN** el agente responde igual, sin la línea del auto
<!-- test: src/agente/atender.test.js › "si no se puede leer el auto de la consulta, el agente responde igual" -->

#### Scenario: Sin auto o desde la web por el mismo auto
- **WHEN** la consulta no tiene auto, o el mensaje viene de la web por ese mismo auto
- **THEN** no se agrega la línea del auto de la consulta
<!-- test: src/agente/instrucciones.test.js › "sin auto en la consulta, o si viene de la web por el mismo auto, no agrega la línea" -->

#### Scenario: Link del catálogo
- **WHEN** la URL pública configurada no es https
- **THEN** no se arma el link del catálogo
<!-- test: src/agente/origen-web.test.js › "el link del catálogo sale solo de una URL https configurada" -->
