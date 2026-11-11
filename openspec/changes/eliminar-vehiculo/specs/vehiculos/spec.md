## ADDED Requirements

### Requirement: Solo el admin elimina un vehículo
Eliminar un vehículo por la API MUST quedar reservado al admin. Un asesor MUST recibir 403 y un pedido
sin sesión MUST recibir 401, en los dos casos sin tocar la base.
<!-- id: vehiculos.routes.deleteVehiculo -->

#### Scenario: Asesor
- **WHEN** un asesor pide eliminar un vehículo
- **THEN** recibe 403
<!-- test: src/routes/permisos-vehiculos.routes.test.js › "un asesor no puede eliminar un vehículo" -->

#### Scenario: Sin sesión
- **WHEN** alguien sin sesión pide eliminar un vehículo
- **THEN** recibe 401
<!-- test: src/routes/permisos-vehiculos.routes.test.js › "sin sesión, tampoco puede eliminar un vehículo" -->

### Requirement: Eliminar es un borrado lógico
Eliminar un vehículo MUST marcarlo con `deleted_at` y `disponible = false`, sin borrar la fila. Un
vehículo que no existe o que ya fue eliminado MUST NOT modificarse y la respuesta MUST ser 404.
<!-- id: vehiculos.service.eliminarVehiculo -->

#### Scenario: Auto vigente
- **WHEN** el admin elimina un auto vigente
- **THEN** el auto queda en la base con `deleted_at` y `disponible = false`
<!-- test: src/services/vehiculos.eliminar.test.js › "eliminar marca el auto como borrado y no disponible, sin sacarlo de la base" -->

#### Scenario: Auto inexistente o ya eliminado
- **WHEN** se elimina una ref que no existe o que ya fue eliminada
- **THEN** no se escribe nada y la respuesta es 404
<!-- test: src/services/vehiculos.eliminar.test.js › "eliminar un auto inexistente o ya eliminado no escribe nada" -->

### Requirement: Botón Eliminar en el panel
En la sección Vehículos, cada vehículo MUST tener un botón Eliminar visible solo para el admin. El
botón MUST pedir confirmación antes de borrar. Al confirmar, el vehículo MUST desaparecer del panel y
del catálogo; al cancelar, MUST quedar como estaba.
<!-- id: panel.vehiculos.eliminar -->

#### Scenario: El admin confirma
- **WHEN** el admin toca Eliminar en un vehículo y confirma
- **THEN** el vehículo desaparece del panel y del catálogo público
<!-- test: ../sea_automotores/e2e/eliminar-vehiculo.spec.mjs › "el admin elimina un vehículo después de confirmar y desaparece del panel y del catálogo" -->

#### Scenario: El admin cancela
- **WHEN** el admin toca Eliminar y cancela la confirmación
- **THEN** el vehículo sigue en el panel
<!-- test: ../sea_automotores/e2e/eliminar-vehiculo.spec.mjs › "cancelar la confirmación no elimina el vehículo" -->

#### Scenario: Asesor
- **WHEN** un asesor abre la sección Vehículos
- **THEN** no ve el botón Eliminar
<!-- test: ../sea_automotores/e2e/eliminar-vehiculo.spec.mjs › "un asesor no ve el botón de eliminar" -->
