## ADDED Requirements

### Requirement: El código del auto que escribe la IA
Las herramientas que reciben el código de un auto MUST buscar primero el código exacto que mandó la IA y,
solo si no existe ningún auto con ese código, el código limpio: sin paréntesis, sin la palabra REF y sin
`#`, `.`, `:` ni espacios. La existencia MUST mirarse en todos los autos, borrados incluidos. Todo lo demás
MUST armarse con el código resuelto. El ref guardado y el mensaje de la web `(REF #x)` MUST NOT cambiar.
<!-- id: herramientas.refExistente -->

#### Scenario: Código con # o REF
- **WHEN** la IA manda `#13` o `REF #13` a `ver_auto`, `buscar_similares` o `enviar_fotos_auto`, y existe el auto `13`
- **THEN** la herramienta encuentra el auto `13` y el link de la ficha va con `13`
<!-- test: src/agente/herramientas.test.js › "ver_auto encuentra el auto aunque la IA mande el código con # o REF" -->
<!-- test: src/agente/herramientas.test.js › "enviar_fotos_auto encuentra el auto aunque la IA mande el código con #, y el link de la ficha va con el código limpio" -->
<!-- test: src/agente/herramientas.test.js › "buscar_similares encuentra la referencia aunque la IA mande el código con #" -->
<!-- test: src/agente/origen-web.test.js › "codigoDeAuto saca el código como lo escribe la IA: #13, REF #13, ref 13" -->

#### Scenario: El código exacto gana
- **WHEN** existe un auto con el código tal como lo mandó la IA
- **THEN** se usa ese, aunque el código limpio coincida con otro auto
<!-- test: src/agente/herramientas.test.js › "un código que existe tal cual se usa tal cual, aunque limpio coincida con otro auto" -->
<!-- test: src/agente/origen-web.test.js › "codigoDeAuto deja igual un código que ya está limpio, también alfanumérico" -->

#### Scenario: Texto que no es un código
- **WHEN** la IA manda un texto que no es un código, como "Onix LTZ"
- **THEN** no se limpia ni se adivina
<!-- test: src/agente/origen-web.test.js › "codigoDeAuto no toma textos que no son un código" -->

#### Scenario: Lo que piden los casilleros
- **WHEN** se arman los formularios para Claude
- **THEN** el código se pide sin `#` ni REF
<!-- test: src/agente/herramientas.test.js › "los códigos de auto se piden sin # ni REF" -->

### Requirement: Código inexistente no es lo mismo que no disponible
Si no existe ningún auto con el código, ni exacto ni limpio, `ver_auto`, `buscar_similares` y
`enviar_fotos_auto` MUST responder `codigo_inexistente: true` con un motivo que le pide a la IA no decir que
el auto no está disponible. Un auto que existe pero no se puede ofrecer MUST responder como hasta ahora,
sin esa marca.
<!-- id: herramientas.codigoInexistente -->

#### Scenario: ver_auto
- **WHEN** se consulta un código que no existe
- **THEN** responde que no lo encontró y marca `codigo_inexistente`; un auto pausado responde sin esa marca
<!-- test: src/agente/herramientas.test.js › "ver_auto distingue un código que no existe de un auto que no está a la venta" -->

#### Scenario: enviar_fotos_auto
- **WHEN** se piden fotos de un código que no existe
- **THEN** responde sin fotos y con `codigo_inexistente`; un auto no disponible sigue respondiendo "El auto no está disponible."
<!-- test: src/agente/herramientas.test.js › "enviar_fotos_auto distingue un código que no existe de un auto que no está disponible" -->

#### Scenario: buscar_similares
- **WHEN** se buscan parecidos a un código que no existe
- **THEN** responde que no lo encontró, con `codigo_inexistente`, y no busca parecidos
<!-- test: src/agente/herramientas.test.js › "buscar_similares avisa si el código no existe" -->

### Requirement: Registro de cada llamada a una herramienta
Cada llamada a una herramienta MUST dejar una línea en el log del backend con la herramienta, la sesión, lo
que pidió la IA y un resumen del resultado, también cuando los datos son inválidos. MUST NOT aparecer DNI,
CUIL, montos ni textos que dictó el cliente.
<!-- id: herramientas.registroDeLlamadas -->

#### Scenario: Llamada normal
- **WHEN** la IA usa una herramienta
- **THEN** queda una línea con la herramienta, la sesión, el valor de `ref`, `auto_ref`, `tipo`, `presupuesto_max`, `anio_desde` y `marca` (del resto de los casilleros, solo el nombre) y un resumen del resultado: encontrado, código inexistente, cantidad, códigos de los autos, disponibilidad, cantidad de fotos, registrado, aviso, derivado, avisado, verificado, bloqueado o error
<!-- test: src/agente/herramientas.test.js › "cada llamada a una herramienta deja una línea en el log con la herramienta, la sesión, el código y el resultado" -->

#### Scenario: Datos inválidos
- **WHEN** la IA manda datos inválidos
- **THEN** también queda la línea, con los casilleros pero sin sus valores
<!-- test: src/agente/herramientas.test.js › "un pedido con datos inválidos también queda en el log, sin los valores" -->

#### Scenario: Datos personales
- **WHEN** la herramienta recibe o devuelve DNI, CUIL, montos o textos del cliente
- **THEN** no aparecen en el log
<!-- test: src/agente/herramientas.test.js › "el log nunca muestra DNI, CUIL ni lo que dicta el cliente" -->

#### Scenario: El log falla
- **WHEN** escribir la línea del log falla
- **THEN** la herramienta responde igual: un fallo del log nunca corta la respuesta
<!-- test: src/agente/herramientas.test.js › "si escribir el log falla, la herramienta responde igual" -->
