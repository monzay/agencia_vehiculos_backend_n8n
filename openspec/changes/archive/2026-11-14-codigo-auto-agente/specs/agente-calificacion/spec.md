## MODIFIED Requirements

### Requirement: Guardar lo que respondió el cliente
Cuando el agente llama a `registrar_calificacion`, el sistema MUST:
- actualizar solo la consulta del cliente que escribe;
- guardar solo lo que dijo ahora: un dato nulo MUST NOT borrar uno anterior;
- recalcular puntaje y temperatura;
- devolver lo que falta.

Además:
- El auto de interés MUST guardarse solo si existe y está a la venta. El código se resuelve como dice
  `agente-herramientas` › El código del auto que escribe la IA: `#13` guarda el `13`. Si el auto no se
  guarda, el resultado MUST traer un `aviso` con el motivo (el código no existe o el auto no está a la venta),
  y lo demás que respondió el cliente MUST guardarse igual. Si es otro auto que el de la consulta, las
  respuestas MUST guardarse en la consulta de ese auto (ver `agente-conversacion` › Una consulta por auto).
- El usado MUST ser una sola fila por consulta: corregir un dato no borra los otros y una fila archivada se reactiva. Si no sabe cuánto pedir, queda "No sabe".
- Una visita acordada MUST avisar al vendedor, salvo que la consulta ya estuviera derivada (no se pisa el motivo).
<!-- id: herramientas.registrar_calificacion -->

#### Scenario: Calcula la temperatura
- **WHEN** el agente registra respuestas
- **THEN** se actualiza solo la consulta del cliente y se calcula la temperatura con las reglas
<!-- test: src/agente/herramientas.test.js › "registrar_calificacion actualiza solo la sesión del cliente y calcula la temperatura con las reglas" -->

#### Scenario: Conserva lo anterior
- **WHEN** el agente registra un dato nuevo
- **THEN** se conserva lo que el cliente ya había respondido
<!-- test: src/agente/herramientas.test.js › "registrar_calificacion conserva lo que el cliente ya había respondido" -->
<!-- test: src/agente/herramientas.test.js › "registrar_calificacion acepta que Claude mande solo lo que respondió el cliente" -->

#### Scenario: Auto de interés
- **WHEN** el agente manda el código de un auto
- **THEN** se guarda solo si está a la venta
<!-- test: src/agente/herramientas.test.js › "registrar_calificacion guarda el auto de interés por su código, solo si está a la venta" -->

#### Scenario: Auto de interés con # en el código
- **WHEN** el agente manda `#12` y el auto `12` está a la venta
- **THEN** se guarda ese auto
<!-- test: src/agente/herramientas.test.js › "registrar_calificacion guarda el auto de interés aunque la IA mande el código con #" -->

#### Scenario: Auto de interés que no se guarda
- **WHEN** el código no existe o el auto no está a la venta
- **THEN** el resultado trae un aviso con el motivo y lo demás se guarda igual
<!-- test: src/agente/herramientas.test.js › "registrar_calificacion avisa si no guardó el auto de interés y guarda el resto" -->

#### Scenario: Usado que entrega
- **WHEN** el cliente da datos del usado
- **THEN** se guardan; corregir uno no borra los otros y una fila archivada se reactiva en vez de duplicarse
<!-- test: src/agente/herramientas.test.js › "registrar_calificacion guarda el usado que entrega" -->
<!-- test: src/agente/herramientas.test.js › "registrar_calificacion corrige un dato del usado sin borrar los otros" -->
<!-- test: src/agente/herramientas.test.js › "registrar_calificacion reactiva el usado archivado en vez de duplicarlo" -->
<!-- test: src/agente/herramientas.test.js › "registrar_calificacion guarda km, detalles y cuánto pide por el usado" -->

#### Scenario: No sabe cuánto pedir
- **WHEN** el cliente no sabe cuánto pedir por el usado
- **THEN** queda anotado "No sabe"
<!-- test: src/agente/herramientas.test.js › "si no sabe cuánto pedir por el usado, queda anotado como 'No sabe'" -->

#### Scenario: Precio pedido inválido
- **WHEN** el precio pedido es 0 o negativo
- **THEN** se rechaza
<!-- test: src/agente/herramientas.test.js › "el precio pedido por el usado tiene que ser mayor a cero" -->

#### Scenario: Visita acordada
- **WHEN** el cliente acuerda una visita
- **THEN** se guarda y se avisa al vendedor
<!-- test: src/agente/herramientas.test.js › "registrar_calificacion guarda la visita propuesta y avisa al vendedor" -->

#### Scenario: Visita en una consulta ya derivada
- **WHEN** la consulta ya estaba derivada y el cliente acuerda una visita
- **THEN** no se pisa el motivo de la derivación
<!-- test: src/agente/herramientas.test.js › "una visita no pisa el motivo de una derivación anterior" -->

#### Scenario: Devuelve lo que falta
- **WHEN** se registran respuestas
- **THEN** devuelve lo que falta según el recorrido completo, usado incluido
<!-- test: src/agente/herramientas.test.js › "registrar_calificacion devuelve lo que falta según el recorrido completo, usado incluido" -->
