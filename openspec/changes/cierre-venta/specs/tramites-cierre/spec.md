## ADDED Requirements

### Requirement: Una venta hecha se marca cobrada, entregada y transferida
En una venta al contado o con parte de pago ya vendida, el admin MUST poder marcar cada hito con la
fecha real, que MUST NOT ser futura. Compra y consignación MUST NOT llevar estos hitos. Volver a
marcar MUST corregir la fecha.
<!-- id: cierre.marcarHito -->

#### Scenario: Marcar
- **WHEN** se marca un hito con su fecha
- **THEN** queda guardado y se devuelve el legajo
<!-- test: src/services/tramite-hitos.service.test.js › "marca un hito con su fecha y devuelve el legajo" -->

#### Scenario: Volver a marcar
- **WHEN** se marca un hito ya desmarcado o con otra fecha
- **THEN** se reactiva y corrige la fecha
<!-- test: src/services/tramite-hitos.service.test.js › "volver a marcar reactiva el hito y corrige la fecha" -->

#### Scenario: Hito inexistente
- **WHEN** el tipo no existe
- **THEN** se rechaza sin escribir
<!-- test: src/services/tramite-hitos.service.test.js › "un hito que no existe no se marca ni se desmarca" -->

#### Scenario: Fecha
- **WHEN** falta la fecha, no es válida o es futura
- **THEN** se rechaza sin escribir
<!-- test: src/services/tramite-hitos.service.test.js › "la fecha es obligatoria y no puede ser futura" -->

#### Scenario: Sin vender
- **WHEN** el trámite no está vendido
- **THEN** se rechaza sin escribir
<!-- test: src/services/tramite-hitos.service.test.js › "sin vender no se marca nada" -->

#### Scenario: Compra o consignación
- **WHEN** el trámite es una compra o una consignación
- **THEN** se rechaza sin escribir
<!-- test: src/services/tramite-hitos.service.test.js › "compra y consignación no llevan estos hitos" -->

#### Scenario: Trámite inexistente
- **WHEN** el trámite no existe o el id no es válido
- **THEN** se rechaza
<!-- test: src/services/tramite-hitos.service.test.js › "un trámite inexistente no se marca" -->

#### Scenario: Permisos
- **WHEN** un asesor o alguien sin sesión marca o desmarca
- **THEN** se rechaza
<!-- test: src/routes/permisos-senas-documentos.routes.test.js › "cobro, entrega y transferencia son solo del admin" -->

### Requirement: La entrega puede llevar una foto
Una entrega MUST poder guardar una foto de nuestro almacenamiento, a nombre del cliente y del trámite.
Una foto de otro sitio MUST rechazarse. Los otros hitos MUST NOT guardar foto.
<!-- id: cierre.fotoEntrega -->

#### Scenario: Con foto
- **WHEN** se marca la entrega con una foto
- **THEN** queda a nombre del cliente y del trámite
<!-- test: src/services/tramite-hitos.service.test.js › "la entrega guarda la foto a nombre del cliente y del trámite" -->

#### Scenario: Foto opcional
- **WHEN** no hay foto, o el hito no es la entrega
- **THEN** no se guarda ninguna
<!-- test: src/services/tramite-hitos.service.test.js › "la foto es opcional, y solo se guarda en la entrega" -->

#### Scenario: Foto de otro sitio
- **WHEN** la foto no viene de nuestro almacenamiento
- **THEN** se rechaza sin guardar nada
<!-- test: src/services/tramite-hitos.service.test.js › "una foto de otro sitio se rechaza sin guardar nada" -->

### Requirement: Lo marcado por error se desmarca
Desmarcar MUST ser un borrado lógico. Desmarcar la entrega MUST sacar su foto de la galería. Deshacer
una venta MUST exigir antes desmarcar sus hitos.
<!-- id: cierre.desmarcarHito -->

#### Scenario: Desmarcar
- **WHEN** se desmarca un hito
- **THEN** se borra de forma lógica
<!-- test: src/services/tramite-hitos.service.test.js › "desmarcar borra el hito de forma lógica" -->

#### Scenario: Desmarcar la entrega
- **WHEN** se desmarca la entrega
- **THEN** su foto sale de la galería
<!-- test: src/services/tramite-hitos.service.test.js › "desmarcar la entrega saca su foto de la galería" -->

#### Scenario: Sin marcar
- **WHEN** el hito no está marcado
- **THEN** se rechaza
<!-- test: src/services/tramite-hitos.service.test.js › "desmarcar lo que no está marcado da 404" -->

#### Scenario: Deshacer la venta
- **WHEN** la venta tiene hitos marcados
- **THEN** no se deshace
<!-- test: src/services/tramite-venta.service.test.js › "no se deshace una venta con cobro, entrega o transferencia marcados" -->

### Requirement: El seguimiento sigue después de la venta
La tira MUST seguir con Cobrado, Entregado y Transferido, que MUST poder marcarse recién con la venta
hecha. MUST sugerir entregar antes de transferir sin obligar. Sin nada que cobrar en el acto, Cobrado
MUST NOT aparecer.
<!-- id: cierre.seguimiento -->

#### Scenario: Pasos de la venta
- **WHEN** se arma el seguimiento de una venta
- **THEN** después de Vendido siguen los tres hitos
<!-- test: src/lib/seguimiento-tramite.test.js › "venta al contado: boleto, firma, vendido, cobro, entrega y transferencia" -->

#### Scenario: Antes de vender
- **WHEN** la venta no está hecha
- **THEN** los hitos se ven pero no se pueden marcar
<!-- test: src/lib/seguimiento-tramite.test.js › "cobro, entrega y transferencia se pueden marcar recién con la venta hecha" -->

#### Scenario: Orden sugerido
- **WHEN** se transfirió sin haber entregado
- **THEN** queda hecho, y el próximo paso sigue siendo la entrega
<!-- test: src/lib/seguimiento-tramite.test.js › "sugiere entregar antes de transferir, sin obligar" -->

#### Scenario: Nada que cobrar
- **WHEN** paga la agencia, no hay diferencia o todo va en cuotas
- **THEN** no aparece Cobrado
<!-- test: src/lib/seguimiento-tramite.test.js › "sin nada que cobrar no aparece Cobrado" -->

#### Scenario: Datos en el legajo
- **WHEN** se pide el detalle del trámite
- **THEN** trae los hitos con su fecha y la foto
<!-- test: src/mappers/ingreso.mapper.test.js › "el detalle trae los hitos con su fecha y la foto de la entrega" -->

### Requirement: Un auto en trámite se vende desde su legajo
Un auto en un trámite de venta MUST NOT venderse ni reabrirse desde Vehículos. Un auto sin trámite
MUST seguir vendiéndose desde ahí.
<!-- id: cierre.ventaDesdeVehiculos -->

#### Scenario: Auto en trámite
- **WHEN** se marca vendido o se deshace la venta desde Vehículos
- **THEN** se rechaza sin escribir y remite al legajo
<!-- test: src/services/tramite-venta.service.test.js › "un auto en trámite no se vende ni se reabre desde Vehículos" -->

#### Scenario: Auto sin trámite
- **WHEN** se marca vendido un auto sin trámite
- **THEN** se vende
<!-- test: src/services/tramite-venta.service.test.js › "un auto sin trámite se sigue vendiendo desde Vehículos" -->
