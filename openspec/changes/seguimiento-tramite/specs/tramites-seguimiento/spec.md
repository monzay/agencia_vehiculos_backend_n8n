## ADDED Requirements

### Requirement: El legajo muestra los pasos del trámite
Cada legajo MUST traer sus pasos según la modalidad, calculados con los datos que ya existen y sin
guardar un estado aparte. Los pasos que no aplican MUST NOT aparecer.
<!-- id: seguimiento.seguimientoTramite -->

#### Scenario: Venta al contado
- **WHEN** es una venta al contado
- **THEN** los pasos son boleto, firma y vendido, sin papeles ni financiación
<!-- test: src/lib/seguimiento-tramite.test.js › "venta al contado: boleto, firma, vendido, cobro, entrega y transferencia" -->

#### Scenario: Parte de pago con usado
- **WHEN** el cliente entrega un usado
- **THEN** aparecen los papeles, y están hechos cuando se cargó el título
<!-- test: src/lib/seguimiento-tramite.test.js › "parte de pago con usado: los papeles dependen del título" -->

#### Scenario: Con seña
- **WHEN** el trámite nació de una seña
- **THEN** la seña aparece como paso hecho
<!-- test: src/lib/seguimiento-tramite.test.js › "la seña aparece hecha si el trámite nació de una" -->

#### Scenario: Compra de la agencia
- **WHEN** la agencia compra el auto
- **THEN** los pasos son papeles, boleto y firma
<!-- test: src/lib/seguimiento-tramite.test.js › "compra de la agencia: papeles, boleto y firma" -->

#### Scenario: Consignación
- **WHEN** es una consignación
- **THEN** los pasos llegan hasta publicar y vender, y un retiro cierra el trámite
<!-- test: src/lib/seguimiento-tramite.test.js › "consignación: hasta publicar y vender, y el retiro la cierra" -->

### Requirement: El legajo indica el próximo paso
El próximo paso MUST ser el primero sin hacer que no sea opcional. Sin pasos pendientes MUST quedar
vacío. La financiación aparece solo si queda saldo del cliente y MUST NOT frenar el trámite.
<!-- id: seguimiento.proximo -->

#### Scenario: Próximo paso
- **WHEN** un trámite avanza
- **THEN** el próximo es el primero sin hacer, y al terminar no hay próximo
<!-- test: src/lib/seguimiento-tramite.test.js › "el próximo paso es el primero sin hacer, y al terminar no hay" -->

#### Scenario: Financiación opcional
- **WHEN** el boleto firmado de una parte de pago tiene saldo
- **THEN** aparece la financiación, opcional, y el próximo sigue siendo vendido
<!-- test: src/lib/seguimiento-tramite.test.js › "con saldo aparece la financiación, opcional, y no frena" -->

#### Scenario: Legajo
- **WHEN** se pide el detalle de un trámite
- **THEN** trae su seguimiento, también en consignación
<!-- test: src/mappers/ingreso.mapper.test.js › "el detalle del trámite trae su seguimiento" -->
