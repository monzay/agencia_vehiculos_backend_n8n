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
5. su CUIL, para que el asesor consulte su situación en el BCRA (si la verificación crediticia lo espera:
   no lo pasó, no dijo que no y no se consultó);
6. si entrega un usado;
7. marca, modelo y año del usado, y cuánto pide o si no sabe (si entrega);
8. quién decide;
9. cuándo puede venir.

El CUIL MUST entrar en la lista solo cuando `agente-credito` › Cuándo se consulta lo permite. Ya no hay un
paso de permiso aparte: pasar el CUIL es la autorización (`agente-credito` › Consentimiento antes de
consultar). Del usado MUST NOT pedirse kilómetros ni estado. La visita MUST darse por resuelta con un
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

#### Scenario: Falta el permiso
- **WHEN** el cliente financia, ya dijo lo del recibo o garante, y todavía no pasó el CUIL ni dijo que no
- **THEN** no figura un permiso aparte: figura el CUIL, con para qué es, después del recibo o garante y antes del usado
<!-- test: src/agente/calificacion.test.js › "si falta el CUIL, figura con para qué es, después del recibo o garante y antes del usado, sin un permiso aparte" -->
<!-- test: src/agente/atender.test.js › "el estado de la verificación entra en lo que falta: el CUIL va después del recibo y antes del usado" -->
<!-- eval: chats simulados › P10, E1 -->

#### Scenario: Financia y todavía no dijo lo del recibo
- **WHEN** el cliente financia, la verificación está activa y todavía no contestó lo del recibo o garante
- **THEN** el CUIL ya figura en lo que falta, justo después del recibo o garante, sin habilitar pedirlo antes de tiempo
<!-- test: src/agente/calificacion.test.js › "con el CUIL anticipado, figura justo después del recibo o garante (que todavía falta) y antes del usado" -->
<!-- test: src/credito/verificacion.test.js › "permisoAnticipado: si financia y todavía no dijo lo del recibo, avisa que el CUIL va justo después (sin habilitar pedirlo ahora)" -->
<!-- test: src/credito/verificacion.test.js › "permisoAnticipado: no aplica si paga de contado, ya dijo lo del recibo, dijo que no, ya se consultó o no hay términos" -->
<!-- test: src/agente/atender.test.js › "antes de que conteste lo del recibo, el CUIL ya figura en lo que falta (después del recibo) sin pedirse todavía" -->
<!-- eval: chats simulados › P10, E1 -->

#### Scenario: Autorizó y falta el CUIL
- **WHEN** el cliente había autorizado con el permiso anterior al cambio y todavía no dio el CUIL
- **THEN** el CUIL figura en lo que falta, antes del usado, sin volver a pedir permiso
<!-- test: src/agente/calificacion.test.js › "si autorizó y falta el CUIL, el CUIL figura antes del usado" -->

#### Scenario: Dijo que no, o paga de contado
- **WHEN** el cliente no quiso pasar el CUIL, ya se consultó, o paga de contado
- **THEN** el CUIL no figura en lo que falta
<!-- test: src/agente/calificacion.test.js › "si dijo que no, ya se consultó o paga de contado (credito nulo), ni el permiso ni el CUIL figuran" -->
<!-- test: src/credito/verificacion.test.js › "el no se guarda con la versión vigente y deja de pedir el CUIL" -->
<!-- test: src/agente/calificacion.test.js › "sin el tercer parámetro, pendientes es igual que antes" -->

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

### Requirement: El nombre después de la visita
El sistema MUST poner "su nombre" primero en lo que falta solo si la consulta tiene una visita acordada
(`visita_propuesta`), el cliente nunca dijo su nombre y todavía no se le pidió en esta consulta. Cuando la
asesora responde con el nombre primero en lo que falta, MUST marcarlo (`nombre_pedido_at`) aunque el cliente
no conteste, y después MUST NOT volver a figurar.
<!-- id: calificacion.pendientes -->

#### Scenario: Visita acordada y sin nombre
- **WHEN** la consulta tiene la visita acordada, el cliente nunca dijo su nombre y no se le pidió
- **THEN** lo que falta es solo "su nombre"
<!-- test: src/agente/calificacion.test.js › "pendientes con pedirNombre: con la visita acordada y todo lo demás respondido, lo que falta es solo 'su nombre'" -->
<!-- test: src/agente/herramientas.test.js › "lo que falta: si la visita ya estaba acordada, sin nombre dicho y sin haberlo pedido, 'su nombre' va primero" -->

#### Scenario: No en el mismo mensaje que confirma la visita
- **WHEN** el cliente dice "el jueves a la tarde" y la asesora guarda la visita en ese turno
- **THEN** lo que devuelve `registrar_calificacion` en ese turno no trae "su nombre": el nombre recién figura en el mensaje siguiente del cliente, porque la visita tiene que haber quedado acordada antes de ese turno
<!-- test: src/agente/herramientas.test.js › "lo que falta: en el mismo turno en que se guarda la visita, 'su nombre' no figura (recién va en el mensaje siguiente)" -->
<!-- eval: chats simulados › X9 -->

#### Scenario: Visita acordada con el recorrido incompleto
- **WHEN** el cliente acordó la visita sin haber dicho quién decide, nunca dijo su nombre y no se le pidió
- **THEN** "su nombre" va primero en lo que falta y "quién decide" después
<!-- test: src/agente/calificacion.test.js › "pendientes con pedirNombre: 'su nombre' va primero, también cuando todavía falta 'quién decide'" -->
<!-- test: src/agente/herramientas.test.js › "lo que falta: si la visita ya estaba acordada y falta 'quién decide', 'su nombre' va antes" -->

#### Scenario: Ya lo dijo
- **WHEN** el cliente dijo su nombre antes de acordar la visita, o en una consulta anterior
- **THEN** el nombre no figura en lo que falta
<!-- test: src/agente/calificacion.test.js › "correspondePedirNombre: no si ya dijo su nombre, ya se le pidió, no hay visita o no sabe cuándo viene" -->
<!-- test: src/agente/herramientas.test.js › "lo que falta: si el cliente ya dijo su nombre (en la consulta o en una anterior), o ya se le pidió, 'su nombre' no figura" -->

#### Scenario: Ya se pidió
- **WHEN** la asesora ya pidió el nombre en esta consulta y el cliente no lo dio
- **THEN** el nombre no figura en lo que falta
<!-- test: src/agente/calificacion.test.js › "correspondePedirNombre: no si ya dijo su nombre, ya se le pidió, no hay visita o no sabe cuándo viene" -->
<!-- test: src/agente/herramientas.test.js › "lo que falta: si el cliente ya dijo su nombre (en la consulta o en una anterior), o ya se le pidió, 'su nombre' no figura" -->

#### Scenario: Sin visita acordada
- **WHEN** el recorrido está a medias, o el cliente dijo que no sabe cuándo viene
- **THEN** el nombre no figura en lo que falta
<!-- test: src/agente/calificacion.test.js › "correspondePedirNombre: no si ya dijo su nombre, ya se le pidió, no hay visita o no sabe cuándo viene" -->
<!-- test: src/agente/herramientas.test.js › "lo que falta: sin visita acordada o si no sabe cuándo viene, 'su nombre' no figura" -->
<!-- test: src/agente/atender.test.js › "sin visita acordada, el nombre no figura en lo que falta y no se marca nada" -->

#### Scenario: Se marca al pedirlo
- **WHEN** la asesora responde con el nombre primero en lo que falta
- **THEN** la consulta queda con `nombre_pedido_at` y el próximo mensaje ya no lo tiene en lo que falta
<!-- test: src/agente/atender.test.js › "al responder con 'su nombre' en lo que falta, la consulta queda con nombre_pedido_at (con la base raíz) y no se reacciona" -->
<!-- test: src/agente/atender.test.js › "con nombre_pedido_at ya puesto, 'ok gracias' vuelve a ser una reacción 👍 sin IA" -->

#### Scenario: Dos mensajes seguidos
- **WHEN** después de acordar la visita el cliente manda "ok" y "gracias" casi juntos
- **THEN** el nombre se pide una sola vez: los mensajes de un mismo número se atienden de a uno (`agente-entrada`) y el segundo ya ve la marca
<!-- test: src/agente/atender.test.js › "dos mensajes seguidos después de acordar la visita ('ok' y 'gracias'): el nombre se pide una sola vez" -->

### Requirement: Guardar el nombre que dijo el cliente
`registrar_calificacion` MUST aceptar el nombre que el cliente dijo de sí mismo y guardarlo saneado en
`sesiones.nombre_declarado` de la consulta en curso. Se sanea igual que hoy el nombre del contexto: letras con
acentos, espacios, apóstrofo, punto y guion, en una línea y hasta 40 caracteres. Si la ficha no tiene nombre,
o tiene el que el cliente había dicho antes, MUST actualizarla; MUST NOT pisar otro nombre de la ficha.
<!-- id: herramientas.registrar_calificacion -->

#### Scenario: Nombre compuesto
- **WHEN** el cliente escribe "me llamo María José O'Neill"
- **THEN** se guarda "María José O'Neill", con los espacios, el acento y el apóstrofo
<!-- test: src/agente/herramientas.test.js › "registrar_calificacion guarda el nombre que dijo el cliente con ctx.guardarNombre, con acentos, espacios y apóstrofo" -->

#### Scenario: Responde solo el nombre
- **WHEN** la asesora le pidió el nombre y el cliente responde "Claudia"
- **THEN** se guarda "Claudia"
<!-- eval: chats simulados › X9 -->

#### Scenario: Corrige el nombre
- **WHEN** el cliente dijo "soy Clara" y después escribe "perdón, Claudia, no Clara"
- **THEN** queda guardado "Claudia" en la consulta y, si la ficha se había completado con "Clara", también en la ficha
<!-- test: src/agente/nombre-dicho.test.js › "si el cliente se corrige ('Clara' → 'Claudia') y la ficha se había completado con 'Clara', se actualizan la consulta y la ficha" -->

#### Scenario: Nombra a otra persona
- **WHEN** el cliente escribe "Alvaro es mi marido, yo soy Claudia"
- **THEN** se guarda "Claudia", no "Alvaro"
<!-- eval: chats simulados › X10 -->

#### Scenario: Dice su nombre
- **WHEN** el cliente escribe "soy Claudia Espinosa"
- **THEN** la consulta guarda "Claudia Espinosa" como nombre dicho y, si la ficha no tenía nombre, también la ficha
<!-- test: src/agente/nombre-dicho.test.js › "guarda el nombre dicho en la consulta (nombre_declarado) y, si la ficha no tiene nombre, también en la ficha" -->

#### Scenario: Ficha con nombre viejo
- **WHEN** la ficha tiene "Alvaro" (del perfil, de antes de este cambio) y el cliente dice "soy Claudia"
- **THEN** la consulta guarda "Claudia" y la ficha sigue diciendo "Alvaro"
<!-- test: src/agente/nombre-dicho.test.js › "si la ficha tiene otro nombre ('Alvaro', del perfil de antes), la consulta guarda 'Claudia' y la ficha no se toca" -->

#### Scenario: Nombre con símbolos
- **WHEN** el nombre que llega trae emojis o saltos de línea
- **THEN** se guarda solo con letras, en una línea; si no queda nada, no se guarda
<!-- test: src/agente/herramientas.test.js › "registrar_calificacion no guarda un nombre sin letras (emojis o símbolos) y sigue con el resto" -->
<!-- test: src/agente/herramientas.test.js › "registrar_calificacion deja el nombre en una línea, con punto y guion, y lo recorta a 40 caracteres" -->

### Requirement: El pedido de fotos del usado
La primera vez que en una consulta queda guardado que el cliente entrega un vehículo, el resultado de
`registrar_calificacion` MUST avisarle al agente que pida fotos del vehículo en ese mismo mensaje, y el sistema
MUST marcar en la consulta que ya se pidieron (`fotos_usado_pedidas_at`). Con la marca puesta, MUST NOT volver
a avisarlo, aunque el cliente corrija o vuelva a decir que entrega.
<!-- id: herramientas.registrar_calificacion -->

#### Scenario: Primera vez que entrega
- **WHEN** se guarda `entrega_usado: true` en una consulta sin la marca
- **THEN** el resultado pide las fotos y la consulta queda marcada
<!-- test: src/agente/herramientas.test.js › "registrar_calificacion: la primera vez que guarda entrega_usado true avisa que hay que pedir fotos y marca la consulta con ctx.marcarFotosPedidas" -->
<!-- test: src/agente/atender.test.js › "al decir registrar_calificacion que entrega un usado, la consulta queda marcada con fotos_usado_pedidas_at (base raíz) y la IA recibe el aviso de pedir fotos" -->

#### Scenario: Ya se pidieron
- **WHEN** se vuelve a guardar `entrega_usado: true` en una consulta con la marca
- **THEN** el resultado no pide fotos
<!-- test: src/agente/herramientas.test.js › "registrar_calificacion: con fotos_usado_pedidas_at ya puesto no vuelve a avisar ni a marcar, aunque el cliente repita que entrega" -->
<!-- test: src/agente/atender.test.js › "con las fotos ya pedidas, volver a guardar entrega_usado true no avisa de nuevo ni vuelve a marcar la consulta" -->

#### Scenario: No entrega
- **WHEN** se guarda `entrega_usado: false`
- **THEN** no se piden fotos ni se marca nada
<!-- test: src/agente/herramientas.test.js › "registrar_calificacion: con entrega_usado false (o sin tocar el usado) no pide fotos ni marca nada" -->
