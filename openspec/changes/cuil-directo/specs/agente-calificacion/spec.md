## MODIFIED Requirements

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
<!-- test: FALTA -->
<!-- eval: chats simulados › P10, E1 -->

#### Scenario: Financia y todavía no dijo lo del recibo
- **WHEN** el cliente financia, la verificación está activa y todavía no contestó lo del recibo o garante
- **THEN** el CUIL ya figura en lo que falta, justo después del recibo o garante, sin habilitar pedirlo antes de tiempo
<!-- test: FALTA -->
<!-- eval: chats simulados › P10, E1 -->

#### Scenario: Autorizó y falta el CUIL
- **WHEN** el cliente había autorizado con el permiso anterior al cambio y todavía no dio el CUIL
- **THEN** el CUIL figura en lo que falta, antes del usado, sin volver a pedir permiso
<!-- test: src/agente/calificacion.test.js › "si autorizó y falta el CUIL, el CUIL figura antes del usado" -->

#### Scenario: Dijo que no, o paga de contado
- **WHEN** el cliente no quiso pasar el CUIL, ya se consultó, o paga de contado
- **THEN** el CUIL no figura en lo que falta
<!-- test: FALTA -->
<!-- test: src/agente/calificacion.test.js › "sin el tercer parámetro, pendientes es igual que antes" -->
