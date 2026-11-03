## ADDED Requirements

### Requirement: Un auto con trámite abierto no se ve en la web
El catálogo público, su ficha y sus marcas MUST excluir los autos con un trámite de venta abierto o
con un boleto de un trámite vigente, igual que el agente los da por reservados. Al cancelar el
trámite el auto vuelve a verse.
<!-- id: vehiculos.catalogoPublico -->

#### Scenario: Listado, ficha y marcas
- **WHEN** alguien consulta el catálogo público
- **THEN** los tres filtros excluyen los autos con trámite abierto
<!-- test: src/services/vehiculos.catalogo.test.js › "el catálogo público excluye los autos con trámite abierto" -->

#### Scenario: Mismo criterio que el agente
- **WHEN** el agente evalúa si un auto está disponible
- **THEN** usa el mismo filtro que la web
<!-- test: src/services/vehiculos.catalogo.test.js › "la web y el agente usan el mismo filtro" -->
