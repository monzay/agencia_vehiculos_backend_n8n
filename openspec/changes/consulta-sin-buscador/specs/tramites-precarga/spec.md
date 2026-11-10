## ADDED Requirements

### Requirement: Quien viene puede no ser quien escribió
Si la consulta llegó desde el teléfono de otra persona y al avanzar se corrige el nombre y se carga
un DNI que no existe, el trámite MUST quedar en el cliente de la consulta, con ese nombre y ese DNI,
sin crear otra ficha.
<!-- id: precarga.personaDistinta -->

#### Scenario: Consulta desde el teléfono de la madre
- **WHEN** la consulta es de la ficha de la madre, sin DNI, y compra Pedro
- **THEN** la misma ficha queda con el nombre y el DNI de Pedro, y el trámite es suyo
<!-- test: ../sea_automotores/e2e/persona-distinta-de-la-consulta.spec.mjs › "si consulta desde el teléfono de la madre y viene otra persona, la consulta queda con su nombre y su DNI" -->

### Requirement: Al avanzar desde una consulta no se busca al cliente
El formulario de una seña o una venta abierto desde una consulta MUST mostrar los datos del cliente,
editables, y MUST NOT ofrecer el buscador de clientes ni pedir que se lo busque. Abierto desde
Trámites MUST seguir ofreciendo el buscador. El DNI que falte MUST NOT deducirse del CUIL.
<!-- id: precarga.sinBuscador -->

#### Scenario: Seña desde una consulta
- **WHEN** el admin avanza una consulta a una seña
- **THEN** ve los datos del cliente y no ve el buscador
<!-- test: ../sea_automotores/e2e/consulta-sin-buscador.spec.mjs › "Seña desde una consulta no muestra el buscador y trae los datos" -->

#### Scenario: Venta al contado desde una consulta
- **WHEN** el admin avanza una consulta a una venta al contado
- **THEN** ve los datos del cliente y no ve el buscador
<!-- test: ../sea_automotores/e2e/consulta-sin-buscador.spec.mjs › "Venta al contado desde una consulta no muestra el buscador y trae los datos" -->

#### Scenario: Venta con parte de pago desde una consulta
- **WHEN** el admin avanza una consulta a una venta con parte de pago
- **THEN** ve los datos del cliente y no ve el buscador
<!-- test: ../sea_automotores/e2e/consulta-sin-buscador.spec.mjs › "Venta financiada o con parte de pago desde una consulta no muestra el buscador y trae los datos" -->

#### Scenario: La ficha tiene CUIL y no tiene DNI
- **WHEN** el cliente de la consulta tiene CUIL pero no DNI
- **THEN** el DNI queda vacío, para cargarlo a mano
<!-- test: ../sea_automotores/e2e/consulta-sin-buscador.spec.mjs › "Venta al contado desde una consulta no muestra el buscador y trae los datos" -->

#### Scenario: Seña desde Trámites
- **WHEN** el admin abre una seña desde Trámites
- **THEN** ve el buscador de clientes
<!-- test: ../sea_automotores/e2e/consulta-sin-buscador.spec.mjs › "Seña desde Trámites sigue ofreciendo el buscador" -->

#### Scenario: Venta desde Trámites
- **WHEN** el admin abre una venta desde Trámites
- **THEN** ve el buscador de clientes
<!-- test: ../sea_automotores/e2e/consulta-sin-buscador.spec.mjs › "Venta al contado desde Trámites sigue ofreciendo el buscador" -->
