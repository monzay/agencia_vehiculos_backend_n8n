## ADDED Requirements

### Requirement: Cancelar un trámite libera el auto y la seña
Cancelar MUST ser un borrado lógico: la fila queda para auditoría, el auto deja de estar comprometido
y una seña de la que nació vuelve a vigente. MUST rechazarse si el trámite está vendido, publicado,
firmado o con financiación activa, diciendo qué hacer primero. Una consignación que ya tuvo ficha en
la web MUST NOT cancelarse: sin legajo, la ficha quedaría huérfana; su salida es marcarla retirada.
<!-- id: ingresos.eliminarIngreso -->

#### Scenario: Trámite abierto
- **WHEN** se cancela un trámite sin nada que lo frene
- **THEN** queda borrado de forma lógica y su seña vuelve a vigente
<!-- test: src/services/tramite-venta.service.test.js › "cancelar un trámite abierto lo borra de forma lógica y devuelve la seña" -->

#### Scenario: Trámite con frenos
- **WHEN** el trámite está vendido, publicado, firmado, con financiación o ya tuvo ficha en la web
- **THEN** se rechaza y no se borra
<!-- test: src/services/tramite-venta.service.test.js › "no se cancela un trámite vendido, publicado, firmado o con financiación" -->

#### Scenario: Trámite inexistente
- **WHEN** el trámite no existe o el id no es válido
- **THEN** no se borra nada
<!-- test: src/services/tramite-venta.service.test.js › "cancelar un trámite inexistente no hace nada" -->
