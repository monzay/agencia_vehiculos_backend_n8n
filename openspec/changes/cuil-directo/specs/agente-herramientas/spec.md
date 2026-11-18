## MODIFIED Requirements

### Requirement: Guardar el permiso dice qué sigue
`registrar_consentimiento` MUST guardar solo un "no" claro del cliente y devolver qué sigue: el recorrido, sin
pedir el CUIL. Un "sí" MUST NOT guardarse con esta herramienta: la herramienta responde que el "sí" es el CUIL
que manda el cliente después del aviso (`agente-credito` › Consentimiento antes de consultar).
`registrar_calificacion` MUST devolver en `faltan` el CUIL, con para qué es, cuando corresponde, y MUST NOT
devolver el link de privacidad.
<!-- id: herramientas.registrar_consentimiento -->

#### Scenario: El cliente autoriza
- **WHEN** la IA intenta guardar un "sí" con `registrar_consentimiento`
- **THEN** no se guarda nada y la herramienta responde que el "sí" es el CUIL que manda el cliente, sin agregar qué sigue
<!-- test: src/agente/herramientas.test.js › "registrar_consentimiento pasa el no del cliente tal cual; un sí no queda registrado y vuelve con el motivo" -->
<!-- test: src/credito/verificacion.test.js › "registrarConsentimiento guarda el no, pero un sí pedido por la herramienta no se guarda" -->

#### Scenario: El cliente no autoriza
- **WHEN** la IA guarda un "no" claro
- **THEN** la herramienta responde que siga con el recorrido, sin pedir el CUIL
<!-- test: src/agente/herramientas.test.js › "registrar_consentimiento: si no autorizó, la herramienta dice que siga con el recorrido sin pedir el CUIL" -->
<!-- test: src/agente/herramientas.test.js › "registrar_consentimiento: si no quedó registrado, no agrega qué sigue" -->

#### Scenario: El permiso ya estaba registrado
- **WHEN** la IA vuelve a guardar el mismo "no"
- **THEN** la herramienta dice que ya estaba registrado y que siga con el recorrido, sin pedir el CUIL
<!-- test: src/agente/herramientas.test.js › "registrar_consentimiento repetido: con el no, dice que ya estaba registrado y que siga sin pedir el CUIL" -->
<!-- test: src/credito/verificacion.test.js › "el mismo no repetido tampoco crea otro registro" -->

#### Scenario: Lo que falta incluye el permiso
- **WHEN** la IA guarda que el cliente tiene recibo y la verificación espera el CUIL
- **THEN** `faltan` trae primero el CUIL, con para qué es, sin un permiso aparte y sin el link de privacidad; si no se puede leer el estado, la herramienta funciona igual
<!-- test: src/agente/herramientas.test.js › "registrar_calificacion devuelve en faltan el CUIL, con para qué es, según el estado de la verificación" -->
<!-- test: src/agente/herramientas.test.js › "registrar_calificacion no devuelve el link de privacidad: el CUIL se pide sin link" -->
<!-- test: src/agente/herramientas.test.js › "registrar_calificacion sigue funcionando si no se puede leer el estado de la verificación" -->
