## ADDED Requirements

### Requirement: Vendido exige el boleto firmado
Un auto vendido por boleto MUST tener el boleto firmado. Sin firma la venta se rechaza y no cambia nada.
<!-- id: compraventa.venderAutoDelBoleto -->

#### Scenario: Sin firmar
- **WHEN** se marca vendido un boleto sin firmar
- **THEN** se rechaza
<!-- test: src/services/tramite-venta.service.test.js › "no se marca vendido sin el boleto firmado" -->

#### Scenario: Firmado
- **WHEN** se marca vendido un boleto firmado
- **THEN** el auto y el trámite quedan vendidos
<!-- test: src/services/tramite-venta.service.test.js › "con el boleto firmado se marca vendido" -->

### Requirement: Un auto vendido no se desfirma
Un contrato de un trámite vendido MUST NOT desfirmarse: primero se deshace la venta.
<!-- id: compraventa.desfirmar -->

#### Scenario: Boleto
- **WHEN** se desfirma el boleto de un trámite vendido
- **THEN** se rechaza
<!-- test: src/services/tramite-venta.service.test.js › "no se desfirma el boleto de un trámite vendido" -->

#### Scenario: Consignación
- **WHEN** se desfirma el contrato de una consignación vendida
- **THEN** se rechaza
<!-- test: src/services/tramite-venta.service.test.js › "no se desfirma el contrato de una consignación vendida" -->

### Requirement: Deshacer una venta deja todo como estaba
Deshacer una venta con financiación activa MUST rechazarse: primero se elimina la financiación, para
no seguir cobrando cuotas de una venta que no existe. Deshacer la venta de una consignación MUST
funcionar y dejarla publicada.
<!-- id: compraventa.deshacerVenta -->

#### Scenario: Con financiación
- **WHEN** se deshace la venta de un trámite con financiación activa
- **THEN** se rechaza
<!-- test: src/services/tramite-venta.service.test.js › "no se deshace una venta con financiación activa" -->

#### Scenario: Consignación vendida
- **WHEN** se deshace la venta de una consignación
- **THEN** el auto vuelve a estar a la venta
<!-- test: src/services/tramite-venta.service.test.js › "se deshace la venta de una consignación" -->

#### Scenario: Publicar o retirar una consignación vendida
- **WHEN** se intenta publicar o retirar una consignación vendida
- **THEN** se sigue rechazando
<!-- test: src/services/tramite-venta.service.test.js › "una consignación vendida no se publica ni se retira" -->
