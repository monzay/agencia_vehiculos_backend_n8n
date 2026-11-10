## ADDED Requirements

### Requirement: Anticipo y precio al contado del vehículo
Un vehículo MAY tener anticipo y precio al contado. Crear o editar MUST NOT exigirlos. Editar sin
mandarlos MUST NOT modificarlos. Mandarlos vacíos MUST borrarlos. Un valor que no sea un número mayor
a cero y dentro del tope de la columna MUST rechazarse con un error 400, sin escribir.
<!-- id: vehiculos.construirData -->

#### Scenario: Se cargan
- **WHEN** se crea un vehículo con anticipo y precio al contado
- **THEN** se guardan los dos
<!-- test: src/services/vehiculos.formulario.test.js › "se guardan el anticipo y el precio al contado" -->

#### Scenario: No son obligatorios
- **WHEN** se crea un vehículo sin anticipo ni precio al contado
- **THEN** se crea igual, sin esos datos
<!-- test: src/services/vehiculos.formulario.test.js › "crear sin anticipo ni precio al contado funciona" -->

#### Scenario: Editar sin mandarlos
- **WHEN** se edita un vehículo y no llegan esos campos
- **THEN** la escritura no los incluye
<!-- test: src/services/vehiculos.formulario.test.js › "editar sin mandar anticipo ni precio al contado no los modifica" -->

#### Scenario: Vaciarlos
- **WHEN** llegan vacíos al editar
- **THEN** quedan sin dato
<!-- test: src/services/vehiculos.formulario.test.js › "vaciar el anticipo o el precio al contado los borra" -->

#### Scenario: Valor inválido
- **WHEN** llega un valor negativo, cero, que no es un número o que supera el tope
- **THEN** se rechaza con un error 400 y no se escribe
<!-- test: src/services/vehiculos.formulario.test.js › "un anticipo o precio al contado inválido no llega a la base" -->

### Requirement: Anticipo y precio al contado en la ficha pública
La API de vehículos MUST devolver el anticipo y el precio al contado, o `null` si no tienen dato. La
ficha pública MUST mostrar solo los que tienen dato.
<!-- id: vehiculo.mapper.mapAutoToVehiculo -->

#### Scenario: Con datos
- **WHEN** se pide la ficha de un auto que los tiene cargados
- **THEN** la respuesta los trae como números
<!-- test: src/services/vehiculos.catalogo.test.js › "la ficha pública devuelve el anticipo y el precio al contado" -->

#### Scenario: Sin datos
- **WHEN** se pide la ficha de un auto que no los tiene
- **THEN** la respuesta los trae en `null`
<!-- test: src/services/vehiculos.catalogo.test.js › "un auto sin anticipo ni precio al contado los devuelve en null" -->

### Requirement: El boleto de una venta al contado arranca con el precio al contado
El detalle del trámite MUST traer el precio al contado del auto que se vende. Un boleto nuevo de una
venta al contado MUST arrancar con ese precio si está cargado y con el precio del auto si no. Un
boleto con parte de pago MUST arrancar con el precio del auto.
<!-- id: ingreso.mapper.autoInteresDe -->

#### Scenario: El detalle trae el dato
- **WHEN** se pide el detalle de un trámite con auto de la agencia
- **THEN** el auto trae su precio al contado
<!-- test: src/mappers/ingreso.mapper.test.js › "el auto del boleto trae su precio al contado" -->

#### Scenario: La consulta lo pide
- **WHEN** se arma la consulta del detalle del trámite
- **THEN** incluye el precio al contado del auto
<!-- test: src/services/ingresos.precio-contado.test.js › "el detalle del trámite pide el precio al contado del auto" -->

### Requirement: Descuentos y promociones cerrados en el panel
El menú del panel MUST NOT ofrecer la sección Descuentos/Promos mientras esté cerrada. Cerrarla MUST
NOT borrar ni desactivar los descuentos y promociones cargados.
<!-- id: panel.barra-lateral -->

#### Scenario: Menú sin la sección
- **WHEN** un administrador abre el panel
- **THEN** el menú no muestra Descuentos/Promos
<!-- e2e: web/sea_automotores/e2e/vehiculo-precios.spec.mjs -->
