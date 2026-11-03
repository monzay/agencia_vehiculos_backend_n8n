# agente-calificacion

> BORRADOR — extraído del código el 2026-10-30, pendiente de revisión del dueño.
> Reglas de negocio: bóveda › Sistema de Clasificación de Leads. El 2026-10-31 se corrigió la
> regla "con recibo → CALIENTE" para que coincida con la bóveda (antes exigía además dudar).
> El 2026-10-31 (decisión del dueño): toda consulta nace con 0 puntos y FRIO y se recalcula
> con cada respuesta; se quitaron el estado "en calificación" y el pase a FRIO a las 24 h.
> Fuente: src/agente/calificacion.js, src/agente/herramientas.js (registrar_calificacion),
> src/agente/atender.js (sesionDe).

## Purpose

Cómo se califica a un cliente que consulta por un auto. La IA solo junta las respuestas;
el puntaje y la temperatura (CALIENTE / TIBIO / FRIO) los calcula el backend con reglas
fijas, siempre desde cero con las respuestas vigentes.

## Requirements

### Requirement: Puntaje del cliente
El sistema MUST calcular el puntaje sumando:

| Respuesta | Puntos |
|---|---|
| Tiene auto de interés | +2 |
| Paga de contado | +3 |
| Paga financiado | 0 |
| Financia con recibo de sueldo o garante | +2 |
| Financia sin recibo ni garante | −2 |
| Entrega un usado | +1 |
| Decide solo | +2 |
| Lo consulta con alguien | −1 |
| Puede venir esta semana | +3 |
| Puede venir en las próximas semanas | +1 |
| No sabe cuándo puede venir | −1 |

El puntaje MUST NOT ser menor que 0. El recibo o garante MUST NOT contar si paga de contado.
El resultado MUST NOT depender del orden en que respondió. La situación crediticia del BCRA
MUST NOT sumar ni restar puntos ni cambiar la temperatura: es solo informativa para el asesor
(ver `agente-credito`, decisión del 2026-11-01).
<!-- id: calificacion.puntaje -->

#### Scenario: Sesión sin respuestas
- **WHEN** el cliente todavía no respondió nada
- **THEN** el puntaje es 0 y es FRIO
<!-- test: src/agente/calificacion.test.js › "sesión sin respuestas: puntaje 0 y frío" -->

#### Scenario: Suma de puntos
- **WHEN** el cliente responde una pregunta
- **THEN** su respuesta suma los puntos de la tabla
<!-- test: src/agente/calificacion.test.js › "cada respuesta suma sus puntos" -->

#### Scenario: Puntaje negativo
- **WHEN** la suma da menos de 0
- **THEN** el puntaje queda en 0
<!-- test: src/agente/calificacion.test.js › "el puntaje nunca baja de 0" -->

#### Scenario: Orden de las respuestas
- **WHEN** dos clientes dan las mismas respuestas en distinto orden
- **THEN** tienen el mismo puntaje y la misma clasificación
<!-- test: src/agente/calificacion.test.js › "el resultado no depende del orden en que respondió" -->

#### Scenario: Paga de contado
- **WHEN** paga de contado
- **THEN** el recibo y el anticipo no cuentan, ni para el puntaje ni para la temperatura
<!-- test: src/agente/calificacion.test.js › "si paga de contado, el recibo y el anticipo no cuentan (ni para la temperatura)" -->

### Requirement: Temperatura del cliente
Toda consulta MUST nacer con 0 puntos y FRIO. Con cada respuesta, el sistema MUST recalcular
la temperatura con todas las respuestas vigentes, en este orden:
1. Financia sin recibo ni garante → FRIO, sume lo que sume: no tiene cómo comprar hoy.
2. Financia con recibo o garante → CALIENTE, sume lo que sume, aunque lo consulte con
   alguien o no sepa cuándo viene: la duda es de agenda, no de plata.
3. Puntaje ≥ 7 → CALIENTE.
4. Puntaje de 3 a 6 → TIBIO.
5. Puntaje < 3 → FRIO.
<!-- id: calificacion.clasificar -->

#### Scenario: Contado, decide solo y viene esta semana
- **WHEN** paga de contado, decide solo y viene esta semana
- **THEN** es CALIENTE
<!-- test: src/agente/calificacion.test.js › "contado, decide solo y viene esta semana: caliente" -->

#### Scenario: La consulta nace fría
- **WHEN** se crea una consulta nueva
- **THEN** nace con 0 puntos y FRIO (si viene de la web por un auto, con los 2 puntos del auto)
<!-- test: src/agente/atender.test.js › "la consulta nueva nace con 0 puntos y fría" -->
<!-- test: src/agente/atender.test.js › "desde la web nace fría con los puntos del auto de interés" -->

#### Scenario: Puntaje entre 3 y 6
- **WHEN** el puntaje está entre 3 y 6
- **THEN** es TIBIO
<!-- test: src/agente/calificacion.test.js › "puntaje entre 3 y 6: tibio" -->

#### Scenario: Puntaje menor a 3
- **WHEN** el puntaje es menor a 3
- **THEN** es FRIO
<!-- test: src/agente/calificacion.test.js › "puntaje menor a 3: frío" -->

#### Scenario: Sin forma de pago
- **WHEN** todavía no dijo cómo paga
- **THEN** se califica por el puntaje que lleva
<!-- test: src/agente/calificacion.test.js › "sin la forma de pago se califica por el puntaje que lleva" -->

#### Scenario: Financia y no dijo si tiene recibo
- **WHEN** financia pero todavía no dijo si tiene recibo o garante
- **THEN** se califica por el puntaje que lleva
<!-- test: src/agente/calificacion.test.js › "financia y todavía no dijo si tiene recibo: se califica por el puntaje" -->

#### Scenario: Contado
- **WHEN** solo dijo que paga de contado
- **THEN** es TIBIO
<!-- test: src/agente/calificacion.test.js › "contado solo ya es tibio" -->

#### Scenario: Con recibo, sume lo que sume
- **WHEN** financia con recibo o garante, con cualquier puntaje (también si decide solo o viene en las próximas semanas)
- **THEN** es CALIENTE
<!-- test: src/agente/calificacion.test.js › "con recibo o garante es caliente, sume lo que sume" -->

#### Scenario: Con recibo y lo consulta con alguien
- **WHEN** financia con recibo y lo consulta con alguien
- **THEN** es CALIENTE
<!-- test: src/agente/calificacion.test.js › "con recibo aunque lo consulte con alguien: caliente" -->

#### Scenario: Con recibo y no sabe cuándo viene
- **WHEN** financia con recibo y no sabe cuándo viene
- **THEN** es CALIENTE
<!-- test: src/agente/calificacion.test.js › "con recibo aunque no sepa cuándo viene: caliente" -->

#### Scenario: Financia sin recibo ni garante
- **WHEN** financia sin recibo ni garante
- **THEN** es FRIO aunque sume mucho
<!-- test: src/agente/calificacion.test.js › "financiado sin recibo ni garante: frío aunque sume mucho" -->

### Requirement: Lo que falta preguntar, en orden
El sistema MUST darle al agente la lista de lo que falta, en el orden del recorrido:
1. auto de interés;
2. forma de pago;
3. anticipo (si financia);
4. recibo o garante (si financia);
5. si entrega un usado;
6. marca, modelo y año del usado, y cuánto pide o si no sabe (si entrega);
7. quién decide;
8. cuándo puede venir.

Del usado MUST NOT pedirse kilómetros ni estado. La visita MUST darse por resuelta con un
momento acordado o con "no sabe".
<!-- id: calificacion.pendientes -->

#### Scenario: Todo respondido
- **WHEN** el cliente respondió todo
- **THEN** no falta nada
<!-- test: src/agente/calificacion.test.js › "con todo respondido no falta nada" -->

#### Scenario: Nada respondido
- **WHEN** el cliente no respondió nada
- **THEN** falta todo, en el orden del recorrido
<!-- test: src/agente/calificacion.test.js › "sin nada, falta todo en el orden del recorrido" -->

#### Scenario: Financia
- **WHEN** el cliente financia
- **THEN** se agregan anticipo y recibo o garante
<!-- test: src/agente/calificacion.test.js › "si financia, pide anticipo y recibo o garante" -->

#### Scenario: Entrega un usado
- **WHEN** el cliente entrega un usado
- **THEN** se pide marca, modelo y año, y después cuánto pide (no km ni estado)
<!-- test: src/agente/calificacion.test.js › "si entrega usado, pide solo marca, modelo y año y después cuánto pide (km y estado se ven en la agencia)" -->

#### Scenario: La visita
- **WHEN** acordó un día, o dijo que no sabe cuándo puede venir
- **THEN** la visita está resuelta y no se insiste
<!-- test: src/agente/calificacion.test.js › "la visita: con día acordado está completa; si no sabe cuándo, no se insiste" -->
<!-- test: src/agente/calificacion.test.js › "con la visita acordada alcanza, aunque no haya guardado la disponibilidad" -->

### Requirement: Resumen de lo ya respondido
El sistema MUST darle al agente, en palabras, lo que el cliente ya respondió (usado incluido),
para que no lo vuelva a preguntar. Lo que dictó el cliente MUST ir entre comillas.
<!-- id: calificacion.respondido -->

#### Scenario: Con respuestas
- **WHEN** el cliente ya respondió preguntas, incluido el usado
- **THEN** el resumen lo incluye todo
<!-- test: src/agente/calificacion.test.js › "resume lo ya respondido, usado incluido" -->

#### Scenario: Sin respuestas o sin usado
- **WHEN** no hay respuestas, o el cliente no entrega usado
- **THEN** no hay nada que resumir, o el resumen dice que no entrega usado
<!-- test: src/agente/calificacion.test.js › "sin respuestas no hay nada que resumir; sin usado lo dice" -->

### Requirement: Guardar lo que respondió el cliente
Cuando el agente llama a `registrar_calificacion`, el sistema MUST:
- actualizar solo la consulta del cliente que escribe;
- guardar solo lo que dijo ahora: un dato nulo MUST NOT borrar uno anterior;
- recalcular puntaje y temperatura;
- devolver lo que falta.

Además:
- El auto de interés MUST guardarse solo si existe y está a la venta. Si es otro que el de la
  consulta, las respuestas MUST guardarse en la consulta de ese auto (ver `agente-conversacion` ›
  Una consulta por auto).
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
