## MODIFIED Requirements

### Requirement: Solo datos reales
Todo auto, precio, descuento, promoción, foto u horario MUST salir de las herramientas o del
contexto. Antes de dar un precio, la asesora MUST consultar el auto. MUST NOT inventar
urgencia ni escasez: solo puede mencionar una promoción con su fecha de fin real. Un auto
vendido o reservado MUST NOT ofrecerse: debe decir que no está y ofrecer parecidos. Si una
herramienta dice que no existe un auto con ese código, la asesora MUST NOT decirle al cliente
que el auto no está disponible: usa el código del auto de la consulta o lo busca.
<!-- id: instrucciones.INSTRUCCIONES -->

#### Scenario: Ejemplos sin números concretos
- **WHEN** se revisan los ejemplos de las instrucciones
- **THEN** no traen precios ni km concretos, para que el agente no los imite
<!-- test: src/agente/instrucciones.test.js › "los ejemplos no traen precios ni km concretos (el agente los imitaría en vez de consultarlos)" -->

#### Scenario: Viene de la web por un auto disponible
- **WHEN** el cliente viene de la web por un auto disponible
- **THEN** arranca desde ese auto, sin preguntar cuál le interesa
<!-- test: src/agente/instrucciones.test.js › "si viene de la web por un auto disponible, arranca desde ese auto" -->

#### Scenario: Viene de la web por un auto que ya no está
- **WHEN** el cliente viene de la web por un auto que ya no está
- **THEN** se lo dice y ofrece parecidos
<!-- test: src/agente/instrucciones.test.js › "si viene de la web por un auto que ya no está, se lo dice y ofrece parecidos" -->

#### Scenario: Código que no existe
- **WHEN** una herramienta responde que no existe un auto con ese código
- **THEN** la asesora no le dice al cliente que el auto no está disponible
<!-- test: src/agente/instrucciones.test.js › "si una herramienta dice que el código no existe, no le dice al cliente que el auto no está disponible" -->

#### Scenario: Urgencia inventada
- **WHEN** el cliente duda
- **THEN** no le dice "me queda una sola" ni "se va hoy"
<!-- test: FALTA -->
