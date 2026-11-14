## MODIFIED Requirements

### Requirement: El agente usa un usuario de base con permisos mínimos
Las herramientas MUST conectarse con `AGENTE_DATABASE_URL`: un usuario de MySQL que solo lee
las columnas que necesita y no tiene permiso sobre `costo` ni `precio_venta`. Si la variable
falta, el agente MUST fallar: nunca MUST usar el usuario del backend. El usuario MUST poder leer
todas las columnas de la ficha del auto, incluidas `version`, `stock`, `precio_contado`,
`anticipo` y `descripcion` (migración 083).
<!-- id: db.dbAgente -->

#### Scenario: Falta la variable
- **WHEN** `AGENTE_DATABASE_URL` no está configurada
- **THEN** el agente falla al conectarse, en vez de usar el usuario del backend
<!-- test: FALTA -->

#### Scenario: Columnas pedidas
- **WHEN** una herramienta busca autos
- **THEN** pide columnas explícitas, sin `costo` ni `precio_venta`
<!-- test: FALTA -->
<!-- observacion: lo protege el GRANT de la migración 067 en la base, pero ningún test lo verifica -->

#### Scenario: Lee toda la ficha
- **WHEN** el usuario del agente trae un auto con las columnas de la ficha
- **THEN** la base no le niega ninguna
<!-- test: src/agente/permisos-ficha.test.js › "el usuario del agente puede leer todas las columnas de la ficha" -->

### Requirement: La ficha pública del auto es una lista blanca
Lo que el agente ve de un auto MUST limitarse a: ref, marca, modelo, versión, año, km, tipo,
condición (0 km o usado), combustible, stock, precio de lista (`precio_lista`), precio final con
descuento, ahorro, descuento, precio al contado, anticipo, promociones vigentes, si tiene fotos y
disponibilidad; y, solo en `ver_auto`, la descripción. Lo que no está cargado MUST ir en `null`.
La descripción MUST ir en una sola línea y recortada a 600 caracteres. MUST NOT incluir el costo,
el precio de venta interno ni quién lo reservó.
<!-- id: auto-publico.autoPublico -->

#### Scenario: Sin datos internos
- **WHEN** se arma la ficha pública
- **THEN** nunca incluye el costo ni datos internos
<!-- test: src/agente/auto-publico.test.js › "la ficha pública nunca incluye el costo ni datos internos" -->
<!-- test: src/agente/herramientas.test.js › "buscar_autos devuelve la ficha pública, sin costo" -->

#### Scenario: Lo que necesita el cliente
- **WHEN** se arma la ficha pública
- **THEN** trae todo lo que necesita el cliente
<!-- test: src/agente/auto-publico.test.js › "la ficha pública trae lo que necesita el cliente" -->

#### Scenario: Datos de venta
- **WHEN** el auto tiene versión, stock, precio al contado y anticipo cargados
- **THEN** la ficha los trae, con el precio como `precio_lista`
<!-- test: src/agente/auto-publico.test.js › "la ficha del bot trae versión, stock, precio de lista, precio de contado y anticipo" -->

#### Scenario: Datos sin cargar
- **WHEN** el auto no tiene versión, precio al contado, anticipo ni descripción
- **THEN** esos datos van en `null`, nunca en 0 ni inventados
<!-- test: src/agente/auto-publico.test.js › "lo que no está cargado en el auto va en null" -->

#### Scenario: Descripción
- **WHEN** la descripción tiene saltos de línea o es muy larga
- **THEN** va en una línea y recortada a 600 caracteres
<!-- test: src/agente/auto-publico.test.js › "la descripción va en una línea y recortada" -->

#### Scenario: Reservado por una seña
- **WHEN** el auto está señado
- **THEN** figura como reservado, sin decir por quién
<!-- test: src/agente/auto-publico.test.js › "reservado por una seña, sin decir de quién" -->

### Requirement: Buscar autos
`buscar_autos` MUST devolver hasta 5 autos disponibles, filtrando por tipo, condición (0 km o
usado), marca, modelo o versión, combustible, año mínimo, año máximo, km máximo, presupuesto
máximo (contra el precio de lista) y presupuesto de contado (contra el precio al contado; si el
auto no lo tiene cargado, contra el de lista). Los filtros MUST combinarse sin pisarse. MUST
excluir siempre los vendidos, señados, en trámite y borrados. El tipo "auto" MUST incluir los
autos viejos que no tienen tipo cargado. Las búsquedas MUST NOT traer la descripción.
<!-- id: herramientas.buscar_autos -->

#### Scenario: Excluye los no disponibles
- **WHEN** se buscan autos
- **THEN** nunca vuelven vendidos, señados, en trámite ni borrados
<!-- test: src/agente/herramientas.test.js › "buscar_autos excluye siempre vendidos, señados, en trámite y borrados" -->

#### Scenario: Autos sin tipo cargado
- **WHEN** se buscan autos de tipo "auto"
- **THEN** se incluyen los que no tienen tipo cargado
<!-- test: src/agente/herramientas.test.js › "buscar autos de tipo auto incluye los que no tienen tipo cargado" -->

#### Scenario: Filtros nuevos
- **WHEN** se busca por condición, modelo, combustible, año máximo y km máximo
- **THEN** la consulta filtra por cada uno, y el modelo se busca en el modelo y en la versión
<!-- test: src/agente/herramientas.test.js › "buscar_autos filtra por condición, modelo, combustible, año máximo y km máximo" -->

#### Scenario: Nafta y GNC
- **WHEN** se busca por nafta o por GNC
- **THEN** también entran los autos que andan con los dos (`nafta_gnc`)
<!-- test: src/agente/herramientas.test.js › "buscar_autos por nafta o por GNC incluye los que andan con los dos" -->

#### Scenario: Presupuesto de contado
- **WHEN** se busca con presupuesto de contado
- **THEN** entran los autos con precio al contado hasta ese monto y los que no lo tienen cargado con precio de lista hasta ese monto
<!-- test: src/agente/herramientas.test.js › "buscar_autos con presupuesto de contado usa el precio de contado y, si no está cargado, el de lista" -->

#### Scenario: Filtros combinados
- **WHEN** se busca tipo "auto" junto con presupuesto de contado y modelo
- **THEN** ningún filtro pisa a otro
<!-- test: src/agente/herramientas.test.js › "buscar_autos combina el tipo auto con otros filtros sin pisarlos" -->

#### Scenario: Sin descripción
- **WHEN** se buscan autos
- **THEN** las fichas no traen la descripción
<!-- test: src/agente/herramientas.test.js › "buscar_autos no trae la descripción" -->

### Requirement: Ver un auto
`ver_auto` MUST mostrar la ficha pública de un auto por su código, con su descripción. Un auto
vendido MUST informarse como vendido, para ofrecer parecidos. Un auto pausado o sin publicar MUST
tratarse como inexistente.
<!-- id: herramientas.ver_auto -->

#### Scenario: Auto vendido
- **WHEN** se consulta un auto vendido
- **THEN** se informa que ya se vendió
<!-- test: src/agente/herramientas.test.js › "ver_auto informa si el auto ya se vendió" -->

#### Scenario: Auto pausado o sin publicar
- **WHEN** se consulta un auto pausado o sin publicar
- **THEN** no se muestra
<!-- test: src/agente/herramientas.test.js › "ver_auto no muestra autos pausados o sin publicar" -->

#### Scenario: Código que no existe
- **WHEN** se consulta un código que no existe
- **THEN** responde que no lo encontró
<!-- test: src/agente/herramientas.test.js › "ver_auto con un código que no existe" -->

#### Scenario: Con descripción
- **WHEN** se consulta un auto que tiene descripción
- **THEN** la ficha la trae
<!-- test: src/agente/herramientas.test.js › "ver_auto trae la descripción del auto" -->
