# tipos-vehiculo Specification

## Purpose
TBD - created by archiving change tipos-de-vehiculo. Update Purpose after archive.

## Requirements

### Requirement: Cuatro tipos de vehículo
Los tipos de vehículo MUST ser `auto`, `camioneta`, `camion` y `moto`, en ese orden. Al guardar, el tipo MUST
normalizarse sin importar mayúsculas, espacios ni tildes ("Camión" → `camion`). Un valor desconocido o vacío
MUST quedar como `auto`.
<!-- id: tipos-vehiculo.lista -->

#### Scenario: La lista de tipos
- **WHEN** se piden los tipos de vehículo
- **THEN** son auto, camioneta, camion y moto
<!-- test: src/lib/tipos-vehiculo.test.js › "los tipos de vehículo son auto, camioneta, camion y moto" -->

#### Scenario: Camión con tilde
- **WHEN** llega "Camión", "camion" o " CAMIÓN "
- **THEN** se guarda `camion`
<!-- test: src/lib/tipos-vehiculo.test.js › "acepta camión con o sin tilde" -->

#### Scenario: Valor desconocido
- **WHEN** llega "utilitario", vacío o nulo
- **THEN** queda `auto`
<!-- test: src/lib/tipos-vehiculo.test.js › "un valor desconocido o vacío queda como auto" -->

#### Scenario: Guardar un camión desde el panel
- **WHEN** se crea un vehículo con tipo "camion"
- **THEN** se guarda con `tipo_vehiculo` = `camion`
<!-- test: src/services/vehiculos.formulario.test.js › "un vehículo de tipo camión se guarda como camion" -->

### Requirement: El front muestra los cuatro tipos
El front MUST ofrecer los mismos cuatro tipos, con su nombre en singular y en plural: Auto/Autos,
Camioneta/Camionetas, Camión/Camiones y Moto/Motos. El camión MUST usar el ícono de camión y la camioneta un
ícono propio de pick-up. Un valor desconocido MUST mostrarse como Auto. El formulario de Vehículos, el filtro
del catálogo, la tarjeta y la ficha MUST tomar los tipos de esa lista. El subtítulo del catálogo MUST tener
texto para cada tipo.
<!-- id: front.tipos-vehiculo -->

#### Scenario: Los tipos del front
- **WHEN** se piden los tipos del front
- **THEN** son auto, camioneta, camion y moto, con "Camión" y "Camiones" para el camión
<!-- test: ../sea_automotores/lib/tipos-vehiculo.test.js › "los tipos del front son auto, camioneta, camion y moto" -->

#### Scenario: Íconos distintos
- **WHEN** se comparan los íconos de camioneta y camión
- **THEN** son distintos
<!-- test: ../sea_automotores/lib/tipos-vehiculo.test.js › "camioneta y camión tienen íconos distintos" -->

#### Scenario: Valor desconocido en el front
- **WHEN** un vehículo llega con un tipo desconocido
- **THEN** se muestra como Auto
<!-- test: ../sea_automotores/lib/tipos-vehiculo.test.js › "un tipo desconocido se muestra como auto" -->

### Requirement: El bot busca camiones
`buscar_autos` MUST aceptar el tipo `camion` y filtrar solo los vehículos con ese tipo. La descripción del
campo `tipo` MUST explicar que camioneta incluye SUV, pick-ups y furgones.
<!-- id: agente.buscar_autos.tipo-camion -->

#### Scenario: Buscar camiones
- **WHEN** el bot busca con tipo "camion"
- **THEN** la consulta filtra `tipo_vehiculo` = `camion`
<!-- test: src/agente/herramientas.test.js › "buscar_autos con tipo camion filtra solo los camiones" -->

#### Scenario: Qué es camioneta
- **WHEN** se lee la descripción del campo `tipo` de `buscar_autos`
- **THEN** nombra los cuatro tipos y dice que camioneta incluye SUV, pick-ups y furgones
<!-- test: src/agente/herramientas.test.js › "la descripción del tipo explica qué es camioneta" -->

### Requirement: La importación reconoce camiones
La importación de listas MUST aceptar el tipo `camion` en una fila. El campo `tipoVehiculo` del esquema
MUST explicar que camioneta incluye SUV, pick-ups y furgones.
<!-- id: lista-vehiculos.tipo -->

#### Scenario: Fila con camión
- **WHEN** el modelo devuelve una fila con tipo "camion"
- **THEN** la fila queda con tipo `camion`
<!-- test: src/lib/lista-vehiculos.test.js › "una fila con tipo camion se importa como camion" -->

#### Scenario: Descripción del tipo en la importación
- **WHEN** se lee la descripción de `tipoVehiculo` en el esquema de la lista
- **THEN** dice que camioneta incluye SUV, pick-ups y furgones
<!-- test: src/lib/lista-vehiculos.test.js › "el esquema de la lista explica qué es camioneta" -->

### Requirement: Corrección del tipo del stock
La migración 087 MUST corregir, solo con datos, el tipo de los vehículos no borrados según su modelo y
versión: camión, camioneta o auto. MUST NOT tocar los borrados, las motos ni los que no entran en ninguna
regla.
<!-- id: migracion.087 -->

#### Scenario: Camiones
- **WHEN** el modelo o la versión dice "camión", o el modelo es Delivery, Accelo, Atego, Actros,
  Constellation, Tector o Axor
- **THEN** queda `camion`

#### Scenario: Camionetas
- **WHEN** el modelo es una pick-up, un SUV o un furgón de la lista de la migración, o la versión dice "furgón"
- **THEN** queda `camioneta`

#### Scenario: Monovolúmenes y sin tipo
- **WHEN** el modelo es Idea, Suran, Meriva, Spin, Zafira, Picasso o Scenic, o el vehículo no tiene tipo
- **THEN** queda `auto`

#### Scenario: Copia de producción
- **WHEN** se corre la 087 sobre una copia de la base de producción del 19/11
- **THEN** cambian los mismos 25 vehículos que mostró la vista previa, con el mismo tipo nuevo, y nada más
<!-- verificación: copia local de producción con el sql_mode de producción, comparada contra la vista previa -->
