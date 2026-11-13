## ADDED Requirements

### Requirement: Las imágenes de lista se guardan en franjas
La subida con destino `listas` MUST guardar cada imagen con hasta 2576 px de lado mayor y, además, cortada
en franjas horizontales que se solapan. Cada franja MUST enderezarse para que los renglones queden
horizontales y ampliarse. Las franjas MUST llamarse `listas/<huella>.f<número>.jpg`. Los PDF MUST guardarse
enteros, sin franjas.
<!-- id: franjas-lista.franjasDe -->

#### Scenario: Hoja torcida
- **WHEN** la imagen tiene los renglones inclinados
- **THEN** cada franja sale con los renglones horizontales
<!-- test: ../sea_automotores/lib/franjas-lista.test.js › "una hoja torcida queda con los renglones horizontales" -->

#### Scenario: Cobertura
- **WHEN** se corta una hoja en franjas
- **THEN** las franjas se solapan y entre todas cubren la hoja entera
<!-- test: ../sea_automotores/lib/franjas-lista.test.js › "las franjas se solapan y cubren toda la hoja" -->

#### Scenario: Imagen baja
- **WHEN** la imagen es más baja que una franja
- **THEN** sale en una sola franja
<!-- test: ../sea_automotores/lib/franjas-lista.test.js › "una imagen baja sale en una sola franja" -->

#### Scenario: Nombre de la franja
- **WHEN** se guarda una franja
- **THEN** su pathname es `listas/<huella>.f<número>.jpg`
<!-- test: ../sea_automotores/lib/archivo-lista.test.js › "la franja se llama como la huella y su número" -->

### Requirement: La lectura no inventa
La instrucción de lectura MUST pedir que cada fila se copie tal cual antes de separarla en campos, que un
dato que la lista no trae quede vacío, y que no se deduzca ningún dato: tampoco la marca a partir del
modelo. MUST pedir que no se completen filas cuando la numeración saltea un número y que el contenido del
archivo no se tome como instrucciones. El combustible MUST leerse solo si la fila lo dice.
<!-- id: lista-vehiculos.INSTRUCCION_LISTA -->

#### Scenario: Sin deducciones
- **WHEN** se arma la instrucción de lectura
- **THEN** pide copiar la fila tal cual, dejar vacío lo que no figura y no deducir la marca
<!-- test: src/lib/lista-vehiculos.test.js › "la instrucción de lectura pide copiar la fila y no deducir datos" -->
<!-- eval: backups/listas-prueba-2026-11 · la lectura de las dos listas reales no trae marcas ni combustibles que la hoja no dice -->

#### Scenario: Vacío no es dudoso
- **WHEN** la lectura devuelve vacío un dato que no marcó como dudoso
- **THEN** la fila no lo marca como dudoso
<!-- test: src/lib/lista-vehiculos.test.js › "lo que la lista no trae queda vacío y no es dudoso" -->

### Requirement: Cada duda muestra la fila original y el motivo
Cada fila leída MUST conservar el texto original de la fila y, si la lectura dudó, el motivo en palabras.
Una fila sin modelo legible MUST NOT descartarse: MUST quedar como duda con su texto original. Solo se
descarta una fila sin modelo y sin texto.
<!-- id: lista-vehiculos.normalizarFilas -->

#### Scenario: Texto y motivo
- **WHEN** la lectura trae el texto de la fila y una nota
- **THEN** la fila los conserva, recortados
<!-- test: src/lib/lista-vehiculos.test.js › "la fila conserva su texto original y el motivo de la duda" -->

#### Scenario: Fila sin modelo
- **WHEN** una fila no trae modelo pero sí su texto
- **THEN** queda como duda, con el texto a la vista
<!-- test: src/lib/lista-vehiculos.test.js › "una fila sin modelo queda como duda con su texto" -->

### Requirement: Las listas en miles se convierten
Si la lectura indica que los precios o los kms están en miles, el sistema MUST multiplicarlos por mil y la
respuesta MUST decirlo. Un precio menor a $100.000 en una lista que no está en miles MUST quedar vacío y
dudoso: no se convierte por las dudas.
<!-- id: lista-vehiculos.convertirMiles -->

#### Scenario: Lista en miles
- **WHEN** la lectura dice que precios y kms están en miles
- **THEN** 12.500 pasa a 12.500.000 pesos y 154 a 154.000 km
<!-- test: src/lib/lista-vehiculos.test.js › "una lista en miles se convierte a pesos y a kilómetros" -->

#### Scenario: Precio demasiado chico
- **WHEN** un precio es menor a $100.000 y la lista no está en miles
- **THEN** queda vacío y dudoso
<!-- test: src/lib/lista-vehiculos.test.js › "un precio demasiado chico no se convierte y queda dudoso" -->

### Requirement: La patente se controla por su forma
La patente leída MUST guardarse en mayúsculas y sin separadores. Si no tiene la forma de una patente
argentina (`AAA999` o `AA999AA`), MUST quedar vacía y dudosa.
<!-- id: lista-vehiculos.patenteDe -->

#### Scenario: Patente válida
- **WHEN** la lista trae `ac 337 ur`
- **THEN** queda `AC337UR`
<!-- test: src/lib/lista-vehiculos.test.js › "la patente queda en mayúsculas y sin espacios" -->

#### Scenario: Patente imposible
- **WHEN** la lectura trae `M5R501`
- **THEN** queda vacía y dudosa
<!-- test: src/lib/lista-vehiculos.test.js › "una patente que no tiene forma de patente queda dudosa" -->

### Requirement: Las franjas se empalman sin repetir filas
Las filas de las franjas de una misma hoja MUST unirse en orden. Una fila que sale en dos franjas MUST
quedar una sola vez. Dos lecturas son la misma fila si coinciden en número de fila, o en patente, o en
modelo, versión y año. Si las dos lecturas de la misma fila difieren en un dato, ese dato MUST quedar
dudoso con las dos lecturas en el motivo.
<!-- id: lista-vehiculos.empalmarFranjas -->

#### Scenario: Fila repetida
- **WHEN** la misma fila sale al final de una franja y al principio de la siguiente
- **THEN** queda una sola vez
<!-- test: src/lib/lista-vehiculos.test.js › "dos franjas que traen la misma fila la dejan una sola vez" -->

#### Scenario: Lecturas distintas
- **WHEN** dos franjas leen distinto un dato de la misma fila
- **THEN** ese dato queda dudoso y el motivo muestra las dos lecturas
<!-- test: src/lib/lista-vehiculos.test.js › "si dos franjas leen distinto la misma fila, el dato queda dudoso" -->

### Requirement: Cada hoja se lee por separado
La lectura MUST hacer un pedido a la IA por franja o por PDF, con `claude-haiku-5-5`, y MUST registrar el
consumo de cada pedido en `ia_consumos`. Cada franja MUST ir acompañada de la hoja entera, para ubicar las
columnas y la marca de cada grupo de filas. Si falla la lectura de un archivo, los demás MUST seguir y la
respuesta MUST decir qué archivo falló y por qué. Si fallan todos, MUST responder con el error.
<!-- id: importacion-vehiculos.leerListaVehiculos -->

#### Scenario: Una hoja falla
- **WHEN** falla la lectura de un archivo y los otros se leen
- **THEN** la respuesta trae las filas de los otros y nombra el que falló
<!-- test: src/services/importacion-vehiculos.test.js › "cada hoja se lee por separado y una que falla no tira las demás" -->

#### Scenario: Modelo y gasto
- **WHEN** se lee una lista
- **THEN** cada pedido usa `claude-haiku-5-5` y su consumo queda registrado
<!-- test: src/services/importacion-vehiculos.test.js › "la lectura usa Haiku 5.5 y registra su gasto" -->

#### Scenario: Hoja de contexto
- **WHEN** se lee una franja
- **THEN** el pedido lleva la hoja entera y después la franja
<!-- test: src/services/importacion-vehiculos.test.js › "cada franja se lee junto con la hoja entera" -->

#### Scenario: Modelo por llamada
- **WHEN** quien llama a la lectura indica modelo y esfuerzo
- **THEN** el pedido los usa, y sin indicarlos usa los de siempre
<!-- test: src/lib/vision-claude.test.js › "el modelo y el esfuerzo se eligen por llamada" -->

#### Scenario: Consumo
- **WHEN** la lectura termina
- **THEN** devuelve lo leído y el consumo del pedido
<!-- test: src/lib/vision-claude.test.js › "la lectura devuelve el consumo" -->

### Requirement: Lo que el cruce exacto no resuelve lo razona la IA
Las filas sin coincidencia exacta MUST mandarse a `claude-haiku-5-5` junto con los vehículos del stock sin
emparejar, para que responda por cada fila "mismo", "nuevo" o "duda", con el motivo. Su respuesta MUST
verificarse por código antes de usarse, y lo que no pase la verificación MUST quedar como duda. El consumo
MUST registrarse en `ia_consumos`.
<!-- id: cruce-vehiculos.verificarCruce -->

#### Scenario: Sin candidatos
- **WHEN** todas las filas se resolvieron con el cruce exacto, o el stock está vacío
- **THEN** no se llama a la IA
<!-- test: src/services/importacion-vehiculos.test.js › "sin filas por resolver no se llama a la IA para cruzar" -->

#### Scenario: Referencia inventada
- **WHEN** la IA responde con una referencia que no está en el stock
- **THEN** la fila queda como duda
<!-- test: src/lib/cruce-vehiculos.test.js › "una referencia que la IA inventa queda como duda" -->

#### Scenario: Otro año
- **WHEN** la IA une una fila con un vehículo de otro año
- **THEN** la fila queda como duda, con los dos años en el motivo
<!-- test: src/lib/cruce-vehiculos.test.js › "la IA no puede unir vehículos de distinto año" -->

#### Scenario: Dos filas, un vehículo
- **WHEN** dos filas apuntan al mismo vehículo del stock
- **THEN** las dos quedan como duda
<!-- test: src/lib/cruce-vehiculos.test.js › "dos filas no pueden apuntar al mismo vehículo" -->

#### Scenario: De punta a punta
- **WHEN** se cruza una lista leída
- **THEN** la respuesta trae cada fila con su estado y, si corresponde, el vehículo y sus cambios
<!-- test: src/services/importacion-vehiculos.test.js › "cruzar devuelve cada fila con su estado y el vehículo que le corresponde" -->

### Requirement: Qué cambia en un vehículo que ya existe
Para una fila unida a un vehículo del stock, el sistema MUST proponer: cada precio (lista, contado,
anticipo) que la lista trae y es distinto; y cada dato que el vehículo tiene vacío y la lista trae
(versión, kms, combustible, patente). Un dato ya cargado que difiere MUST NOT proponerse como cambio: se
informa como diferencia. Marca, modelo y año MUST NOT cambiarse nunca. Un dato que la lista no trae MUST
NOT cambiar nada.
<!-- id: cruce-vehiculos.cambiosDe -->

#### Scenario: Precio distinto
- **WHEN** la lista trae otro precio para un vehículo que ya existe
- **THEN** la fila queda como `cambia`, con el valor actual y el nuevo
<!-- test: src/lib/cruce-vehiculos.test.js › "un precio distinto queda como cambio de precio" -->

#### Scenario: Todo igual
- **WHEN** la lista trae los mismos precios y nada que completar
- **THEN** la fila queda como `sin_cambios`
<!-- test: src/lib/cruce-vehiculos.test.js › "los mismos precios quedan sin cambios" -->

#### Scenario: Dato vacío
- **WHEN** el vehículo no tiene patente o kms y la lista los trae
- **THEN** se propone completarlos
<!-- test: src/lib/cruce-vehiculos.test.js › "un dato vacío del vehículo se completa con el de la lista" -->

#### Scenario: Dato cargado
- **WHEN** el vehículo tiene kms o versión y la lista trae otros
- **THEN** no se propone el cambio y la diferencia queda informada
<!-- test: src/lib/cruce-vehiculos.test.js › "un dato ya cargado que difiere no se pisa" -->

#### Scenario: La lista no lo trae
- **WHEN** la lista no trae precio de contado
- **THEN** el precio de contado del vehículo no cambia
<!-- test: src/lib/cruce-vehiculos.test.js › "lo que la lista no trae no cambia nada" -->

### Requirement: Los cambios de precio dudosos no vienen tildados
Un cambio de más del 30 % en un precio, o un precio de contado mayor que el de lista, MUST marcarse con un
aviso y MUST NOT venir tildado.
<!-- id: cruce-vehiculos.avisosDePrecio -->

#### Scenario: Salto grande
- **WHEN** el precio nuevo difiere más del 30 % del actual
- **THEN** la fila lleva el aviso y no viene tildada
<!-- test: src/lib/cruce-vehiculos.test.js › "un cambio de más del 30 % no viene tildado" -->

#### Scenario: Contado mayor
- **WHEN** el precio de contado de la lista es mayor que el de lista
- **THEN** la fila lleva el aviso y no viene tildada
<!-- test: src/lib/cruce-vehiculos.test.js › "un contado mayor que el de lista queda avisado" -->

### Requirement: Importar edita solo lo confirmado del vehículo existente
Dentro de la misma transacción, importar MUST escribir en cada vehículo existente solo los campos
confirmados, de entre precio, precio al contado, anticipo, versión, kms, combustible y patente, validados
con las reglas del formulario. Un vehículo que ya no está como se mostró en la revisión MUST NOT
actualizarse. La respuesta MUST decir cuántos creó, cuántos actualizó y cuáles salteó, con el motivo.
<!-- id: importacion-vehiculos.actualizarExistentes -->

#### Scenario: Solo lo confirmado
- **WHEN** se confirma un cambio de precio
- **THEN** se escribe ese precio y ningún otro campo del vehículo
<!-- test: src/services/importacion-vehiculos.test.js › "importar actualiza solo los campos confirmados del vehículo existente" -->

#### Scenario: Campo no permitido
- **WHEN** el pedido trae marca, modelo, año, `disponible` u otro campo fuera de la lista
- **THEN** ese campo no se escribe
<!-- test: src/services/importacion-vehiculos.test.js › "importar no acepta campos fuera de la lista permitida" -->

#### Scenario: Cambió mientras se revisaba
- **WHEN** el precio actual del vehículo ya no es el que se mostró
- **THEN** no se actualiza y se informa
<!-- test: src/services/importacion-vehiculos.test.js › "si el vehículo cambió mientras se revisaba, no se actualiza y se avisa" -->

#### Scenario: Vendido o eliminado
- **WHEN** el vehículo se vendió o se eliminó
- **THEN** no se actualiza y se informa
<!-- test: src/services/importacion-vehiculos.test.js › "un vehículo vendido o eliminado no se actualiza" -->

#### Scenario: Pedido anterior
- **WHEN** el pedido trae `vehiculos` en lugar de `crear`
- **THEN** se crean como hasta ahora
<!-- test: src/services/importacion-vehiculos.test.js › "el pedido anterior con vehiculos sigue creando" -->

## MODIFIED Requirements

### Requirement: Solo se leen archivos que subió el panel
Leer o importar una lista MUST aceptar solo archivos del store privado con la forma `listas/<huella>.jpg`
o `listas/<huella>.pdf`, hasta 6 por lista y sin repetir. La huella MUST salir del nombre del archivo. Las
franjas MUST tener la forma `listas/<huella>.f<número>.jpg`, pertenecer a una imagen del mismo pedido y no
pasar de 12 por imagen. Cualquier otra cosa MUST rechazarse con un error 400, sin leer ni escribir.
<!-- id: lista-vehiculos.validarArchivosDeLista -->

#### Scenario: Archivo ajeno
- **WHEN** llega una URL, un pathname de otro prefijo o un nombre que no es una huella
- **THEN** se rechaza con un error 400
<!-- test: src/lib/lista-vehiculos.test.js › "un archivo que no subió el panel se rechaza" -->

#### Scenario: El mismo archivo dos veces
- **WHEN** el mismo archivo viene dos veces en el pedido
- **THEN** se rechaza con un error 400
<!-- test: src/lib/lista-vehiculos.test.js › "el mismo archivo dos veces en un pedido se rechaza" -->

#### Scenario: Huella
- **WHEN** llega un archivo válido
- **THEN** su huella es el nombre del archivo, y su tipo sale de la extensión
<!-- test: src/lib/lista-vehiculos.test.js › "la huella sale del nombre del archivo" -->

#### Scenario: Franja ajena
- **WHEN** llega una franja cuya huella no es la de una imagen del pedido
- **THEN** se rechaza con un error 400
<!-- test: src/lib/lista-vehiculos.test.js › "una franja que no es de un archivo del pedido se rechaza" -->

### Requirement: De la lista solo quedan los campos del formulario
De cada fila MUST quedar solo marca, modelo, versión, patente, año, kms, condición, tipo de vehículo,
combustible, precio, precio al contado y anticipo, más el texto original, los campos dudosos y el motivo.
Cualquier otro dato de la lista MUST descartarse. Un valor de tipo equivocado o fuera del rango de su
columna MUST quedar vacío y marcado como dudoso.
<!-- id: lista-vehiculos.normalizarFila -->

#### Scenario: Datos de más
- **WHEN** la IA devuelve color, precio de revista, transferencia u otros datos sin campo
- **THEN** no aparecen en la fila
<!-- test: src/lib/lista-vehiculos.test.js › "de la lista solo quedan los campos del formulario" -->

#### Scenario: Dato fuera de rango
- **WHEN** el año o los kms no son números válidos para su columna
- **THEN** quedan vacíos y la fila los marca como dudosos
<!-- test: src/lib/lista-vehiculos.test.js › "un dato fuera de rango queda vacío y marcado como dudoso" -->

### Requirement: Cada fila se compara con el stock
Cada fila MUST compararse con los vehículos vigentes y no vendidos. Una fila es el mismo vehículo, sin
consultar a la IA, si tiene la misma patente; o si tiene las mismas palabras de modelo y versión (sin
importar el orden, las mayúsculas ni las tildes) y el mismo año, y hay un solo vehículo así. Los kms MUST
contar solo cuando la fila los trae y el vehículo los tiene. Con más de un candidato MUST quedar como duda,
con los candidatos.
<!-- id: cruce-vehiculos.cruzarExacto -->

#### Scenario: Clave
- **WHEN** dos vehículos tienen las mismas palabras en otro orden, con otras mayúsculas o con tildes
- **THEN** su clave es la misma
<!-- test: src/lib/lista-vehiculos.test.js › "el orden de las palabras y las tildes no cambian la clave" -->

#### Scenario: Patente
- **WHEN** la fila y un vehículo del stock tienen la misma patente
- **THEN** es el mismo vehículo, aunque el nombre esté escrito distinto
<!-- test: src/lib/cruce-vehiculos.test.js › "la misma patente es el mismo vehículo" -->

#### Scenario: Modelo y año
- **WHEN** la fila coincide en modelo, versión y año con un solo vehículo
- **THEN** es el mismo vehículo
<!-- test: src/lib/cruce-vehiculos.test.js › "mismo modelo y año con un solo candidato es el mismo vehículo" -->

#### Scenario: Lista sin kms
- **WHEN** la fila no trae kms y el vehículo sí los tiene
- **THEN** los kms no impiden la coincidencia
<!-- test: src/lib/cruce-vehiculos.test.js › "los kms no cuentan si la lista no los trae" -->

#### Scenario: Dos candidatos
- **WHEN** dos vehículos del stock coinciden con la fila
- **THEN** la fila queda como duda, con los dos candidatos
<!-- test: src/lib/cruce-vehiculos.test.js › "dos candidatos iguales quedan como duda" -->

### Requirement: Estado de cada fila
Una fila MUST quedar `cambia` si es un vehículo del stock y hay algo que actualizar o completar,
`sin_cambios` si es un vehículo del stock y no hay nada que cambiar, `duda` si no se pudo decidir o le
falta el modelo, `repetido` si coincide con una fila anterior de la lista, y `nuevo` si no está en el
stock. `cambia`, `sin_cambios` y `duda` MUST indicar el vehículo o los candidatos. `duda` MUST llevar el
motivo.
<!-- id: cruce-vehiculos.clasificarFilas -->

#### Scenario: Repetido en la lista
- **WHEN** dos filas de la misma lista tienen la misma clave
- **THEN** la segunda queda como `repetido`
<!-- test: src/lib/cruce-vehiculos.test.js › "una fila igual a otra de la misma lista queda como repetida" -->

#### Scenario: Nuevo
- **WHEN** una fila no coincide con nada
- **THEN** queda como `nuevo`
<!-- test: src/lib/cruce-vehiculos.test.js › "un auto que no está en el stock queda como nuevo" -->

#### Scenario: Duda con motivo
- **WHEN** una fila queda como duda
- **THEN** lleva el motivo y el texto original
<!-- test: src/lib/cruce-vehiculos.test.js › "una duda lleva su motivo y el texto de la fila" -->

### Requirement: Importar crea solo lo que no está, sin publicar
Dentro de una transacción READ COMMITTED, importar MUST registrar la importación y sus huellas, volver a
comparar contra el stock, saltear lo que ya está cargado y crear el resto sin publicar, con referencias
consecutivas, con su patente si la tiene, y atado a la importación. MUST devolver cuántos vehículos creó y
cuántos salteó.
<!-- id: importacion-vehiculos.importarVehiculos -->

#### Scenario: Datos al momento
- **WHEN** se confirma una importación
- **THEN** la transacción ve lo confirmado por otras cargas hasta ese momento, no una foto del principio
<!-- test: src/services/importacion-vehiculos.test.js › "la importación compara contra lo confirmado al momento, no contra una foto vieja" -->

#### Scenario: Lo cargado se saltea
- **WHEN** entre las filas confirmadas hay una que ya está en el stock
- **THEN** se crean las otras y esa cuenta como salteada
<!-- test: src/services/importacion-vehiculos.test.js › "importar crea solo los autos que no están en el stock" -->

#### Scenario: Sin publicar
- **WHEN** se importan vehículos
- **THEN** entran sin publicar, con su versión y atados a la importación
<!-- test: src/services/importacion-vehiculos.test.js › "los autos importados entran sin publicar y atados a su importación" -->

#### Scenario: Con patente
- **WHEN** la fila confirmada trae patente
- **THEN** el vehículo nuevo la guarda
<!-- test: src/services/importacion-vehiculos.test.js › "los vehículos nuevos guardan la patente" -->

### Requirement: La propuesta arranca con lo nuevo tildado
En la propuesta, las filas `nuevo` y las filas `cambia` sin aviso MUST arrancar tildadas. Las filas
`cambia` con aviso, `repetido` y `duda` MUST arrancar sin tildar. Una fila `sin_cambios` MUST NOT poder
tildarse. Una `duda` MUST resolverse antes de aplicarla: se elige un vehículo del stock, "es nuevo" o no
hacer nada. El pedido de importación MUST separar lo que se crea de lo que se actualiza y llevar, por cada
vehículo a actualizar, solo los campos a cambiar y el valor que se mostró.
<!-- id: panel.vehiculos.importacion -->

#### Scenario: Tildado inicial
- **WHEN** llega la propuesta
- **THEN** están tildadas las filas nuevas y los cambios sin aviso, y nada más
<!-- test: ../sea_automotores/components/panel/secciones/vehiculos/importacion.test.js › "los nuevos y los cambios seguros arrancan tildados y los demás no" -->

#### Scenario: Duda sin resolver
- **WHEN** una duda no tiene elegida una salida
- **THEN** no entra en el pedido
<!-- test: ../sea_automotores/components/panel/secciones/vehiculos/importacion.test.js › "una duda no se aplica hasta resolverla" -->

#### Scenario: Fila incompleta
- **WHEN** una fila tildada para crear no tiene marca, modelo o un año válido
- **THEN** cuenta como incompleta y no se puede aplicar la lista hasta completarla
<!-- test: ../sea_automotores/components/panel/secciones/vehiculos/importacion.test.js › "una fila tildada sin marca o con un año fuera de rango cuenta como incompleta" -->

#### Scenario: Pedido
- **WHEN** se arma el pedido de importación
- **THEN** separa lo que se crea de lo que se actualiza, y cada actualización lleva solo sus cambios y el valor mostrado
<!-- test: ../sea_automotores/components/panel/secciones/vehiculos/importacion.test.js › "el pedido separa lo que se crea de lo que se actualiza" -->

#### Scenario: De punta a punta
- **WHEN** un administrador importa una lista con un auto nuevo y otro ya cargado con otro precio
- **THEN** se crea el nuevo sin publicar y se actualiza el precio del existente
<!-- test: ../sea_automotores/e2e/importar-lista.spec.mjs › "una lista con un precio nuevo actualiza el vehículo existente" -->
<!-- test: ../sea_automotores/e2e/importar-lista.spec.mjs › "la misma lista no se puede importar dos veces" -->
