## ADDED Requirements

### Requirement: CBU y alias solo en la consignación
El formulario de un trámite MUST pedir CBU y alias solo si es una consignación. El legajo MUST
mostrarlos solo en una consignación, aunque la ficha del cliente los tenga.
<!-- id: panel.cuentaSoloConsignacion -->

#### Scenario: Formularios de venta y compra
- **WHEN** el admin abre el alta de una venta o de una compra
- **THEN** no se le piden CBU ni alias
<!-- test: ../sea_automotores/e2e/panel-segun-tramite.spec.mjs › "los formularios de venta y compra no piden CBU ni alias" -->

#### Scenario: Formulario de consignación
- **WHEN** el admin abre el alta de una consignación
- **THEN** se le piden CBU y alias
<!-- test: ../sea_automotores/e2e/panel-segun-tramite.spec.mjs › "el formulario de consignación sigue pidiendo CBU y alias" -->

#### Scenario: Legajo de una venta
- **WHEN** el titular de una venta tiene CBU en su ficha
- **THEN** el legajo no lo muestra
<!-- test: ../sea_automotores/e2e/panel-segun-tramite.spec.mjs › "el legajo de una venta no muestra CBU ni Ver consulta" -->

#### Scenario: Legajo de una consignación
- **WHEN** el titular de una consignación tiene CBU
- **THEN** el legajo lo muestra
<!-- test: ../sea_automotores/e2e/panel-segun-tramite.spec.mjs › "el legajo de una consignación muestra CBU" -->

### Requirement: El boleto pide el estado de la unidad solo si se recibe un vehículo
El formulario del boleto MUST pedir el estado de la unidad al recibirla solo si la agencia recibe un
vehículo del cliente.
<!-- id: panel.estadoSoloConUsado -->

#### Scenario: Parte de pago sin usado
- **WHEN** el cliente no entrega un vehículo
- **THEN** el boleto no pide el estado de la unidad
<!-- test: ../sea_automotores/e2e/panel-segun-tramite.spec.mjs › "el boleto de una parte de pago sin usado no pide el estado de la unidad" -->

#### Scenario: Venta al contado
- **WHEN** la venta es al contado
- **THEN** el boleto no pide el estado de la unidad
<!-- test: ../sea_automotores/e2e/panel-segun-tramite.spec.mjs › "el boleto de una venta al contado no pide el estado de la unidad" -->

#### Scenario: Parte de pago con usado
- **WHEN** el cliente entrega un vehículo
- **THEN** el boleto pide el estado de la unidad
<!-- test: ../sea_automotores/e2e/panel-segun-tramite.spec.mjs › "el boleto de una parte de pago con usado pide el estado de la unidad" -->

#### Scenario: Compra de la agencia
- **WHEN** la agencia compra el vehículo
- **THEN** el boleto pide el estado de la unidad
<!-- test: ../sea_automotores/e2e/panel-segun-tramite.spec.mjs › "el boleto de una compra pide el estado de la unidad" -->

### Requirement: Los usados se publican desde el legajo
La sección Preparación MUST NOT existir en el menú. Lo que hacía (requisitos, precio, fotos y
publicar) MUST hacerse en una pestaña del legajo en Documentos, solo si el trámite recibió un usado.
<!-- id: panel.publicacionEnLegajo -->

#### Scenario: Menú
- **WHEN** alguien entra al panel
- **THEN** el menú no tiene Preparación
<!-- test: ../sea_automotores/e2e/panel-segun-tramite.spec.mjs › "el menú ya no tiene la sección Preparación" -->

#### Scenario: Usado recibido
- **WHEN** el admin abre el legajo de un usado recibido
- **THEN** ve qué le falta para publicarlo y puede publicarlo ahí mismo
<!-- test: ../sea_automotores/e2e/panel-segun-tramite.spec.mjs › "un usado recibido se publica desde su legajo en Documentos" -->

#### Scenario: Sin usado recibido
- **WHEN** el trámite no recibió un usado
- **THEN** el legajo no tiene esa pestaña
<!-- test: ../sea_automotores/e2e/panel-segun-tramite.spec.mjs › "un trámite sin usado recibido no tiene la pestaña Publicación" -->

### Requirement: El panel no muestra lo que el dueño sacó
Resumen MUST NOT mostrar la conversión de consultas, Consultas MUST NOT ofrecer elegir el tipo, y el
legajo MUST NOT enlazar a la consulta.
<!-- id: panel.elementosQuitados -->

#### Scenario: Resumen
- **WHEN** el admin entra a Resumen
- **THEN** no ve la conversión de consultas
<!-- test: ../sea_automotores/e2e/panel-segun-tramite.spec.mjs › "Resumen no muestra la conversión de consultas" -->

#### Scenario: Consultas
- **WHEN** el admin entra a Consultas
- **THEN** no puede elegir entre compra, venta directa y consignación
<!-- test: ../sea_automotores/e2e/panel-segun-tramite.spec.mjs › "Consultas no ofrece elegir el tipo" -->

#### Scenario: Legajo
- **WHEN** el admin abre el legajo de un trámite nacido de una consulta
- **THEN** no ve "Ver consulta"
<!-- test: ../sea_automotores/e2e/panel-segun-tramite.spec.mjs › "el legajo de una venta no muestra CBU ni Ver consulta" -->
