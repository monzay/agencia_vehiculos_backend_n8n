## ADDED Requirements

### Requirement: El CUIL que informa la persona queda en la consulta
Con la verificación activa y el "sí" vigente del cliente, un CUIL válido MUST guardarse en
`sesiones.cuil_informado` aunque no coincida con la ficha: si el cliente lo corrige, el asesor
ve qué informó. El último informado reemplaza al anterior de esa consulta. Un CUIL inválido o
dado sin permiso MUST NOT guardarse. `clientes.cuil` no cambia con esto y la IA MUST NOT poder
escribir esta columna.
<!-- id: verificacion.verificarSituacion -->

#### Scenario: CUIL informado distinto al de la ficha
- **WHEN** el cliente da un CUIL válido que no coincide con el de su ficha
- **THEN** queda en la consulta, la ficha conserva el suyo y no se consulta al BCRA
<!-- test: src/credito/verificacion.test.js › "el CUIL que informa la persona queda en la consulta, aunque no coincida con la ficha" -->

#### Scenario: CUIL que no se guarda
- **WHEN** el CUIL es inválido, o el cliente no dio su permiso
- **THEN** la consulta no guarda nada
<!-- test: src/credito/verificacion.test.js › "un CUIL inválido o sin permiso no queda en la consulta" -->

### Requirement: El CUIL se ve entre los datos de la consulta
El detalle de la consulta MUST mostrar el CUIL informado y, si es distinto o no hay informado,
el de la ficha, con el formato `20-12345678-6`. Sin CUIL no se agrega ninguna fila.
<!-- id: consulta.construirRespuestas -->

#### Scenario: CUIL informado y CUIL de la ficha
- **WHEN** se arman los datos de una consulta
- **THEN** se ve el informado, y el de la ficha solo si es otro
<!-- test: src/mappers/consulta.mapper.test.js › "la consulta muestra el CUIL informado y el de la ficha solo si es distinto" -->

#### Scenario: El detalle lee el CUIL de la ficha
- **WHEN** el panel pide el detalle de una consulta cuyo cliente tiene CUIL en la ficha
- **THEN** ese CUIL aparece entre las respuestas
<!-- test: src/services/consultas.service.test.js › "el detalle muestra el CUIL de la ficha entre los datos de la consulta" -->

#### Scenario: Formato
- **WHEN** se muestra un CUIL de 11 dígitos
- **THEN** va con guiones; un valor que no tiene 11 dígitos se muestra tal cual
<!-- test: src/credito/cuil.test.js › "formatearCuil pone los guiones y deja igual lo que no tiene 11 dígitos" -->
