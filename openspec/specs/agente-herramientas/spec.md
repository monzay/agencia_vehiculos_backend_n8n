# agente-herramientas

> BORRADOR — extraído del código el 2026-10-30, pendiente de revisión del dueño.
> Fuente: src/agente/herramientas.js, src/agente/auto-publico.js, src/agente/db.js,
> prisma/migrations_manual/067_usuario_agente.sql.

## Purpose

Lo que el agente puede consultar y hacer. Cada herramienta es un formulario con
casilleros fijos: la IA solo pide que se ejecute, y el backend valida, ejecuta SU
consulta y devuelve un resultado acotado. `registrar_calificacion` está en
`agente-calificacion` y `avisar_administracion` en `agente-cobranza`.

## Requirements

### Requirement: Lista cerrada de herramientas
El sistema MUST ofrecerle al agente exactamente estas 11 herramientas: `buscar_autos`,
`buscar_similares`, `ver_auto`, `enviar_fotos_auto`, `mi_financiacion`, `horarios_atencion`,
`registrar_calificacion`, `registrar_consentimiento`, `verificar_situacion_crediticia`,
`derivar_a_vendedor` y `avisar_administracion`. MUST NOT existir herramientas para dar
descuentos, reservar autos ni ejecutar SQL. Todas MUST ser estrictas, salvo
`registrar_calificacion`. Las dos de crédito están en `agente-credito` (2026-11-01).
<!-- id: herramientas.HERRAMIENTAS -->

#### Scenario: Las herramientas disponibles
- **WHEN** se arman las herramientas para Claude
- **THEN** son 11, todas estrictas salvo `registrar_calificacion`
<!-- test: src/agente/herramientas.test.js › "hay 11 herramientas con formularios estrictos, salvo registrar_calificacion" -->

#### Scenario: Herramientas prohibidas
- **WHEN** se revisa la lista
- **THEN** no hay ninguna para descuentos, reservas ni SQL
<!-- test: src/agente/herramientas.test.js › "no existe ninguna herramienta para dar descuentos, reservar ni ejecutar SQL" -->

#### Scenario: Herramienta que no existe
- **WHEN** Claude pide una herramienta que no existe
- **THEN** recibe un error
<!-- test: src/agente/herramientas.test.js › "una herramienta que no existe devuelve error" -->

#### Scenario: Límite del modo estricto
- **WHEN** se suman los campos opcionales de las herramientas estrictas
- **THEN** no pasan de 16, el máximo que admite Claude
<!-- test: src/agente/herramientas.test.js › "el modo estricto de Claude admite hasta 16 campos que pueden ir vacíos, sumando las herramientas estrictas" -->

### Requirement: El backend valida todo lo que pide la IA
El sistema MUST validar cada pedido de herramienta en el backend, aunque Claude no vea los
límites (el modo estricto no los admite). MUST rechazar:
- casilleros que no existen;
- valores fuera de las opciones;
- textos libres con HTML o links, incluso sin `http`.

Un texto con SQL MUST usarse como dato, nunca como código. Lo que dicta el cliente MUST
guardarse en una sola línea. Si la base falla, MUST devolverse un error genérico, sin
detalles internos.
<!-- id: herramientas.ejecutarHerramienta -->

#### Scenario: Límites que Claude no ve
- **WHEN** se arman los formularios para Claude
- **THEN** no llevan los límites que el modo estricto no acepta, pero el backend los sigue validando
<!-- test: src/agente/herramientas.test.js › "los formularios para Claude no llevan límites que el modo estricto no acepta (los valida el backend)" -->
<!-- test: src/agente/herramientas.test.js › "aunque Claude no vea los límites, el backend los sigue validando" -->

#### Scenario: Casillero que no existe
- **WHEN** el pedido trae un casillero que no está en el formulario
- **THEN** se rechaza
<!-- test: src/agente/herramientas.test.js › "un casillero que no existe en el formulario se rechaza" -->

#### Scenario: Valor fuera de las opciones
- **WHEN** un casillero trae un valor que no está entre sus opciones
- **THEN** se rechaza
<!-- test: src/agente/herramientas.test.js › "un valor fuera de las opciones se rechaza" -->

#### Scenario: Texto con SQL
- **WHEN** un casillero trae texto con SQL
- **THEN** se usa como dato, nunca como código
<!-- test: src/agente/herramientas.test.js › "texto con SQL en un casillero se usa como dato, nunca como código" -->

#### Scenario: HTML o links en textos libres
- **WHEN** un texto libre trae HTML o un link, aunque sea sin `http`
- **THEN** se rechaza
<!-- test: src/agente/herramientas.test.js › "los textos libres rechazan HTML y links" -->
<!-- test: src/agente/herramientas.test.js › "los textos libres no aceptan links, ni siquiera sin http" -->

#### Scenario: Texto en varias líneas
- **WHEN** el cliente dicta un texto con saltos de línea
- **THEN** se guarda en una sola línea, para que no pueda armar renglones falsos en el contexto
<!-- test: src/agente/herramientas.test.js › "lo que dicta el cliente se guarda en una sola línea (no puede armar renglones falsos en el contexto)" -->

#### Scenario: Falla la base
- **WHEN** la base falla durante una herramienta
- **THEN** devuelve un error genérico sin detalles internos
<!-- test: src/agente/herramientas.test.js › "si la base falla, devuelve un error genérico sin detalles internos" -->

### Requirement: Cada cliente solo ve y toca lo suyo
El cliente y la consulta MUST venir del backend (identificados por el número de WhatsApp),
nunca de la IA. Ninguna herramienta MUST poder consultar ni modificar datos de otra persona.
<!-- id: herramientas.ctx -->

#### Scenario: mi_financiacion
- **WHEN** el agente usa `mi_financiacion`
- **THEN** consulta solo al cliente que escribe
<!-- test: src/agente/herramientas.test.js › "mi_financiacion consulta solo al cliente que escribe" -->

#### Scenario: registrar_calificacion
- **WHEN** el agente usa `registrar_calificacion`
- **THEN** actualiza solo la consulta del cliente que escribe
<!-- test: src/agente/herramientas.test.js › "registrar_calificacion actualiza solo la sesión del cliente y calcula la temperatura con las reglas" -->

### Requirement: El agente usa un usuario de base con permisos mínimos
Las herramientas MUST conectarse con `AGENTE_DATABASE_URL`: un usuario de MySQL que solo lee
las columnas que necesita y no tiene permiso sobre `costo` ni `precio_venta`. Si la variable
falta, el agente MUST fallar: nunca MUST usar el usuario del backend. El usuario MUST poder leer
todas las columnas de la ficha del auto, incluidas `version`, `stock`, `precio_contado`,
`anticipo` y `descripcion` (migración 083).
<!-- id: db.dbAgente -->

#### Scenario: Falta la variable
- **WHEN** `AGENTE_DATABASE_URL` no está configurada
- **THEN** el agente falla al conectarse, en vez de usar el usuario del backend
<!-- test: FALTA -->

#### Scenario: Columnas pedidas
- **WHEN** una herramienta busca autos
- **THEN** pide columnas explícitas, sin `costo` ni `precio_venta`
<!-- test: FALTA -->
<!-- observacion: lo protege el GRANT de la migración 067 en la base, pero ningún test lo verifica -->

#### Scenario: Lee toda la ficha
- **WHEN** el usuario del agente trae un auto con las columnas de la ficha
- **THEN** la base no le niega ninguna
<!-- test: src/agente/permisos-ficha.test.js › "el usuario del agente puede leer todas las columnas de la ficha" -->

### Requirement: La ficha pública del auto es una lista blanca
Lo que el agente ve de un auto MUST limitarse a: ref, marca, modelo, versión, año, km, tipo,
condición (0 km o usado), combustible, stock, precio de lista (`precio_lista`), precio final con
descuento, ahorro, descuento, precio al contado, anticipo, promociones vigentes, si tiene fotos y
disponibilidad; y, solo en `ver_auto`, la descripción. Lo que no está cargado MUST ir en `null`.
La descripción MUST ir en una sola línea y recortada a 600 caracteres. MUST NOT incluir el costo,
el precio de venta interno ni quién lo reservó.
<!-- id: auto-publico.autoPublico -->

#### Scenario: Sin datos internos
- **WHEN** se arma la ficha pública
- **THEN** nunca incluye el costo ni datos internos
<!-- test: src/agente/auto-publico.test.js › "la ficha pública nunca incluye el costo ni datos internos" -->
<!-- test: src/agente/herramientas.test.js › "buscar_autos devuelve la ficha pública, sin costo" -->

#### Scenario: Lo que necesita el cliente
- **WHEN** se arma la ficha pública
- **THEN** trae todo lo que necesita el cliente
<!-- test: src/agente/auto-publico.test.js › "la ficha pública trae lo que necesita el cliente" -->

#### Scenario: Datos de venta
- **WHEN** el auto tiene versión, stock, precio al contado y anticipo cargados
- **THEN** la ficha los trae, con el precio como `precio_lista`
<!-- test: src/agente/auto-publico.test.js › "la ficha del bot trae versión, stock, precio de lista, precio de contado y anticipo" -->

#### Scenario: Datos sin cargar
- **WHEN** el auto no tiene versión, precio al contado, anticipo ni descripción
- **THEN** esos datos van en `null`, nunca en 0 ni inventados
<!-- test: src/agente/auto-publico.test.js › "lo que no está cargado en el auto va en null" -->

#### Scenario: Descripción
- **WHEN** la descripción tiene saltos de línea o es muy larga
- **THEN** va en una línea y recortada a 600 caracteres
<!-- test: src/agente/auto-publico.test.js › "la descripción va en una línea y recortada" -->

#### Scenario: Reservado por una seña
- **WHEN** el auto está señado
- **THEN** figura como reservado, sin decir por quién
<!-- test: src/agente/auto-publico.test.js › "reservado por una seña, sin decir de quién" -->

### Requirement: Qué auto está disponible para ofrecer
Un auto MUST estar disponible solo si cumple todo esto:
- no está borrado ni vendido;
- está publicado;
- no tiene una consignación cerrada;
- no tiene una seña que lo reserve;
- no está en un trámite abierto;
- no está comprometido como parte de pago en un boleto abierto.

Si no cumple, su estado MUST ser `vendido`, `reservado` (seña, trámite o boleto) o
`no_disponible` (borrado, pausado o consignación cerrada).
<!-- id: auto-publico.whereDisponible -->
<!-- dueña-futura: vehiculos — también la usan el catálogo web, el panel y el boleto; la parte de la seña se citará de `senas` -->

#### Scenario: Disponible
- **WHEN** el auto está a la venta, sin seña ni trámite
- **THEN** está disponible
<!-- test: src/agente/auto-publico.test.js › "disponible: a la venta, sin seña ni trámite" -->

#### Scenario: Vendido
- **WHEN** el auto se vendió
- **THEN** su estado es vendido
<!-- test: src/agente/auto-publico.test.js › "vendido" -->

#### Scenario: En un trámite abierto
- **WHEN** el auto está en un trámite abierto
- **THEN** está reservado
<!-- test: src/agente/auto-publico.test.js › "reservado si está en un trámite abierto" -->

#### Scenario: Borrado, pausado o con consignación cerrada
- **WHEN** el auto está borrado, pausado o con la consignación cerrada
- **THEN** no está disponible
<!-- test: src/agente/auto-publico.test.js › "no disponible si está borrado, pausado o con la consignación cerrada" -->

#### Scenario: Parte de pago en un boleto abierto
- **WHEN** el auto está comprometido como parte de pago en un boleto abierto
- **THEN** está reservado
<!-- test: FALTA -->

### Requirement: Buscar autos
`buscar_autos` MUST devolver hasta 5 autos disponibles, filtrando por tipo, condición (0 km o
usado), marca, modelo o versión, combustible, año mínimo, año máximo, km máximo, presupuesto
máximo (contra el precio de lista) y presupuesto de contado (contra el precio al contado; si el
auto no lo tiene cargado, contra el de lista). Los filtros MUST combinarse sin pisarse. MUST
excluir siempre los vendidos, señados, en trámite y borrados. El tipo "auto" MUST incluir los
autos viejos que no tienen tipo cargado. Las búsquedas MUST NOT traer la descripción.
<!-- id: herramientas.buscar_autos -->

#### Scenario: Excluye los no disponibles
- **WHEN** se buscan autos
- **THEN** nunca vuelven vendidos, señados, en trámite ni borrados
<!-- test: src/agente/herramientas.test.js › "buscar_autos excluye siempre vendidos, señados, en trámite y borrados" -->

#### Scenario: Autos sin tipo cargado
- **WHEN** se buscan autos de tipo "auto"
- **THEN** se incluyen los que no tienen tipo cargado
<!-- test: src/agente/herramientas.test.js › "buscar autos de tipo auto incluye los que no tienen tipo cargado" -->

#### Scenario: Filtros nuevos
- **WHEN** se busca por condición, modelo, combustible, año máximo y km máximo
- **THEN** la consulta filtra por cada uno, y el modelo se busca en el modelo y en la versión
<!-- test: src/agente/herramientas.test.js › "buscar_autos filtra por condición, modelo, combustible, año máximo y km máximo" -->

#### Scenario: Nafta y GNC
- **WHEN** se busca por nafta o por GNC
- **THEN** también entran los autos que andan con los dos (`nafta_gnc`)
<!-- test: src/agente/herramientas.test.js › "buscar_autos por nafta o por GNC incluye los que andan con los dos" -->

#### Scenario: Presupuesto de contado
- **WHEN** se busca con presupuesto de contado
- **THEN** entran los autos con precio al contado hasta ese monto y los que no lo tienen cargado con precio de lista hasta ese monto
<!-- test: src/agente/herramientas.test.js › "buscar_autos con presupuesto de contado usa el precio de contado y, si no está cargado, el de lista" -->

#### Scenario: Filtros combinados
- **WHEN** se busca tipo "auto" junto con presupuesto de contado y modelo
- **THEN** ningún filtro pisa a otro
<!-- test: src/agente/herramientas.test.js › "buscar_autos combina el tipo auto con otros filtros sin pisarlos" -->

#### Scenario: Sin descripción
- **WHEN** se buscan autos
- **THEN** las fichas no traen la descripción
<!-- test: src/agente/herramientas.test.js › "buscar_autos no trae la descripción" -->

### Requirement: Ver un auto
`ver_auto` MUST mostrar la ficha pública de un auto por su código, con su descripción. Un auto
vendido MUST informarse como vendido, para ofrecer parecidos. Un auto pausado o sin publicar MUST
tratarse como inexistente.
<!-- id: herramientas.ver_auto -->

#### Scenario: Auto vendido
- **WHEN** se consulta un auto vendido
- **THEN** se informa que ya se vendió
<!-- test: src/agente/herramientas.test.js › "ver_auto informa si el auto ya se vendió" -->

#### Scenario: Auto pausado o sin publicar
- **WHEN** se consulta un auto pausado o sin publicar
- **THEN** no se muestra
<!-- test: src/agente/herramientas.test.js › "ver_auto no muestra autos pausados o sin publicar" -->

#### Scenario: Código que no existe
- **WHEN** se consulta un código que no existe
- **THEN** responde que no lo encontró
<!-- test: src/agente/herramientas.test.js › "ver_auto con un código que no existe" -->

#### Scenario: Con descripción
- **WHEN** se consulta un auto que tiene descripción
- **THEN** la ficha la trae
<!-- test: src/agente/herramientas.test.js › "ver_auto trae la descripción del auto" -->

### Requirement: Buscar autos parecidos
`buscar_similares` MUST devolver hasta 5 autos disponibles del mismo tipo, con precio dentro
de ±25 % del auto de referencia y sin incluirlo. Primero el más cercano en precio y, a igual
precio, en año. Un auto de referencia sin publicar MUST NOT servir como referencia.
<!-- id: herramientas.buscar_similares -->

#### Scenario: Parecidos
- **WHEN** se buscan parecidos a un auto
- **THEN** vuelven del mismo tipo, ±25 % de precio y sin el auto de referencia
<!-- test: src/agente/herramientas.test.js › "buscar_similares busca el mismo tipo, ±25% de precio y sin el auto de referencia" -->

#### Scenario: Referencia sin publicar
- **WHEN** el auto de referencia no está publicado
- **THEN** no se usa como referencia
<!-- test: src/agente/herramientas.test.js › "buscar_similares no usa como referencia un auto sin publicar" -->

### Requirement: Mandar fotos de un auto
`enviar_fotos_auto` MUST devolver hasta 4 fotos de un auto disponible, como direcciones
públicas completas, junto con el link a su ficha web para el botón "Ver todas las fotos".
Si el auto no está disponible o no tiene fotos, MUST decirlo.
<!-- id: herramientas.enviar_fotos_auto -->

#### Scenario: Auto con fotos
- **WHEN** se piden las fotos de un auto disponible
- **THEN** vuelven con dirección completa y con el link a la ficha web
<!-- test: src/agente/herramientas.test.js › "enviar_fotos_auto devuelve las fotos con dirección completa" -->
<!-- test: src/agente/herramientas.test.js › "enviar_fotos_auto devuelve el link a la ficha web, para el botón 'Ver todas las fotos'" -->
<!-- test: src/agente/auto-publico.test.js › "las fotos se devuelven como direcciones públicas completas" -->

#### Scenario: Auto sin fotos
- **WHEN** el auto no tiene fotos
- **THEN** devuelve una lista vacía
<!-- test: src/agente/auto-publico.test.js › "sin fotos devuelve una lista vacía" -->

### Requirement: Consultar la financiación propia
`mi_financiacion` MUST pedir los últimos 4 dígitos del DNI y compararlos con la ficha del
cliente que escribe. Cada intento MUST quedar registrado. Con 3 intentos fallidos en 24 horas,
MUST quedar bloqueada aunque después acierte. Verificado, MUST devolver por cada financiación
activa:
- cuotas totales, pagas y pendientes (un pago anulado no cuenta como pago);
- valor de la cuota y saldo;
- día de pago y próximo vencimiento.
<!-- id: herramientas.mi_financiacion -->

#### Scenario: El DNI no coincide
- **WHEN** los 4 dígitos no coinciden con el DNI de la ficha
- **THEN** no muestra nada y registra el intento fallido
<!-- test: src/agente/herramientas.test.js › "mi_financiacion no muestra nada si el DNI no coincide" -->
<!-- test: src/agente/herramientas.test.js › "mi_financiacion registra el intento fallido del cliente" -->

#### Scenario: Formato de los dígitos
- **WHEN** el cliente manda más o menos de 4 dígitos
- **THEN** se rechaza
<!-- test: src/agente/herramientas.test.js › "mi_financiacion exige exactamente 4 dígitos" -->

#### Scenario: Bloqueo
- **WHEN** ya hubo 3 intentos fallidos en 24 horas
- **THEN** queda bloqueada aunque acierte
<!-- test: src/agente/herramientas.test.js › "mi_financiacion se bloquea después de 3 intentos fallidos, aunque acierte" -->

#### Scenario: Cálculo
- **WHEN** el DNI coincide
- **THEN** calcula cuotas pagas, pendientes y saldo
<!-- test: src/agente/herramientas.test.js › "mi_financiacion calcula cuotas pagas, pendientes y saldo" -->

#### Scenario: Pago anulado
- **WHEN** una cuota tiene el pago anulado
- **THEN** no cuenta como paga
<!-- test: src/agente/herramientas.test.js › "mi_financiacion no cuenta como paga una cuota con el pago anulado" -->

### Requirement: Horarios de atención
`horarios_atencion` MUST devolver, día por día con su nombre, si la agencia abre y en qué
horario.
<!-- id: herramientas.horarios_atencion -->

#### Scenario: Días con su nombre
- **WHEN** se piden los horarios
- **THEN** cada día viene con su nombre
<!-- test: src/agente/herramientas.test.js › "horarios_atencion devuelve los días con su nombre" -->

### Requirement: Derivar a un vendedor
`derivar_a_vendedor` MUST marcar la consulta del cliente para un vendedor, con el motivo
(entre 3 y 120 caracteres, sin links) y el momento.
<!-- id: herramientas.derivar_a_vendedor -->

#### Scenario: Derivación
- **WHEN** el agente deriva
- **THEN** la consulta del cliente queda marcada
<!-- test: src/agente/herramientas.test.js › "derivar_a_vendedor marca la sesión del cliente" -->

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
