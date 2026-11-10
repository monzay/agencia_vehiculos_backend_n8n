## ADDED Requirements

### Requirement: Dominio, motor y chasis se piden en el boleto
Al crear un trámite de venta MUST NOT avisarse que al vehículo le faltan dominio, motor o chasis,
porque el alta de vehículos no los pide. El boleto MUST pedirlos como obligatorios.
<!-- id: tramites.identificacionEnBoleto -->

#### Scenario: Vehículo sin esos datos
- **WHEN** el admin crea un trámite con un vehículo sin dominio, motor ni chasis
- **THEN** no ve ningún aviso, y el formulario del boleto se los pide
<!-- test: ../sea_automotores/e2e/parte-de-pago-o-financiado.spec.mjs › "el trámite se crea sin aviso de dominio y el boleto pide dominio, motor y chasis" -->

#### Scenario: Boleto sin esos datos
- **WHEN** se quiere guardar el boleto sin dominio, motor o chasis
- **THEN** se rechaza y el error dice qué falta
<!-- test: src/lib/identificacion-vehiculo.test.js › "sin dominio, motor ni chasis no se arma el boleto y el error dice qué falta" -->
