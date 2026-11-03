## ADDED Requirements

### Requirement: La consulta sabe qué nació de ella
Una consulta MUST informar su trámite vigente o, si no tiene, su seña vigente, vencida o cerrada con
la venta. El trámite MUST mandar sobre la seña. Un trámite o una seña cancelados MUST NOT contar.
<!-- id: avance.avanceDeConsulta -->

#### Scenario: Sin trámite ni seña
- **WHEN** la consulta no avanzó
- **THEN** no tiene avance
<!-- test: src/services/consulta-avance.service.test.js › "una consulta sin trámite ni seña no tiene avance" -->

#### Scenario: Seña que pasó a trámite
- **WHEN** la consulta tiene un trámite y la seña de la que nació
- **THEN** informa el trámite
<!-- test: src/services/consulta-avance.service.test.js › "el trámite manda sobre la seña de la que nació" -->

#### Scenario: Estado de la seña
- **WHEN** la consulta solo tiene una seña
- **THEN** dice si sigue vigente, venció o se cerró con la venta
<!-- test: src/services/consulta-avance.service.test.js › "la seña dice si sigue vigente, venció o se cerró con la venta" -->

#### Scenario: Cancelado
- **WHEN** el trámite o la seña se cancelaron
- **THEN** no se leen y la consulta queda libre
<!-- test: src/services/consulta-avance.service.test.js › "un trámite cancelado o una seña cancelada liberan la consulta" -->

#### Scenario: Lista de consultas
- **WHEN** se pide la lista de consultas
- **THEN** cada una dice si ya avanzó
<!-- test: src/services/consultas.service.test.js › "la lista dice si cada consulta ya avanzó a un trámite o una seña" -->

### Requirement: Una consulta avanza una sola vez
Al crear un trámite o una seña desde una consulta, MUST validarse que exista y que no haya avanzado.
El vínculo MUST ser opcional.
<!-- id: avance.sesionParaAvanzar -->

#### Scenario: Sin consulta
- **WHEN** no viene una consulta
- **THEN** no hay nada que vincular
<!-- test: src/services/consulta-avance.service.test.js › "sin consulta no hay nada que vincular" -->

#### Scenario: Consulta inválida
- **WHEN** el id no es válido o la consulta no existe
- **THEN** se rechaza
<!-- test: src/services/consulta-avance.service.test.js › "una consulta inválida o inexistente se rechaza" -->

#### Scenario: Consulta que ya avanzó
- **WHEN** la consulta ya tiene un trámite o una seña
- **THEN** se rechaza
<!-- test: src/services/consulta-avance.service.test.js › "una consulta que ya avanzó no vuelve a avanzar" -->

### Requirement: Trámites y señas guardan su consulta
Una venta al contado, una parte de pago y una seña MUST guardar la consulta de la que nacieron, y el
trámite que nace de una seña MUST heredarla. Una compra o consignación MUST NOT nacer de una consulta.
<!-- id: avance.vinculo -->

#### Scenario: Venta desde una consulta
- **WHEN** se crea una venta con una consulta
- **THEN** guarda el vínculo
<!-- test: src/services/consulta-avance.service.test.js › "la venta que nace de una consulta guarda el vínculo" -->

#### Scenario: Trámite sin consulta
- **WHEN** se crea un trámite desde la sección Trámites
- **THEN** queda sin vínculo
<!-- test: src/services/consulta-avance.service.test.js › "un trámite sin consulta no lleva vínculo" -->

#### Scenario: Compra o consignación
- **WHEN** una compra o consignación trae una consulta
- **THEN** se rechaza sin crear nada
<!-- test: src/services/consulta-avance.service.test.js › "una compra o consignación no nace de una consulta" -->

#### Scenario: Otra venta
- **WHEN** se crea una venta desde una consulta que ya avanzó
- **THEN** se rechaza sin crear nada
<!-- test: src/services/consulta-avance.service.test.js › "no se crea otra venta desde una consulta que ya avanzó" -->

#### Scenario: Seña desde una consulta
- **WHEN** se registra una seña con una consulta
- **THEN** guarda el vínculo
<!-- test: src/services/consulta-avance.service.test.js › "la seña que nace de una consulta guarda el vínculo" -->

#### Scenario: Otra seña
- **WHEN** se registra una seña desde una consulta que ya avanzó
- **THEN** se rechaza sin crear nada
<!-- test: src/services/consulta-avance.service.test.js › "no se crea otra seña desde una consulta que ya avanzó" -->

#### Scenario: Seña que pasa a trámite
- **WHEN** una seña con consulta inicia un trámite
- **THEN** el trámite hereda la consulta
<!-- test: src/services/consulta-avance.service.test.js › "el trámite que nace de una seña hereda su consulta" -->
