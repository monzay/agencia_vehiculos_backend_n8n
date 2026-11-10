## ADDED Requirements

### Requirement: Combustibles permitidos
El combustible de un vehículo MUST ser `nafta`, `gnc`, `nafta_gnc` (anda con los dos) o `diesel`, o
quedar sin especificar. Cualquier otro valor MUST rechazarse con un error 400, sin escribir.
<!-- id: combustibles.normalizarCombustible -->

#### Scenario: Nafta y GNC
- **WHEN** llega el combustible `nafta_gnc`
- **THEN** se acepta tal cual
<!-- test: src/lib/combustibles.test.js › "acepta nafta y GNC" -->

#### Scenario: Sin especificar
- **WHEN** el combustible llega vacío
- **THEN** queda sin especificar
<!-- test: src/lib/combustibles.test.js › "vacío queda sin especificar" -->

#### Scenario: Valor desconocido
- **WHEN** llega un valor que no está en la lista
- **THEN** se rechaza con un error 400
<!-- test: src/lib/combustibles.test.js › "rechaza un combustible que no está en la lista" -->

#### Scenario: No se guarda
- **WHEN** se crea un vehículo con un combustible que no está en la lista
- **THEN** el vehículo no se crea
<!-- test: src/services/vehiculos.formulario.test.js › "un combustible fuera de la lista no llega a la base" -->

### Requirement: El formulario no pide identificación ni costo
Crear un vehículo MUST NOT exigir dominio, motor, chasis ni costo. Editar un vehículo sin mandar esos
campos MUST NOT modificar lo que ya tiene guardado. Crear o editar MUST NOT escribir el costo de
compra, que lo carga Preparación con el precio de la compra.
<!-- id: vehiculos.construirData -->

#### Scenario: Crear sin esos datos
- **WHEN** se crea un vehículo solo con marca, modelo, año y precio
- **THEN** se crea sin dominio, motor, chasis ni costo
<!-- test: src/services/vehiculos.formulario.test.js › "crear un vehículo sin dominio, motor, chasis ni costo funciona" -->

#### Scenario: Editar sin esos datos
- **WHEN** se edita un vehículo y no llegan esos campos
- **THEN** la escritura no los incluye
<!-- test: src/services/vehiculos.formulario.test.js › "editar sin mandar dominio, motor, chasis ni costo no los modifica" -->

#### Scenario: El costo no se escribe
- **WHEN** llega un costo al crear o al editar, aunque venga vacío
- **THEN** se ignora y el costo guardado no cambia
<!-- test: src/services/vehiculos.formulario.test.js › "el costo que llega al crear o editar no se escribe" -->

### Requirement: El costo de compra no sale en la API
La API de vehículos MUST NOT devolver el costo de compra.
<!-- id: vehiculo.mapper.mapAutoToVehiculo -->

#### Scenario: Catálogo público
- **WHEN** se pide el catálogo o la ficha de un auto que tiene costo cargado
- **THEN** la respuesta no incluye el costo
<!-- test: src/services/vehiculos.catalogo.test.js › "el catálogo público no devuelve el costo de compra" -->
