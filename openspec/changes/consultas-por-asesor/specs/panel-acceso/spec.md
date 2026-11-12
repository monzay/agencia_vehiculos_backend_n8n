## ADDED Requirements

### Requirement: Alcance de consultas por usuario
El alcance de un usuario MUST calcularse con sus datos en la base, no con el token. Un admin activo
MUST ver todas las consultas. Un asesor activo MUST ver solo las consultas cuyo `vendedor_id` es
el de su ficha de asesor. Un usuario sin ficha de asesor, inactivo o borrado MUST NOT ver ninguna.
<!-- id: alcance-consultas.alcanceDeConsultas -->

#### Scenario: Admin
- **WHEN** se calcula el alcance de un admin activo
- **THEN** no se filtra ninguna consulta
<!-- test: src/lib/alcance-consultas.test.js › "el admin ve todas las consultas" -->

#### Scenario: Asesor
- **WHEN** se calcula el alcance de un asesor activo con ficha de asesor
- **THEN** solo entran las consultas de esa ficha
<!-- test: src/lib/alcance-consultas.test.js › "un asesor ve solo las consultas de su ficha" -->

#### Scenario: Asesor sin ficha
- **WHEN** se calcula el alcance de un asesor sin ficha de asesor
- **THEN** no entra ninguna consulta
<!-- test: src/lib/alcance-consultas.test.js › "un asesor sin ficha de asesor no ve ninguna consulta" -->

#### Scenario: Usuario inactivo o borrado
- **WHEN** se calcula el alcance de un usuario inactivo, borrado o que no existe
- **THEN** no entra ninguna consulta, aunque su token siga vigente
<!-- test: src/lib/alcance-consultas.test.js › "un usuario inactivo, borrado o inexistente no ve ninguna consulta" -->

### Requirement: Listados de consultas con alcance
El listado de Consultas y el de Vender/Consignación MUST aplicar el alcance del usuario, junto con
los filtros y la búsqueda, y el total MUST contar solo lo que entra en el alcance. Las consultas sin
asesor asignado MUST quedar solo para el admin.
<!-- id: consultas.service.listarConsultas -->

#### Scenario: Listado de compra
- **WHEN** un asesor pide el listado de Consultas
- **THEN** la consulta a la base lleva su alcance
<!-- test: src/services/consultas.alcance.test.js › "el listado de consultas aplica el alcance del usuario" -->

#### Scenario: Listado de venta y consignación
- **WHEN** un asesor pide el listado de Vender/Consignación
- **THEN** la consulta a la base lleva su alcance
<!-- test: src/services/consultas.alcance.test.js › "el listado de venta y consignación aplica el alcance del usuario" -->

### Requirement: Detalle y acciones dentro del alcance
Ver el detalle de una consulta, marcarla atendida, responderle al cliente y devolverla al bot MUST
responder 404 si la consulta está fuera del alcance del usuario, igual que si no existiera, y sin
escribir ni enviar nada.
<!-- id: consultas.service.obtenerConsulta -->

#### Scenario: Detalle ajeno
- **WHEN** un asesor pide el detalle de una consulta de otro asesor
- **THEN** la respuesta es no encontrada
<!-- test: src/services/consultas.alcance.test.js › "el detalle de una consulta de otro asesor da no encontrada" -->

#### Scenario: Acciones ajenas
- **WHEN** un asesor intenta marcar atendida, responder o devolver al bot una consulta de otro asesor
- **THEN** no se escribe ni se envía nada y la respuesta es no encontrada
<!-- test: src/services/consultas.alcance.test.js › "un asesor no puede marcar atendida, responder ni devolver al bot una consulta de otro asesor" -->

### Requirement: Clientes solo para el admin
La API de clientes (`GET /api/leads` y `GET /api/leads/:id`) MUST responder 403 a un asesor y 401
sin sesión. El resumen y las métricas (`/api/leads/resumen` y `/api/leads/metricas`) MUST seguir
disponibles para cualquier usuario con sesión. El menú del panel MUST NOT mostrarle la sección
Clientes a un asesor.
<!-- id: leads.routes -->

#### Scenario: Asesor en la API de clientes
- **WHEN** un asesor pide la lista o el detalle de clientes
- **THEN** recibe 403
<!-- test: src/routes/permisos-clientes.routes.test.js › "un asesor no puede ver la lista ni el detalle de clientes" -->

#### Scenario: Sin sesión
- **WHEN** alguien sin sesión pide la lista de clientes
- **THEN** recibe 401
<!-- test: src/routes/permisos-clientes.routes.test.js › "sin sesión, tampoco puede ver clientes" -->

### Requirement: Novedades con alcance
El contador de novedades de Consultas y el de Vender/Consignación MUST contar solo las consultas que
el usuario puede ver. El de Clientes MUST dar 0 a quien no es admin.
<!-- id: novedades.service.contarNuevos -->

#### Scenario: Consultas de un asesor
- **WHEN** se cuentan las novedades de Consultas o de Vender/Consignación
- **THEN** a un asesor solo le cuentan las de su ficha y a un admin, todas
<!-- test: src/services/novedades.alcance.test.js › "las novedades de consultas y de ventas de un asesor cuentan solo las suyas" -->

#### Scenario: Clientes de un asesor
- **WHEN** se cuentan las novedades de Clientes
- **THEN** a quien no es admin no le cuentan
<!-- test: src/services/novedades.alcance.test.js › "las novedades de clientes no cuentan para un asesor" -->

### Requirement: Lo que ve cada uno en el panel
En el panel, un asesor MUST ver en Consultas solo las suyas y MUST NOT ver la sección Clientes. El
admin MUST ver las consultas de todos los asesores y las sin asignar.
<!-- id: panel.consultas -->

#### Scenario: Asesor
- **WHEN** un asesor entra al panel
- **THEN** en Consultas ve solo las suyas y el menú no tiene Clientes
<!-- test: ../sea_automotores/e2e/consultas-por-asesor.spec.mjs › "un asesor ve solo sus consultas y no tiene la sección Clientes" -->

#### Scenario: Admin
- **WHEN** el admin entra a Consultas
- **THEN** ve las de todos los asesores y las sin asignar
<!-- test: ../sea_automotores/e2e/consultas-por-asesor.spec.mjs › "el admin ve las consultas de todos los asesores y las sin asignar" -->
