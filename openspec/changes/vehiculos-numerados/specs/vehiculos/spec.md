## ADDED Requirements

### Requirement: La lista de Vehículos está numerada
La lista de Vehículos del panel MUST numerar las filas desde 1, en el orden en que se muestran. Al cambiar
el orden o los filtros, los números MUST volver a empezar desde 1 en el orden nuevo. El número MUST NOT
guardarse ni mandarse a la API.
<!-- id: vehiculos.numerarVehiculos -->

#### Scenario: Desde 1 y en orden
- **WHEN** se muestra una lista de tres vehículos
- **THEN** quedan numerados 1, 2 y 3 en ese orden, sin cambiar sus datos
<!-- test: ../sea_automotores/lib/vehiculos.test.js › "la lista de vehículos se numera desde 1 en el orden en que se muestra" -->

#### Scenario: Filtrada
- **WHEN** se filtra la lista y quedan dos vehículos
- **THEN** quedan numerados 1 y 2
<!-- test: ../sea_automotores/lib/vehiculos.test.js › "al filtrar la lista la numeración vuelve a empezar" -->

### Requirement: La sección Vehículos no muestra la ref
La sección Vehículos del panel MUST NOT mostrar la ref del vehículo: ni en la lista, ni en la ficha de
detalle, ni en el aviso de eliminar. La ref MUST seguir usándose como identificador interno.
<!-- id: panel.vehiculos.sinRef -->

#### Scenario: Sin la ref
- **WHEN** se arma la sección Vehículos
- **THEN** ningún texto visible de la lista, la ficha ni el aviso de eliminar muestra la ref
<!-- test: ../sea_automotores/components/panel/secciones/vehiculos/sin-ref.test.js › "la sección Vehículos no muestra la ref del vehículo" -->
