## ADDED Requirements

### Requirement: Solo se leen archivos que subió el panel
Leer o importar una lista MUST aceptar solo archivos del store privado con la forma `listas/<huella>.jpg`
o `listas/<huella>.pdf`, hasta 6 por lista y sin repetir. La huella MUST salir del nombre del archivo.
Cualquier otra cosa MUST rechazarse con un error 400, sin leer ni escribir.
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

### Requirement: El archivo guardado se llama como su huella
La subida con destino `listas` MUST aceptar PDF e imágenes y reconocer el PDF por su contenido. MUST
calcular el SHA-256 del archivo original, antes de cualquier recompresión, y guardar el archivo con esa
huella como nombre.
<!-- id: blob.upload.listas -->

#### Scenario: PDF por contenido
- **WHEN** se sube un archivo que empieza con `%PDF-`
- **THEN** se trata como PDF, aunque su nombre o su tipo digan otra cosa
<!-- test: ../sea_automotores/lib/archivo-lista.test.js › "un pdf se reconoce por su contenido, no por su extensión" -->

#### Scenario: Huella del original
- **WHEN** se calcula la huella de un archivo
- **THEN** es el SHA-256 en hexadecimal de sus bytes originales
<!-- test: ../sea_automotores/lib/archivo-lista.test.js › "la huella es el sha256 del archivo original" -->

#### Scenario: Nombre del archivo guardado
- **WHEN** se guarda un archivo de lista
- **THEN** su pathname es `listas/<huella>.<pdf|jpg>`
<!-- test: ../sea_automotores/lib/archivo-lista.test.js › "el archivo guardado se llama como su huella" -->

### Requirement: Una lista ya importada no se vuelve a leer ni a importar
Si la huella de algún archivo ya está registrada, leer la lista MUST rechazarse con un error 409 antes de
llamar a la IA, e importarla MUST rechazarse con un error 409 sin crear nada. El mensaje MUST decir cuándo
se importó y cuántos vehículos se crearon.
<!-- id: importacion-vehiculos.exigirHuellasNuevas -->

#### Scenario: Leerla otra vez
- **WHEN** se pide leer una lista con un archivo ya importado
- **THEN** se rechaza con un error 409 y la IA no se llama
<!-- test: src/services/importacion-vehiculos.test.js › "una lista ya importada se frena antes de leerla" -->

#### Scenario: Importarla otra vez
- **WHEN** se confirma una lista con un archivo ya importado
- **THEN** se rechaza con un error 409 y no se crea ningún vehículo
<!-- test: src/services/importacion-vehiculos.test.js › "importar la misma lista dos veces se rechaza" -->

#### Scenario: Dos confirmaciones a la vez
- **WHEN** otra importación registra la misma huella durante la transacción
- **THEN** la segunda se rechaza con un error 409 y no deja nada creado
<!-- test: src/services/importacion-vehiculos.test.js › "si otra importación registró la huella primero, se rechaza sin crear nada" -->

### Requirement: De la lista solo quedan los campos del formulario
De cada fila MUST quedar solo marca, modelo, versión, año, kms, condición, tipo de vehículo, combustible,
precio, precio al contado y anticipo. Cualquier otro dato MUST descartarse. Un valor de tipo equivocado o
fuera del rango de su columna MUST quedar vacío y marcado como dudoso. Una fila sin modelo MUST descartarse,
y la lectura MUST informar cuántas filas descartó.
<!-- id: lista-vehiculos.normalizarFilas -->

#### Scenario: Datos de más
- **WHEN** la IA devuelve color, dominio u otros datos que no son del formulario
- **THEN** no aparecen en la fila
<!-- test: src/lib/lista-vehiculos.test.js › "de la lista solo quedan los campos del formulario" -->

#### Scenario: Dato fuera de rango
- **WHEN** el año o los kms no son números válidos para su columna
- **THEN** quedan vacíos y la fila los marca como dudosos
<!-- test: src/lib/lista-vehiculos.test.js › "un dato fuera de rango queda vacío y marcado como dudoso" -->

#### Scenario: Fila sin modelo
- **WHEN** una fila no trae modelo
- **THEN** se descarta
<!-- test: src/lib/lista-vehiculos.test.js › "una fila sin modelo se descarta" -->

#### Scenario: Aviso de filas descartadas
- **WHEN** la lectura descarta filas
- **THEN** la respuesta dice cuántas
<!-- test: src/services/importacion-vehiculos.test.js › "leer la lista avisa cuántas filas no se pudieron leer" -->

### Requirement: Cada fila se compara con el stock
Cada fila MUST compararse con los vehículos vigentes y no vendidos. La clave de comparación MUST ser las
palabras de modelo y versión (sin importar el orden, las mayúsculas ni las tildes), el año y los kms.
<!-- id: lista-vehiculos.claveDeAuto -->

#### Scenario: Clave
- **WHEN** dos vehículos tienen las mismas palabras en otro orden, con otras mayúsculas o con tildes
- **THEN** su clave es la misma
<!-- test: src/lib/lista-vehiculos.test.js › "el orden de las palabras y las tildes no cambian la clave" -->

#### Scenario: Lectura completa
- **WHEN** se lee una lista
- **THEN** la respuesta trae cada fila con su estado, comparada contra el stock vigente y no vendido
<!-- test: src/services/importacion-vehiculos.test.js › "leer la lista devuelve cada fila con su estado" -->

### Requirement: Estado de cada fila
Una fila MUST quedar `ya_cargado` si su clave coincide con un vehículo del stock, `repetido` si coincide
con una fila anterior de la lista, `parecido` si comparte año y la primera palabra del modelo con un
vehículo del stock, y `nuevo` si no. `ya_cargado` y `parecido` MUST indicar con qué vehículo coinciden.
<!-- id: lista-vehiculos.clasificarFilas -->

#### Scenario: Ya cargado
- **WHEN** una fila tiene la misma clave que un vehículo del stock
- **THEN** queda como `ya_cargado`, con la ref de ese vehículo
<!-- test: src/lib/lista-vehiculos.test.js › "un auto igual al stock queda como ya cargado" -->

#### Scenario: Parecido
- **WHEN** una fila comparte año y modelo con un vehículo del stock pero tiene otros kms
- **THEN** queda como `parecido`, con la ref de ese vehículo
<!-- test: src/lib/lista-vehiculos.test.js › "un auto del mismo modelo y año con otros kms queda como parecido" -->

#### Scenario: Repetido en la lista
- **WHEN** dos filas de la misma lista tienen la misma clave
- **THEN** la segunda queda como `repetido`
<!-- test: src/lib/lista-vehiculos.test.js › "una fila igual a otra de la misma lista queda como repetida" -->

#### Scenario: Nuevo
- **WHEN** una fila no coincide con nada
- **THEN** queda como `nuevo`
<!-- test: src/lib/lista-vehiculos.test.js › "un auto que no está en el stock queda como nuevo" -->

### Requirement: La lectura acepta PDF e imágenes
La lectura MUST mandar cada PDF como documento y cada imagen como imagen, con URLs firmadas. Una
respuesta cortada por largo MUST dar un error que pida dividir la lista.
<!-- id: vision-claude.leerDocumento -->

#### Scenario: PDF e imágenes
- **WHEN** se lee una lista con un PDF y una imagen
- **THEN** el pedido lleva un bloque de documento y uno de imagen, antes de la instrucción
<!-- test: src/lib/vision-claude.test.js › "un pdf va como documento y una imagen como imagen" -->

#### Scenario: Respuesta cortada
- **WHEN** la respuesta termina por el límite de largo
- **THEN** el error pide dividir la lista en partes
<!-- test: src/lib/vision-claude.test.js › "una respuesta cortada por largo pide dividir la lista" -->

### Requirement: Cada fila se valida antes de escribir
Importar MUST validar cada fila con las mismas reglas que el alta de un vehículo, antes de escribir. Una
fila inválida MUST rechazar todo con un error 400 que nombre el vehículo (marca, modelo y año).
<!-- id: importacion-vehiculos.datosDeFila -->

#### Scenario: Fila inválida
- **WHEN** una fila tiene un año inválido
- **THEN** se rechaza con un error 400 que nombra el vehículo y no se crea nada
<!-- test: src/services/importacion-vehiculos.test.js › "una fila inválida no crea nada" -->

### Requirement: Importar crea solo lo que no está, sin publicar
Dentro de una transacción READ COMMITTED, importar MUST registrar la importación y sus huellas, volver a
comparar contra el stock, saltear lo que ya está cargado y crear el resto sin publicar, con referencias
consecutivas y atado a la importación. MUST devolver cuántos vehículos creó y cuántos salteó.
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

### Requirement: La propuesta arranca con lo nuevo tildado
En la propuesta, las filas `nuevo` MUST arrancar tildadas y las demás no. Una fila `ya_cargado` MUST NOT
poder tildarse. El pedido de importación MUST llevar solo los campos del formulario de las filas tildadas.
<!-- id: panel.vehiculos.importacion -->

#### Scenario: Tildado inicial
- **WHEN** llega la propuesta
- **THEN** solo las filas nuevas están tildadas
<!-- test: ../sea_automotores/components/panel/secciones/vehiculos/importacion.test.js › "las filas nuevas arrancan tildadas y las demás no" -->

#### Scenario: Fila incompleta
- **WHEN** una fila tildada no tiene marca, modelo o un año válido
- **THEN** cuenta como incompleta y no se puede crear la lista hasta completarla
<!-- test: ../sea_automotores/components/panel/secciones/vehiculos/importacion.test.js › "una fila tildada sin marca o con un año fuera de rango cuenta como incompleta" -->

#### Scenario: Ya cargado
- **WHEN** se intenta tildar una fila ya cargada
- **THEN** sigue sin tildar
<!-- test: ../sea_automotores/components/panel/secciones/vehiculos/importacion.test.js › "una fila ya cargada no se puede tildar" -->

#### Scenario: Pedido
- **WHEN** se arma el pedido de importación
- **THEN** lleva los campos del formulario de las filas tildadas y nada más
<!-- test: ../sea_automotores/components/panel/secciones/vehiculos/importacion.test.js › "el pedido de importación lleva solo los campos del formulario" -->

#### Scenario: De punta a punta
- **WHEN** un administrador importa una lista desde Vehículos
- **THEN** se crean los autos nuevos sin publicar, y la misma lista no se puede importar otra vez
<!-- test: ../sea_automotores/e2e/importar-lista.spec.mjs › "importar una lista crea los autos nuevos sin publicar" -->
<!-- test: ../sea_automotores/e2e/importar-lista.spec.mjs › "la misma lista no se puede importar dos veces" -->
