## ADDED Requirements

### Requirement: Extender o convertir una seña revalida el auto
Al cambiar el vencimiento de una seña o al pasarla a trámite, el backend MUST volver a comprobar que
el auto siga disponible: no vendido, sin otro trámite de venta y sin otra seña que lo reserve.
Corregir solo las notas MUST NOT revalidar.
<!-- id: senas.autoParaSenar -->

#### Scenario: Extender sobre un auto ocupado
- **WHEN** se extiende una seña cuyo auto ya se vendió o está en otro trámite
- **THEN** responde con error y no se extiende
<!-- test: src/services/terminaciones.test.js › "extender una seña revalida el auto: vendido o en otro trámite, no se extiende" -->

#### Scenario: Corregir las notas
- **WHEN** se corrigen solo las notas
- **THEN** no se revalida el auto
<!-- test: src/services/terminaciones.test.js › "corregir solo las notas de una seña no revalida el auto" -->

#### Scenario: Pasar a trámite un auto ocupado
- **WHEN** se quiere pasar a trámite una seña cuyo auto ya está en otro trámite
- **THEN** responde con error
<!-- test: src/services/terminaciones.test.js › "una seña no pasa a trámite si el auto ya está en otro trámite" -->

### Requirement: Deshacer la venta devuelve la seña
Al deshacer la venta de un auto, la seña que se cerró con esa venta (convertida sin trámite y
cerrada después de la fecha de venta) MUST volver a vigente.
<!-- id: vehiculos.abrirVenta -->

#### Scenario: Deshacer una venta con seña
- **WHEN** se deshace la venta de un auto que tenía una seña cerrada al vender
- **THEN** la seña vuelve a vigente
<!-- test: src/services/terminaciones.test.js › "deshacer una venta vuelve a dejar vigente la seña que se cerró al vender" -->
