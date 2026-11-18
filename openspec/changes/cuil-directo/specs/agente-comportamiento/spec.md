## MODIFIED Requirements

### Requirement: La entrega mínima sigue con el recorrido
Después de explicar que la entrega depende de cada cliente, la asesora MUST guardar que el cliente financia y
seguir el recorrido preguntando lo primero que falte, de a una pregunta. El CUIL MUST pedirse como dice
`agente-credito`: directo, en un mensaje corto que dice para qué es, sin permiso aparte ni link de
privacidad. MUST NOT hablar de cuotas ni decir si su anticipo alcanza.
<!-- id: instrucciones.INSTRUCCIONES -->

#### Scenario: Pregunta lo primero que falta
- **WHEN** la asesora ya explicó que la entrega depende de cada cliente
- **THEN** en ese mismo mensaje pregunta una sola cosa: lo primero que falta del recorrido
<!-- test: src/agente/instrucciones.test.js › "la entrega mínima sigue con el recorrido: guarda que financia y pregunta una sola cosa, sin cuotas" -->
<!-- eval: chats simulados › E1, E3, X1 -->

#### Scenario: Llega al CUIL
- **WHEN** el cliente ya dijo su anticipo y si tiene recibo o garante
- **THEN** la asesora le pide el CUIL diciendo que el asesor puede consultar su situación en la Central de Deudores del BCRA, sin pedir permiso aparte, sin "sí o no" y sin el link de privacidad
<!-- eval: chats simulados › E1 -->

#### Scenario: No dice si alcanza
- **WHEN** el cliente dice que tiene 4 millones de anticipo, o pregunta "¿con 4 millones?"
- **THEN** la asesora no le dice si alcanza ni habla de cuotas
<!-- eval: chats simulados › E1, X1 -->
