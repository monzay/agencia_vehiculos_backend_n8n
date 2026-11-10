## ADDED Requirements

### Requirement: La parte de pago también nombra la venta financiada
La modalidad `permuta` MUST ofrecerse como "Venta financiada o con parte de pago" en Avanzar y en
Trámites, y llamarse "Parte de pago o financiado" en el formulario y en Documentos. El valor en la
base MUST seguir siendo `permuta`.
<!-- id: precarga.nombreFinanciado -->

#### Scenario: Desde una consulta
- **WHEN** el admin avanza una consulta y elige la opción
- **THEN** el formulario y Documentos usan el nombre nuevo, y el trámite se guarda como `permuta`
<!-- test: ../sea_automotores/e2e/parte-de-pago-o-financiado.spec.mjs › "desde una consulta sin usado trae el anticipo y crea el trámite" -->

#### Scenario: Desde Trámites
- **WHEN** el admin elige la opción en Trámites
- **THEN** el formulario usa el nombre nuevo
<!-- test: ../sea_automotores/e2e/parte-de-pago-o-financiado.spec.mjs › "desde Trámites propone el anticipo al marcar que no entrega vehículo" -->

### Requirement: Sin usado se propone el anticipo del vehículo
La precarga MUST traer el anticipo cargado en el vehículo. En el alta, sin usado, el monto que deja
el cliente MUST arrancar con ese anticipo y poder editarse; con usado MUST quedar vacío. Lo escrito
por el admin MUST NOT pisarse. El anticipo que dijo el cliente MUST NOT usarse como monto.
<!-- id: precarga.anticipoDelVehiculo -->

#### Scenario: La precarga trae el anticipo del vehículo
- **WHEN** el vehículo de la consulta tiene anticipo
- **THEN** la precarga lo trae, y sin anticipo trae null
<!-- test: src/services/precarga-tramite.service.test.js › "trae el anticipo que la agencia cargó en el vehículo" -->

#### Scenario: Lo que dijo el cliente
- **WHEN** el cliente dijo un anticipo en la consulta
- **THEN** queda en sus respuestas y no como monto
<!-- test: src/services/precarga-tramite.service.test.js › "trae los datos del cliente y lo que respondió en la consulta" -->

#### Scenario: Sin usado
- **WHEN** el cliente no entrega usado y el vehículo tiene anticipo
- **THEN** se propone ese anticipo
<!-- test: ../sea_automotores/components/panel/secciones/documentos/modalidades.test.js › "sin usado se propone el anticipo del vehículo" -->

#### Scenario: Con usado
- **WHEN** el cliente entrega un usado
- **THEN** no se propone nada
<!-- test: ../sea_automotores/components/panel/secciones/documentos/modalidades.test.js › "con usado no se propone nada" -->

#### Scenario: Vehículo sin anticipo
- **WHEN** el vehículo no tiene anticipo cargado
- **THEN** no se propone nada
<!-- test: ../sea_automotores/components/panel/secciones/documentos/modalidades.test.js › "un vehículo sin anticipo no propone nada" -->

#### Scenario: Cambio de vehículo o de opción
- **WHEN** cambia el vehículo o si entrega usado, y el monto es el propuesto
- **THEN** el monto pasa a lo que corresponde ahora
<!-- test: ../sea_automotores/components/panel/secciones/documentos/modalidades.test.js › "lo sugerido sigue al cambio de vehículo o de opción" -->

#### Scenario: Monto escrito por el admin
- **WHEN** el admin escribió otro monto y cambia el vehículo o la opción
- **THEN** su monto se respeta
<!-- test: ../sea_automotores/components/panel/secciones/documentos/modalidades.test.js › "lo que escribió el admin se respeta" -->
