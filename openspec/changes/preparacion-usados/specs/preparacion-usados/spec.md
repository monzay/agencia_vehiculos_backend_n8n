## ADDED Requirements

### Requirement: El usado entra a Preparación con la firma del boleto
Firmar el boleto de una compra o de una parte de pago con usado MUST crear su preparación, o reactivarla.
Una venta sin usado MUST NOT crearla. Desfirmar MUST sacarla si nunca tuvo ficha, y MUST rechazarse si la tuvo.
<!-- id: preparacion.entrada -->

#### Scenario: Compra o parte de pago con usado
- **WHEN** se firma el boleto
- **THEN** el usado entra a Preparación
<!-- test: src/services/preparaciones.service.test.js › "firmar una compra o una parte de pago con usado lo manda a preparación" -->

#### Scenario: Sin usado
- **WHEN** se firma una venta al contado o una parte de pago sin usado
- **THEN** no se crea nada
<!-- test: src/services/preparaciones.service.test.js › "sin usado no hay nada que preparar" -->

#### Scenario: Desfirmar sin ficha
- **WHEN** se desfirma y nunca tuvo ficha
- **THEN** sale de Preparación
<!-- test: src/services/preparaciones.service.test.js › "desfirmar la saca de preparación si nunca tuvo ficha" -->

#### Scenario: Desfirmar con ficha
- **WHEN** se desfirma y ya tuvo ficha en la web
- **THEN** se rechaza
<!-- test: src/services/preparaciones.service.test.js › "con ficha en la web no se puede desfirmar" -->

#### Scenario: Sin preparación
- **WHEN** se desfirma y no hay preparación vigente
- **THEN** no hace nada
<!-- test: src/services/preparaciones.service.test.js › "desfirmar sin preparación no hace nada" -->

### Requirement: Publicar exige papeles, foto y precio
MUST exigir título, Formulario 08 e informe de dominio sin prenda, embargo, inhibición ni denuncia de robo,
al menos una foto y precio de venta. Un papel MUST contar solo si la agencia lo tiene, no venció y es de ese auto.
<!-- id: preparacion.requisitos -->

#### Scenario: Todo cargado
- **WHEN** se cumple todo
- **THEN** se puede publicar
<!-- test: src/lib/requisitos-preparacion.test.js › "con todo cargado se puede publicar" -->

#### Scenario: Falta todo
- **WHEN** no hay papeles, foto ni precio
- **THEN** no se puede publicar, y figura cada uno
<!-- test: src/lib/requisitos-preparacion.test.js › "sin papeles, foto ni precio no se puede publicar" -->

#### Scenario: Papel que no está
- **WHEN** la agencia no tiene el papel
- **THEN** no cuenta
<!-- test: src/lib/requisitos-preparacion.test.js › "un papel que la agencia no tiene no cuenta" -->

#### Scenario: Informe con gravamen
- **WHEN** el informe tiene prenda, embargo, inhibición o denuncia de robo
- **THEN** no cuenta
<!-- test: src/lib/requisitos-preparacion.test.js › "el informe de dominio no puede tener prenda, embargo, inhibición ni denuncia de robo" -->

#### Scenario: Informe vencido o ajeno
- **WHEN** el informe venció o es de otro auto
- **THEN** no cuenta
<!-- test: src/lib/requisitos-preparacion.test.js › "un informe vencido o de otro auto no cuenta" -->

#### Scenario: Publicar sin cumplir
- **WHEN** se publica sin cumplir los requisitos
- **THEN** se rechaza sin escribir y dice qué falta
<!-- test: src/services/preparaciones.service.test.js › "sin cumplir los requisitos no se publica, y dice qué falta" -->

#### Scenario: Publicar con prenda
- **WHEN** se publica con prenda en el informe
- **THEN** se rechaza sin escribir
<!-- test: src/services/preparaciones.service.test.js › "con prenda en el informe no se publica" -->

### Requirement: Publicar crea la ficha del catálogo
Publicar MUST crear la ficha con los datos del título y `costo` igual al valor de toma del boleto. Volver a
publicar MUST reusar la ficha sin pisar sus fotos ni su costo. Si la ficha se borró, MUST crear otra.
<!-- id: preparacion.publicar -->

#### Scenario: Primera vez
- **WHEN** se publica por primera vez
- **THEN** se crea la ficha
<!-- test: src/services/preparaciones.service.test.js › "publicar crea la ficha con los datos del título y el costo del boleto" -->

#### Scenario: Volver a publicar
- **WHEN** ya tuvo ficha
- **THEN** se reusa
<!-- test: src/services/preparaciones.service.test.js › "volver a publicar reusa la ficha, sin pisar sus fotos ni su costo" -->

#### Scenario: Ya publicado o vendido
- **WHEN** ya está en la web o vendido
- **THEN** se rechaza
<!-- test: src/services/preparaciones.service.test.js › "ya publicado o vendido no se vuelve a publicar" -->

#### Scenario: Ficha borrada
- **WHEN** la ficha se borró en Vehículos
- **THEN** se crea otra
<!-- test: src/services/preparaciones.service.test.js › "si la ficha se borró en Vehículos, publicar crea otra" -->

### Requirement: Sacar de la web conserva la ficha
MUST apagar la ficha sin borrarla. MUST rechazarse si no está publicado, o si el auto está vendido, señado o en un trámite.
<!-- id: preparacion.despublicar -->

#### Scenario: Sacar
- **WHEN** se saca de la web
- **THEN** la ficha queda apagada
<!-- test: src/services/preparaciones.service.test.js › "despublicar saca el auto de la web y conserva la ficha" -->

#### Scenario: Enlace directo
- **WHEN** alguien abre por enlace directo un auto sacado de la web
- **THEN** no lo encuentra
<!-- test: src/services/vehiculos.catalogo.test.js › "un auto sacado de la web tampoco se abre por enlace directo" -->

#### Scenario: Con alguien esperándolo
- **WHEN** no está publicado, o está vendido, señado o en un trámite
- **THEN** se rechaza sin escribir
<!-- test: src/services/preparaciones.service.test.js › "no se despublica lo que no está publicado, ni un auto vendido, señado o en trámite" -->

### Requirement: La etapa no contradice a la web
Publicado y Vendido MUST salir de la ficha. Sin ficha vigente o apagada, MUST valer el avance interno.
La lista MUST filtrar por etapa y MUST NOT traer trámites borrados. Los días MUST dejar de contar al publicar.
<!-- id: preparacion.etapa -->

#### Scenario: Etapa
- **WHEN** se calcula la etapa
- **THEN** sale de la ficha, y si no tiene, del avance
<!-- test: src/lib/requisitos-preparacion.test.js › "la etapa sale de la ficha del catálogo, y si no tiene, del avance" -->

#### Scenario: Lista
- **WHEN** se filtra la lista por etapa
- **THEN** aplica el filtro y excluye los trámites borrados
<!-- test: src/services/preparaciones.service.test.js › "la lista filtra por etapa y no trae trámites borrados" -->

#### Scenario: Días
- **WHEN** todavía no se publicó
- **THEN** informa los días
<!-- test: src/services/preparaciones.service.test.js › "los días cuentan hasta que se publica" -->

#### Scenario: Inexistente
- **WHEN** la preparación no existe o el id no es válido
- **THEN** da 404
<!-- test: src/services/preparaciones.service.test.js › "una preparación inexistente da 404" -->

### Requirement: Antes de publicar se edita en Preparación
MUST poder editarse el avance, el precio y la descripción, con validación. En la web, MUST editarse en Vehículos.
<!-- id: preparacion.edicion -->

#### Scenario: Editar
- **WHEN** se editan los datos
- **THEN** se guardan
<!-- test: src/services/preparaciones.service.test.js › "se editan el avance, el precio y la descripción" -->

#### Scenario: Valores inválidos
- **WHEN** el avance o el precio no son válidos
- **THEN** se rechaza sin escribir
<!-- test: src/services/preparaciones.service.test.js › "un avance o precio inválido se rechaza" -->

#### Scenario: Ya en la web
- **WHEN** ya salió a la web
- **THEN** se rechaza y remite a Vehículos
<!-- test: src/services/preparaciones.service.test.js › "publicado o vendido, se edita en Vehículos" -->

### Requirement: El asesor lee sin datos reservados
El valor de toma y el titular MUST llegar solo al admin. Editar, publicar y sacar de la web MUST ser solo del admin.
<!-- id: preparacion.permisos -->

#### Scenario: Datos
- **WHEN** un asesor pide la ficha
- **THEN** no recibe el valor de toma ni el titular
<!-- test: src/services/preparaciones.service.test.js › "el admin ve el valor de toma y el titular; el asesor no" -->

#### Scenario: Rutas
- **WHEN** un asesor escribe, o alguien sin sesión lee
- **THEN** se rechaza
<!-- test: src/routes/permisos-senas-documentos.routes.test.js › "en Preparación el asesor lee, y escribe solo el admin" -->

### Requirement: La compra sigue hasta vender el usado
El seguimiento de una compra MUST seguir con Publicado y Vendido. Vender el usado MUST cerrar la compra, y
deshacer la venta MUST reabrirla. El legajo MUST traer la preparación vigente.
<!-- id: preparacion.compra -->

#### Scenario: Seguimiento
- **WHEN** se arma el seguimiento de una compra
- **THEN** sigue con la publicación y la venta del usado
<!-- test: src/lib/seguimiento-tramite.test.js › "compra de la agencia: papeles, boleto, firma, publicación y venta del usado" -->

#### Scenario: Venta del usado
- **WHEN** se vende o se deshace la venta del usado
- **THEN** la compra se cierra o se reabre
<!-- test: src/services/preparaciones.service.test.js › "vender el usado cierra la compra, y deshacerlo la reabre" -->

#### Scenario: Legajo
- **WHEN** se pide el detalle del trámite
- **THEN** trae la preparación, salvo que se haya quitado
<!-- test: src/mappers/ingreso.mapper.test.js › "el detalle trae la preparación del usado, salvo que se haya quitado" -->
