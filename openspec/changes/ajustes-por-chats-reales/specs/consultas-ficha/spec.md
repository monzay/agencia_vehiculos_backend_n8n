## ADDED Requirements

### Requirement: El nombre del cliente en el panel
En la lista y en el detalle de Consultas, el nombre del cliente MUST ser el que dijo en esa consulta
(`sesiones.nombre_declarado`); si no dijo ninguno, el de la ficha; y si tampoco hay, "Sin nombre". Este
cambio MUST NOT tocar datos de producción.
<!-- id: consulta.mapper.nombreDe -->

#### Scenario: Consulta nueva sin nombre
- **WHEN** llega una consulta nueva de un número cuyo perfil dice "Mi Reina" y el cliente no dice su nombre
- **THEN** el panel muestra "Sin nombre"
<!-- test: FALTA -->

#### Scenario: El cliente dijo su nombre
- **WHEN** en la consulta el cliente dijo "soy Claudia"
- **THEN** el panel muestra "Claudia", aunque la ficha tenga otro nombre
<!-- test: FALTA -->

#### Scenario: Consulta vieja
- **WHEN** se abre una consulta que llegó antes de este cambio, con el nombre del perfil en la ficha
- **THEN** el panel sigue mostrando ese nombre
<!-- test: FALTA -->

#### Scenario: La consulta vieja no cambia si después dice otro nombre
- **WHEN** la ficha dice "Alvaro" (del perfil) y en una consulta nueva el cliente dice "soy Claudia"
- **THEN** la consulta nueva muestra "Claudia" y la vieja sigue mostrando "Alvaro"
<!-- test: FALTA -->

#### Scenario: Cliente viejo que vuelve sin decir su nombre
- **WHEN** un cliente cuya ficha tiene el nombre del perfil de antes de este cambio abre una consulta nueva y no dice su nombre
- **THEN** el panel muestra el nombre de la ficha (no se tocan datos de producción) y el bot igual no lo usa
<!-- test: FALTA -->

### Requirement: Fotos del usado en la consulta
En el detalle de una consulta, junto a los datos del usado, el panel MUST mostrar las fotos del usado que mandó
el cliente. Al abrir el detalle, el backend MUST firmar cada pathname con el Blob privado (URLs de 15 minutos,
como los papeles) y el panel MUST mostrarlas en miniatura, con la opción de verlas en grande. Sin fotos, o sin
store privado configurado, MUST NOT mostrarse nada ni fallar el detalle.
<!-- id: consulta.mapper -->

#### Scenario: Consulta con fotos del usado
- **WHEN** el asesor abre una consulta en la que el cliente mandó dos fotos de su Fox
- **THEN** ve las dos fotos junto a la marca, el modelo y el año del usado
<!-- test: FALTA -->

#### Scenario: Sin fotos
- **WHEN** el cliente no mandó fotos
- **THEN** el detalle se ve como hoy
<!-- test: FALTA -->

#### Scenario: Falla la firma
- **WHEN** el Blob privado no responde al firmar
- **THEN** el detalle se abre igual, sin las fotos
<!-- test: FALTA -->

#### Scenario: Venció la URL
- **WHEN** el detalle estuvo abierto más de 15 minutos y una miniatura ya no carga
- **THEN** al volver a abrir el detalle las fotos se firman de nuevo y se ven, como pasa con los papeles
<!-- test: FALTA -->
