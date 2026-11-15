## ADDED Requirements

### Requirement: Usado con kilómetros en cero
En la ficha pública, un auto usado con 0 kilómetros cargados MUST ir con `km: null`: en un usado, 0
significa que el dato no se cargó. Un 0 km (condición `0km`) MUST conservar `km: 0`.
<!-- id: auto-publico.autoPublico -->

#### Scenario: Usado sin kilómetros cargados
- **WHEN** se arma la ficha de un usado con `kms = 0`
- **THEN** la ficha trae `km: null`
<!-- test: FALTA -->

#### Scenario: Usado con kilómetros
- **WHEN** se arma la ficha de un usado con 148.000 km
- **THEN** la ficha trae `km: 148000`
<!-- test: FALTA -->

#### Scenario: Auto 0 km
- **WHEN** se arma la ficha de un auto de condición 0 km
- **THEN** la ficha trae `km: 0`
<!-- test: FALTA -->

### Requirement: Buscar cerca del auto de la consulta
Cuando `buscar_autos` se llama sin presupuesto y la consulta ya tiene un auto de interés, los resultados
MUST ordenarse por cercanía de precio a ese auto, el más cercano primero, y MUST NOT incluir ese mismo auto.
Con un presupuesto, o sin auto en la consulta, el orden MUST ser el de siempre.
<!-- id: herramientas.buscar_autos -->

#### Scenario: Pide otros modelos mirando un auto
- **WHEN** la consulta es por un auto de $12.900.000 y la IA busca sin filtros
- **THEN** vuelven primero los de precio más parecido, y no ese mismo auto
<!-- test: FALTA -->

#### Scenario: Con presupuesto
- **WHEN** la IA busca con un presupuesto máximo
- **THEN** el orden es el de siempre: del más caro al más barato dentro del presupuesto
<!-- test: FALTA -->

#### Scenario: Sin auto en la consulta
- **WHEN** la consulta todavía no tiene auto
- **THEN** el orden es el de siempre: los últimos cargados primero
<!-- test: FALTA -->

### Requirement: Guardar el permiso dice qué sigue
`registrar_consentimiento` MUST devolver, además de si quedó registrado, qué tiene que hacer la IA después:
pedir el CUIL si el cliente autorizó, o seguir con el recorrido si no. `registrar_calificacion` MUST devolver
en `faltan` el permiso y el CUIL cuando corresponden (ver `agente-calificacion` › Lo que falta preguntar,
en orden).
<!-- id: herramientas.registrar_consentimiento -->

#### Scenario: El cliente autoriza
- **WHEN** la IA guarda un "sí" al permiso
- **THEN** la herramienta responde que lo que sigue es pedir el CUIL
<!-- test: FALTA -->

#### Scenario: El cliente no autoriza
- **WHEN** la IA guarda un "no"
- **THEN** la herramienta responde que siga con el recorrido, sin pedir el CUIL
<!-- test: FALTA -->
