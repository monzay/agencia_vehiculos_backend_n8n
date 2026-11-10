## ADDED Requirements

### Requirement: La lista de trámites filtra lo que sigue en curso
El filtro `estado=en_curso` MUST devolver los trámites que todavía tienen algo por hacer, en
cualquier modalidad: los que no están vendidos ni retirados, y las ventas vendidas que aún no se
entregaron o no se transfirieron.
<!-- id: ingresos.listarIngresos -->

#### Scenario: En curso
- **WHEN** se filtra por En curso
- **THEN** queda afuera lo terminado, y una venta sigue en curso hasta entregar y transferir
<!-- test: src/services/terminaciones.test.js › "el filtro En curso deja afuera lo terminado, y una venta sigue en curso hasta entregar y transferir" -->

### Requirement: La lista dice el próximo paso
Cada trámite de la lista MUST traer `proximoPaso` con el nombre del próximo paso de su seguimiento,
o vacío si no queda nada por hacer.
<!-- id: ingresos.conProximoPaso -->

#### Scenario: Próximo paso en la lista
- **WHEN** se pide la lista de trámites
- **THEN** cada uno trae su próximo paso
<!-- test: src/services/terminaciones.test.js › "la lista dice el próximo paso de cada trámite" -->

### Requirement: La búsqueda incluye el auto vendido
La búsqueda MUST encontrar un trámite también por la marca, el modelo o el dominio del auto que la
agencia vende en él.
<!-- id: ingresos.listarIngresos.busqueda -->

#### Scenario: Buscar por el auto vendido
- **WHEN** se busca por el modelo del auto que se vendió
- **THEN** aparece el trámite
<!-- test: src/services/terminaciones.test.js › "se busca también por el auto que se vendió" -->
