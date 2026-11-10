## ADDED Requirements

### Requirement: Conversión de consultas por asesor
`GET /api/leads/conversion` MUST exigir un admin y devolver, en total y por asesor, cuántas
consultas hubo, cuántas avanzaron a una seña o un trámite y cuántas se vendieron. Las consultas sin
asesor cuentan como "Sin asignar". Vendida es la que tiene un trámite vendido o una seña convertida
sin trámite.
<!-- id: conversion.conversionPorAsesor -->

#### Scenario: Conversión por asesor
- **WHEN** el admin abre Resumen
- **THEN** ve por asesor las consultas, las que avanzaron y las que se vendieron
<!-- test: src/services/terminaciones.test.js › "cuenta por asesor cuántas consultas avanzaron y cuántas se vendieron" -->

#### Scenario: Solo desde que existe el vínculo
- **WHEN** se calcula la conversión
- **THEN** solo cuentan las consultas iniciadas desde el 03/11/2026, cuando la consulta empezó a recordar qué nació de ella
<!-- test: src/services/terminaciones.test.js › "la conversión solo cuenta las consultas desde el 03/11/2026, cuando empezó el vínculo" -->
