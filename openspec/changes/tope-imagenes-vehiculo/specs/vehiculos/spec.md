## ADDED Requirements

### Requirement: Tope de imágenes por vehículo
Un vehículo MUST tener como máximo 6 imágenes: la principal y 5 más. Crear o editar con más de 6 MUST
rechazarse con un error 400, sin escribir. Editar sin mandar imágenes MUST NOT validar el tope.
<!-- id: vehiculos.construirData.imagenes -->

#### Scenario: Más de 6
- **WHEN** se crea o edita un vehículo con 7 imágenes
- **THEN** se rechaza con un error 400 y no se escribe
<!-- test: src/services/vehiculos.formulario.test.js › "un vehículo con más de 6 imágenes se rechaza" -->

#### Scenario: Justo 6
- **WHEN** se crea un vehículo con 6 imágenes
- **THEN** se guardan las 6
<!-- test: src/services/vehiculos.formulario.test.js › "un vehículo con 6 imágenes se guarda" -->

#### Scenario: Sin tocar las imágenes
- **WHEN** se edita un vehículo sin mandar imágenes
- **THEN** el tope no se valida
<!-- test: src/services/vehiculos.formulario.test.js › "editar sin mandar imágenes no valida el tope" -->

### Requirement: El formulario no deja pasar el tope de imágenes
El formulario de vehículo MUST permitir hasta 5 imágenes además de la principal. Al elegir más de las que
caben, MUST tomar solo las que caben y avisar. Con las 5 cargadas MUST NOT ofrecer agregar más.
<!-- id: panel.vehiculos.imagenes -->

#### Scenario: Lugares libres
- **WHEN** el vehículo tiene 3 imágenes adicionales
- **THEN** quedan 2 lugares
<!-- test: ../sea_automotores/lib/imagenes-vehiculo.test.js › "quedan libres las adicionales que faltan para llegar a 5" -->

#### Scenario: Se eligen de más
- **WHEN** quedan 2 lugares y se eligen 4 imágenes
- **THEN** entran las 2 primeras y las otras 2 se informan como sobrantes
<!-- test: ../sea_automotores/lib/imagenes-vehiculo.test.js › "de las elegidas solo entran las que caben" -->

#### Scenario: Pedido
- **WHEN** se arma la lista de imágenes para guardar
- **THEN** lleva la principal primero y hasta 5 más
<!-- test: ../sea_automotores/lib/imagenes-vehiculo.test.js › "el pedido lleva la principal y hasta 5 más" -->
