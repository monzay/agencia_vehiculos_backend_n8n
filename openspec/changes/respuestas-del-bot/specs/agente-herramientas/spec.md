## ADDED Requirements

### Requirement: Usado con kilómetros en cero
En la ficha pública, un auto usado con 0 kilómetros cargados MUST ir con `km: null`: en un usado, 0
significa que el dato no se cargó. Un 0 km (condición `0km`) MUST conservar `km: 0`.
<!-- id: auto-publico.autoPublico -->

#### Scenario: Usado sin kilómetros cargados
- **WHEN** se arma la ficha de un usado con `kms = 0`
- **THEN** la ficha trae `km: null`
<!-- test: src/agente/auto-publico.test.js › "un usado con kms = 0 sale con km: null (el 0 es un dato sin cargar)" -->

#### Scenario: Usado con kilómetros
- **WHEN** se arma la ficha de un usado con 148.000 km
- **THEN** la ficha trae `km: 148000`
<!-- test: src/agente/auto-publico.test.js › "un usado con kilómetros cargados los conserva" -->

#### Scenario: Auto 0 km
- **WHEN** se arma la ficha de un auto de condición 0 km
- **THEN** la ficha trae `km: 0`
<!-- test: src/agente/auto-publico.test.js › "un auto 0 km conserva km: 0" -->

### Requirement: Buscar cerca del auto de la consulta
Cuando `buscar_autos` se llama sin presupuesto y la consulta ya tiene un auto de interés, los resultados
MUST ordenarse por cercanía de precio a ese auto, el más cercano primero, y MUST NOT incluir ese mismo auto.
Con un presupuesto, o sin auto en la consulta, el orden MUST ser el de siempre.
<!-- id: herramientas.buscar_autos -->

#### Scenario: Pide otros modelos mirando un auto
- **WHEN** la consulta es por un auto de $12.900.000 y la IA busca sin filtros
- **THEN** vuelven primero los de precio más parecido, y no ese mismo auto
<!-- test: src/agente/herramientas.test.js › "buscar_autos sin presupuesto y con un auto en la consulta ordena por cercanía de precio y no trae ese auto" -->

#### Scenario: Con presupuesto
- **WHEN** la IA busca con un presupuesto máximo
- **THEN** el orden es el de siempre: del más caro al más barato dentro del presupuesto
<!-- test: src/agente/herramientas.test.js › "buscar_autos con presupuesto mantiene el orden de siempre: del más caro al más barato" -->

#### Scenario: Sin auto en la consulta
- **WHEN** la consulta todavía no tiene auto
- **THEN** el orden es el de siempre: los últimos cargados primero
<!-- test: src/agente/herramientas.test.js › "buscar_autos sin auto en la consulta mantiene el orden de siempre: los últimos cargados primero" -->

### Requirement: Guardar el permiso dice qué sigue
`registrar_consentimiento` MUST devolver qué tiene que hacer la IA después: pedir el CUIL si el cliente
autorizó, seguir con el recorrido si no, o consultar el CUIL si el permiso ya estaba registrado.
`registrar_calificacion` MUST devolver en `faltan` el permiso y el CUIL cuando corresponden y, cuando lo que
sigue es el permiso, el link de privacidad.
<!-- id: herramientas.registrar_consentimiento -->

#### Scenario: El cliente autoriza
- **WHEN** la IA guarda un "sí" al permiso
- **THEN** la herramienta responde que lo que sigue es pedir el CUIL
<!-- test: src/agente/herramientas.test.js › "registrar_consentimiento: si autorizó, la herramienta dice que lo que sigue es pedir el CUIL" -->

#### Scenario: El cliente no autoriza
- **WHEN** la IA guarda un "no"
- **THEN** la herramienta responde que siga con el recorrido, sin pedir el CUIL
<!-- test: src/agente/herramientas.test.js › "registrar_consentimiento: si no autorizó, la herramienta dice que siga con el recorrido sin pedir el CUIL" -->
<!-- test: src/agente/herramientas.test.js › "registrar_consentimiento: si no quedó registrado, no agrega qué sigue" -->

#### Scenario: El permiso ya estaba registrado
- **WHEN** la IA vuelve a guardar el mismo "sí"
- **THEN** la herramienta dice que ya estaba registrado y que, si el cliente ya pasó el CUIL, lo consulte ahora
<!-- test: src/agente/herramientas.test.js › "registrar_consentimiento repetido: dice que ya estaba registrado y que, si ya pasó el CUIL, use verificar_situacion_crediticia ahora" -->
<!-- test: src/credito/verificacion.test.js › "si la IA repite el mismo permiso, la respuesta avisa que ya estaba registrado (para que siga con el CUIL)" -->

#### Scenario: Lo que falta incluye el permiso
- **WHEN** la IA guarda que el cliente tiene recibo y la verificación espera el permiso
- **THEN** `faltan` trae el permiso primero, con el link de privacidad; si no se puede leer el estado, la herramienta funciona igual
<!-- test: src/agente/herramientas.test.js › "registrar_calificacion devuelve en faltan el permiso o el CUIL según el estado de la verificación" -->
<!-- test: src/agente/herramientas.test.js › "registrar_calificacion, cuando lo que sigue es el permiso, devuelve también el link de privacidad para pedirlo en ese mismo mensaje" -->
<!-- test: src/agente/herramientas.test.js › "registrar_calificacion sigue funcionando si no se puede leer el estado de la verificación" -->
