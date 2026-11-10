## ADDED Requirements

### Requirement: Versión del vehículo
Un vehículo MAY tener versión, de hasta 80 caracteres. Crear o editar MUST NOT exigirla. Editar sin
mandarla MUST NOT modificarla. Mandarla vacía MUST borrarla. La API de vehículos MUST devolverla, o `null`
si no tiene.
<!-- id: vehiculos.construirData -->

#### Scenario: Se carga
- **WHEN** se crea un vehículo con versión
- **THEN** se guarda recortada a 80 caracteres
<!-- test: src/services/vehiculos.formulario.test.js › "se guarda la versión del vehículo" -->

#### Scenario: Vaciarla
- **WHEN** llega vacía al editar
- **THEN** queda sin dato
<!-- test: src/services/vehiculos.formulario.test.js › "vaciar la versión la borra" -->

#### Scenario: La API la devuelve
- **WHEN** se pide un vehículo
- **THEN** la respuesta trae su versión, o `null` si no tiene
<!-- test: src/services/vehiculos.catalogo.test.js › "la API devuelve la versión del vehículo" -->

### Requirement: Marca, modelo y año dentro de su columna
Crear o editar un vehículo MUST rechazar con un error 400, sin escribir, una marca o un modelo que no sean
texto o que superen el largo de su columna (60 y 80 caracteres), y un año que no sea entero.
<!-- id: vehiculos.construirData.textos -->

#### Scenario: Texto inválido
- **WHEN** la marca o el modelo no son texto o son demasiado largos
- **THEN** se rechaza con un error 400 y no se escribe
<!-- test: src/services/vehiculos.formulario.test.js › "una marca o un modelo que no son texto o son muy largos no llegan a la base" -->

#### Scenario: Año con decimales
- **WHEN** el año tiene decimales
- **THEN** se rechaza con un error 400 y no se escribe
<!-- test: src/services/vehiculos.formulario.test.js › "un año con decimales no es válido" -->

### Requirement: Publicar desde el formulario
El formulario de vehículo MUST mostrar si el auto está publicado y permitir publicarlo o despublicarlo.
Un auto nuevo cargado a mano MUST arrancar publicado, como hasta ahora.
<!-- id: panel.vehiculos.formulario -->

#### Scenario: Publicar un auto importado
- **WHEN** un administrador edita un auto importado y lo marca como publicado
- **THEN** el auto aparece en la web
<!-- test: ../sea_automotores/e2e/importar-lista.spec.mjs › "publicar un auto importado lo muestra en la web" -->
