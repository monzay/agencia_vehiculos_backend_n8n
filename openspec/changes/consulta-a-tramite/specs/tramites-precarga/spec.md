## ADDED Requirements

### Requirement: La consulta precarga el alta del trámite
La precarga MUST traer los datos de contacto del cliente, su CUIL del perfil o, si no hay, el de la
ficha, y lo que respondió en la consulta para tenerlo a la vista. MUST NOT crear ni modificar nada, y
MUST NOT sugerir una operación: la elige el admin.
<!-- id: precarga.precargaDeConsulta -->

#### Scenario: Cliente de la consulta
- **WHEN** el admin avanza una consulta
- **THEN** recibe los datos del cliente y sus respuestas
<!-- test: src/services/precarga-tramite.service.test.js › "trae los datos del cliente y lo que respondió en la consulta" -->

#### Scenario: CUIL
- **WHEN** el perfil tiene CUIT y la ficha tiene CUIL
- **THEN** manda el del perfil, y sin perfil se usa el de la ficha
<!-- test: src/services/precarga-tramite.service.test.js › "el CUIL del perfil manda sobre el de la ficha" -->

#### Scenario: Consulta inexistente
- **WHEN** la consulta no existe o el id no es válido
- **THEN** no hay precarga
<!-- test: src/services/precarga-tramite.service.test.js › "una consulta inexistente o un id inválido no tiene precarga" -->

### Requirement: El auto de interés se ofrece solo si está disponible
Un auto se MUST precargar en una venta solo si se puede vender, y en una seña solo si se puede señar,
con las mismas reglas que al guardar. Si no se puede, la precarga MUST decir el motivo.
<!-- id: precarga.autoDeConsulta -->

#### Scenario: Auto libre
- **WHEN** el auto de la consulta está a la venta y libre
- **THEN** se puede vender y señar, sin aviso
<!-- test: src/services/precarga-tramite.service.test.js › "un auto libre se puede vender y señar" -->

#### Scenario: Auto vendido
- **WHEN** el auto ya está vendido
- **THEN** no se puede vender ni señar, y dice por qué
<!-- test: src/services/precarga-tramite.service.test.js › "un auto vendido no se ofrece y dice por qué" -->

#### Scenario: Auto en consignación
- **WHEN** el auto es de un tercero
- **THEN** solo se puede señar
<!-- test: src/services/precarga-tramite.service.test.js › "un auto en consignación solo se puede señar" -->

#### Scenario: Auto en otro trámite
- **WHEN** el auto ya está en otro trámite abierto
- **THEN** no se puede vender ni señar
<!-- test: src/services/precarga-tramite.service.test.js › "un auto en otro trámite no se ofrece" -->

#### Scenario: Auto que ya no existe
- **WHEN** el auto de la consulta se borró
- **THEN** no hay auto y lo avisa
<!-- test: src/services/precarga-tramite.service.test.js › "un auto borrado se avisa" -->

### Requirement: El usado se precarga sin inventar valores
De un usado en parte de pago MUST precargarse el vehículo, los kilómetros si son un número y el
estado. El valor de toma MUST NOT precargarse: lo decide la agencia.
<!-- id: precarga.parteDePago -->

#### Scenario: Usado en parte de pago
- **WHEN** la consulta tiene un usado
- **THEN** trae vehículo, kilómetros y estado, sin valor de toma
<!-- test: src/services/precarga-tramite.service.test.js › "el usado se precarga sin valor de toma" -->

#### Scenario: Kilómetros en texto libre
- **WHEN** el cliente escribió los kilómetros
- **THEN** se toman si son un número, y si no quedan vacíos
<!-- test: src/services/precarga-tramite.service.test.js › "los kilómetros se toman solo si son un número" -->

### Requirement: La precarga es solo del admin
La lectura MUST quedar bajo la misma protección que el resto de los trámites: un asesor recibe 403
y sin sesión 401, antes de tocar la base.
<!-- id: precarga.permisos -->

#### Scenario: Asesor y sin sesión
- **WHEN** un asesor o alguien sin sesión pide una precarga
- **THEN** se rechaza
<!-- test: src/routes/permisos-senas-documentos.routes.test.js › "la precarga de un trámite es solo del admin" -->
