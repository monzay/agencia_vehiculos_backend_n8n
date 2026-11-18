# Bitácora — ajustes-por-chats-reales

Qué se hizo en cada tarea, con qué commit y qué dijo Codex. La escribe Claude al cerrar cada tarea.

## Tarea 0. Ramas y punto de partida (2026-11-18)

- **Ramas:** `feat/ajustes-por-chats-reales` desde `main`.
  - Backend: `main` = `746c8e1`, lo mismo que producción.
  - Panel (`sea_automotores`): `main` = `75ad55f`.
- **Validación:** `openspec validate ajustes-por-chats-reales --strict` pasa.
- **Archivado de prueba** en una copia del scratchpad: + 12 requisitos nuevos, ~ 10 modificados, sin errores.
- **Plan:** aprobado por el user el 2026-11-18, después de 8 rondas de Codex (ver `REVISION-PLAN.md`).

## Tarea 1. Chats con Haiku 5.5 simulado y ronda 0 (2026-11-18, commit `41ad514`)

### Tests primero (Claude)

Son 132 tests en 8 archivos. 43 fallan antes del código, que es lo esperado.

**Archivos de tests:**
- `chats/leer.test.js`: guion `Modelo:` y `Modelo (herramienta):`, `Foto:`, `Perfil:` y controles nuevos. Los
  chats pasan a ser 39: los 25 de antes intactos y X1 a X14 con regla, controles y guion.
- `chats/correr.test.js`: perfil, fotos con un JPEG real, guion por turno con su etiqueta, desfase que corta
  el chat, e integración con el Claude simulado por turnos.
- `chats/controles.test.js`: presentación repetida, nombre del perfil, fotos con la pregunta, cantidad de
  pedidos de fotos y de nombre, y guardado de `nombre`, `fotos_usado` y `entrega_usado`.
- `chats/guardado.test.js`: `nombre` y `fotos_usado`.
- `chats/entorno.test.js`: `limitarFetch` ya no deja pasar a Anthropic, se vacían todas las claves,
  `verificarSinClaves` y `codigoDeSalida` (sin el contador de red, la corrida falla).
- `masivo/claude-falso.test.js`: `crearClaudeFalsoPorTurnos` (consume exacto por turno y avisa si sobra o
  falta).
- `masivo/red-precarga.test.js` (nuevo): la suite corre con la barrera, se bloquean `fetch` y socket a
  Anthropic, el contador suma y localhost anda.
- `scripts/simular-chats.test.js` (nuevo): el primer import es la barrera, no se crea el cliente real, las
  claves se verifican antes de preparar la base y se usa `codigoDeSalida`.

**Revisión de Codex:**
- **Ronda 1:** 9 hallazgos. No aplicaron 2: el test de claves ya incluía WhatsApp y Groq, y el lector no usa
  `select`. Se agregaron el contador de la barrera, `codigoDeSalida`, el orden de las claves, pedir el nombre
  2 veces con 1 esperado, el guardado de `entrega_usado`, los códigos viejos y la integración.
- **Ronda 2:** 2 hallazgos medios, los dos aplicaron. `codigoDeSalida({})` tiene que fallar, y el contador
  exige que cada intento haya sido bloqueado. Corregidos y tests congelados.

**Incidente menor:** la primera corrida de `red-precarga.test.js`, todavía sin la barrera, mandó un `fetch`
sin clave a `api.anthropic.com`. Anthropic lo rechaza sin consumir saldo. Desde entonces, sin la barrera esos
tests se saltean y no intentan conectarse.

### Código (Sonnet 5.5)

**Lo que hizo:**
- **Archivos nuevos:** `masivo/red-precarga.js` y `agente/jpeg-de-prueba.js` (un JPEG de 8x8).
- **`package.json`:** la suite corre con `--import` de la barrera.
- **Archivos modificados:** `claude-falso.js` (`crearClaudeFalsoPorTurnos`), `entorno.js`, `leer.js`, `controles.js`,
  `guardado.js`, `correr.js`, `scripts/simular-chats.js` y `chats-simulados.md` (con X1 a X14).
- **Decisiones suyas:**
  - en el script, la barrera se importa como `import * as` para que el test estático la vea primero;
  - los chats corren de a uno, porque el modelo por turnos tiene un solo guion abierto;
  - una línea `Modelo:` puede seguir en las líneas de abajo.

**Verificación de Claude:**
- Los tests no se tocaron: sus horas de modificación son anteriores a las del código.
- 156 de 156 en los archivos de la tarea, con la barrera.
- Sonnet informó la suite completa en 1792 de 1793: falla solo el test viejo de anclas de
  `importar-lista-por-etapas`, y ninguno por la barrera de red.

**Revisión de Codex del diff:** 5 hallazgos.
- **No aplicaron 4:**
  - Vaciar las claves antes de verificarlas es a propósito: el `.env` de desarrollo las trae, y la
    verificación confirma que no quedó ninguna.
  - `Perfil:` fuera de un chat no rompe: el lector ignora lo anterior al primer chat.
  - Las fotos en una ráfaga mixta son un caso real y andan.
  - Lo de los recordatorios en una espera larga no cambia nada, por el cupo de 24 h.
- **Aplicó 1:** el patrón de pedidos de fotos no reconocía "enviarme", "mandarme" ni "pasarme". Claude lo
  amplió y probó frases reales; "te paso las fotos del Vento" sigue sin contar. También aclaró el comentario
  de las claves.

### Ajustes de Claude a los chats

- **X14 reescrito:** el recordatorio permitido salía primero y gastaba el cupo de 24 h, así que nunca se
  probaba que el del BCRA no salga.
  - Ahora van primero los dos casos que no se recuerdan (permiso del BCRA y una oferta entre dos autos).
  - Después pasan 2 días y recién ahí "¿qué auto buscás?", que sí se recuerda.
- **Hallazgo de Sonnet que cambia el plan:** hoy cada foto sale de la ráfaga sin esperar y se responde por
  separado. Si el bot pide fotos y el cliente manda 3, contestaría 3 veces, con 3 mensajes pagos.
  - Se agregó a la tarea 7 que las fotos esperen y se junten como los textos, y se respondan una sola vez.
  - Se agregó el delta `specs/agente-entrada` (MODIFIED "Mensajes en ráfaga se responden una sola vez").
  - El guion de X12 ya espera una sola respuesta para las dos fotos.
- **Pendiente para la tarea 6:** con la regla nueva, `registrar_calificacion` devolvería "su nombre" como lo
  que falta en el mismo mensaje que confirma la visita. El user pidió que se pida en el mensaje siguiente,
  así que el nombre tiene que figurar solo si la visita ya estaba acordada antes de ese turno.

### Ronda 0 (bot actual)

Queda en `simulacion/ronda-0/`, que no se sube a git, igual que en los cambios anteriores.
- **Condiciones:** 0 intentos de conexión fuera de la máquina y costo de IA 0. Los 25 chats viejos se saltean
  porque no tienen guion.
- **Fallan 8 de 14, cada una con su tarea:**
  - X3 y X4, presentación repetida: tarea 3;
  - X5 y X6, opiniones sobre el crédito y "anotado": tarea 3;
  - X9 y X10, nombre: tarea 6;
  - X12, fotos juntas y guardadas: tarea 7;
  - X14, recordatorio del permiso del BCRA: tarea 8.
- **Pasan 6:** X1, X2, X7, X8, X11 y X13. Son reglas que dependen solo del texto del modelo, y con el
  modelo simulado ese texto lo pone el guion, así que no se pueden medir (límite ya anotado en el plan).

## Tareas 2, 3 y 4. Entrega mínima, limpiezas e instrucciones (2026-11-18)

Se hicieron en un solo ciclo, porque tocan los mismos archivos (`instrucciones.js`, `agente.js` y `atender.js`).

**Tests primero (Claude):**
- `instrucciones.test.js`:
  - el test viejo de las "tres cosas" se reemplazó por 3 de la respuesta A (con la frase, sin círculo y con el
    ejemplo);
  - 4 tests nuevos: otro auto de la web, frases que se leían mal, contestar la pregunta y no opinar sobre el
    crédito.
- `agente.test.js`: opiniones de crédito con frases reales, frase en la misma oración que la pregunta, y
  `sinPresentacionRepetida` (casos, nombre configurado, no deja el texto vacío, `yaEscribio`).
- `atender.test.js`: una sola presentación por consulta. El mensaje de un asesor humano no cuenta.
- **Codex:** 2 hallazgos medios, los dos aplicaron (la frase exacta "estás en buena posición" y el ejemplo de
  "¿cómo podría ser el resto?"). Tests congelados.

**Código (Sonnet 5.5):**
- **Instrucciones:** la respuesta A va en "Precios y datos del auto" y en el ejemplo. No opinar sobre el
  crédito, contestar la pregunta y otro auto de la web van en "Cómo llevar la charla". Las 5 frases van en "Cómo
  hablan los clientes".
- **`agente.js`:** `VALORACION` ampliada; `sinOraciones` conserva la pregunta que empieza con "¿";
  `sinPresentacionRepetida`, aplicada si `contexto.yaEscribio`.
- **`atender.js`:** `yaEscribio` en el contexto, calculado sobre el historial de la consulta en curso.

**Revisión de Codex del diff:** 5 hallazgos medios.
- **Aplicó 1:** el filtro de presentación cortaba oraciones que seguían ("Soy José, asesor de ventas y te
  cuento…" y "…asesor de ventas de Ortega."). Claude agregó un test con esos casos y Sonnet lo arregló: la
  presentación se quita solo si termina ahí (emoji, punto, "!" o fin de línea).
- **No aplicaron 4:**
  - Quedarse con lo que sigue al "¿": la oración termina en el "?", así que no arrastra texto posterior.
  - Falsos positivos de "lo podemos trabajar" y "queda cubierto": el bot no tiene usos neutrales de esas
    frases. Riesgo aceptado.
  - `yaEscribio` sobre consultas viejas: el historial ya se filtra desde `sesion_inicio`.
  - El ejemplo A pregunta el anticipo: la regla general manda preguntar lo primero que falte.

**Verificación:**
- 277 de 277 en los tres archivos, con la barrera de red.
- Ronda 1 con el modelo simulado y 0 intentos de red: X3, X4, X5 y X6 pasan a verde. Siguen fallando X9 y X10
  (tarea 6), X12 (tarea 7) y X14 (tarea 8).
- Sonnet informó la suite completa con 9 fallas: las 8 de los tests de la migración 086, que ya estaban escritos
  y la migración todavía no existe, más la vieja de anclas.

## Tareas 5 y 6. Migración 086 y el nombre lo dice el cliente (2026-11-18)

### Tests primero

**Tarea 5 (Claude):** `scripts/migracion-086.test.js`, con 9 tests.
- Estáticos: las 3 columnas condicionales, sin datos ni GRANT, comillas simples y el `schema.prisma`.
- Uno real: aplica la 086 dos veces sobre una base temporal local con `sql_mode` ANSI y compara las filas
  completas antes y después.
- **Codex:** aplicaron la comparación de filas completas y anotar que el test real se corre con
  `--env-file=.env` (con `npm test` se saltea, igual que el de la 084). No aplicaron dos: `CREATE TABLE LIKE`
  no copia las claves foráneas, y las comillas en comentarios ya se ignoran.

**Tarea 6 (Sonnet, con la especificación de Claude):**
- **Tests nuevos:** en `atender`, `calificacion`, `cierre`, `herramientas`, `instrucciones`, `consulta.mapper` y
  `nombre-dicho` (nuevo).
- **Tests viejos adaptados al cambio de comportamiento:**
  - la ficha ya no toma el nombre del perfil;
  - el contexto no trae el nombre de la ficha;
  - las consultas cerradas de los tests de despedida llevan `nombre_pedido_at`;
  - en el panel gana el nombre dicho.
- **Corte por el límite de uso:** el agente se cortó a la mitad y se retomó con su contexto cuando se renovó.
- **Codex:** 3 hallazgos medios.
  - El test de "¡Hola Ana!" usaba un nombre en la respuesta simulada; pasó a un saludo sin nombre.
  - Faltaba probar que el nombre lo escribe el usuario del backend y no `agente_ia`. Se agregó un test con un
    `dbAgente` que anota cualquier escritura.
  - El flujo completo "soy Claudia" antes de la visita no se agregó como test unitario: ya lo cubre X10 en el
    simulador.
- Tests congelados: 13 fallan en `atender`, 4 en `calificacion`, 1 en `cierre`, 8 en `herramientas`, 8 en
  `instrucciones` y 4 en `consulta.mapper`, y `nombre-dicho` no carga porque falta el módulo.

### Código (Sonnet 5.5)

Ver la sección siguiente.

**Lo que hizo Sonnet:**
- **Migración:** `086_nombre_y_fotos_del_usado.sql`, con el patrón de la 085. Las 3 columnas se agregan a
  `chat_estado` en `schema.prisma` y se corrió `prisma generate`. La 086 se aplicó SOLO en la base local
  (`localhost:3306/agencia`).
- **`nombre-dicho.js` (nuevo):**
  - `guardarNombreDicho`, que escribe con el usuario del backend;
  - `nombreDichoDelCliente`, que toma el nombre de esta consulta o de las anteriores;
  - `nombreSeguro`, movido desde `instrucciones.js`;
  - `pideElNombre`.
- **`atender.js`:**
  - la ficha ya no recibe el nombre del perfil;
  - el contexto usa el nombre dicho;
  - `pedirNombre` se calcula con la consulta como estaba al empezar el turno;
  - `nombre_pedido_at` se marca con la base raíz y solo si el texto que salió pidió el nombre;
  - el ctx suma `guardarNombre` y `nombreDicho`.
- **Otros archivos:**
  - `calificacion.js`: `pendientes(..., { pedirNombre })` y `correspondePedirNombre`;
  - `cierre.js`: `debeReaccionar` con `nombreDicho`;
  - `herramientas.js`: campo `nombre` en `registrar_calificacion`;
  - `consulta.mapper.js`: nombre dicho → ficha → vacío;
  - `recordatorio.js`: pasa `pedirNombre: false`, porque la visita acordada ya excluye el recordatorio.
- **Instrucciones:** nombre solo si lo dijo, pedirlo una vez, guardarlo con `nombre` y la pregunta de quién
  decide sin género ("¿Lo decidís por tu cuenta o lo consultás con alguien?").

**Decisión nueva durante la tarea:** después del pedido del nombre, si el cliente contesta "dale" o "gracias" sin
darlo, se reacciona con 👍 sin IA. Es lo que decidió el user: no insistir y no gastar mensajes.
- Sonnet lo había resuelto con una ventana de 1 segundo, que era frágil. Quedó la condición exacta: la última
  respuesta de la asesora es anterior o igual a `nombre_pedido_at` (+1 ms, la misma constante con la que se
  guarda la respuesta del turno).
- Se agregó a la spec (`agente-conversacion` › Despedidas con 👍, escenario "Después del pedido del nombre"), con
  2 tests nuevos (uno a 30 segundos de la marca) y el guion de X9 ajustado.

**Revisión de Codex del diff:** 2 hallazgos medios.
- **Aplicó 1:** `nombre_pedido_at` se marcaba aunque la IA no hubiera pedido el nombre. Ahora se marca solo si
  el texto final lo pide (`pideElNombre`), con un test nuevo.
- **No aplicó 1:** que un nombre con solo espacios tape uno más viejo no puede pasar, porque el nombre se guarda
  saneado.

**Verificación:**
- 492 de 492 en los 9 archivos de tests, con la barrera de red y el test real de la 086 con `--env-file=.env`.
- Sonnet informó la suite completa en 1877 de 1879: falla solo el de anclas viejo.
- Ronda 3 con 0 intentos de red: pasan 12 de 14, con X9 y X10 nuevas. Faltan X12 (tarea 7) y X14 (tarea 8).

## Tareas 7 y 8. Fotos del usado y recordatorio solo en las preguntas elegidas (2026-11-18)

### Tests primero (Sonnet, con la especificación de Claude)

**Tests nuevos:**
- En `herramientas`, `rafagas`, `atender`, `entorno`, `instrucciones`, `recordatorio`, `temas-preguntados` y
  `consultas.service`.
- `blob-privado.test.js` (nuevo): el modo simulado no toca el SDK; producción ignora `BLOB_SIMULADO`;
  `exigirBlobSimulado`.

**Tests viejos modificados:**
- "un mensaje con foto o audio no espera" pasa a ser solo de audio, porque la foto ahora espera.
- El regex del log de `registrar_calificacion` acepta campos extra en el resultado (`pedir_fotos_usado`).

**Revisión de Codex:** 11 hallazgos.
- **No aplicaron 4:**
  - el test "se subió pero falla la anotación" ya existía;
  - el reloj del recordatorio ya es fijo (`AHORA`);
  - los tiempos de la ráfaga siguen el mismo patrón estable de `rafagas.test.js`;
  - el test de compatibilidad sin callback es a propósito.
- **Aplicaron 5, agregados por Claude:**
  - log sin ningún dato del cliente (texto, nombre dicho, usado);
  - integración con las fotos ya pedidas, que no avisa ni marca de nuevo;
  - frases reales de marca, modelo y del BCRA ("¿Me confirmás si te queda bien que consultemos tu situación en
    el BCRA?", que salió como recordatorio en C49);
  - `exigirBlobSimulado` antes de `prepararBase` en el script;
  - `src/routes/blob-simulado.routes.test.js` (nuevo): la ruta local de las fotos simuladas existe solo fuera
    de producción y con `BLOB_SIMULADO=1`, nunca sale de su carpeta (también con `..` codificado) y da 404 si
    el archivo no existe.
- **Quedaron cubiertos indirectamente 2:** el tope de 3 fotos al modelo (test de `atender`) y el contexto
  aislado de `consultas.service`.

Tests congelados. Sin segunda ronda de Codex: lo agregado son casos puntuales de sus propios hallazgos.

### Código (Sonnet 5.5)

Ver la sección siguiente.

**Lo que hizo Sonnet:**
- **`herramientas.js`:** `pedir_fotos_usado` y `ctx.marcarFotosPedidas`, solo la primera vez.
- **`atender.js`:** `marcarFotosPedidas` y `guardarFotosUsado`, con la base raíz.
  - La subida corre a la par de la llamada a Claude y se espera dentro del turno.
  - Al modelo le llegan `imagenes.slice(-3)`.
- **`rafagas.js`:** la foto espera como un texto y `combinar` junta las fotos del lote. Las fotos de cada parte
  van en un `WeakMap`, para no perderlas si se descarta un repetido.
- **`blob-privado.js`:** `subirImagenPrivada`, `exigirBlobSimulado` y el modo simulado en
  `tmp/blob-simulado`. Producción ignora `BLOB_SIMULADO`, y la firma de papeles no cambió.
- **Archivos nuevos o tocados para el entorno local:**
  - `routes/blob-simulado.routes.js` (nuevo), montado en `app.js` en `/api/dev/blob-simulado` solo fuera de
    producción;
  - `.gitignore` suma `tmp/`.
- **Otros archivos:**
  - `temas-preguntados.js`: temas `auto`, `usado_datos`, `permiso` y `cuil`, fuera de `DEL_RECORRIDO`;
  - `recordatorio.js`: lista de permitidos y excluidos en `esPreguntaSinContestar`, y la línea "no vuelvas a
    pedir fotos";
  - `consultas.service.js`: `fotosUsado` firmadas en el detalle;
  - instrucciones de fotos;
  - el entorno y el script del simulador exigen el Blob simulado.

**Verificación de Claude:**
- Los tests no se tocaron: Claude los cambió por última vez a las 09:39 y el código es de las 09:42 en adelante.
- No hay caracteres de control en los 23 archivos tocados. Sonnet avisó que su herramienta los había metido en
  unas regex y que después lo corrigió; se revisaron a ojo.
- 547 de 547 en los 11 archivos.
- Ronda 4: 14 de 14 con 0 intentos de red. Las fotos simuladas quedan en `tmp/blob-simulado`, ignorado por git.

**Revisión de Codex del diff:** 6 hallazgos.
- **Aplicó 1:** `exigirBlobSimulado` también rechaza `NODE_ENV=production`. Claude escribió el test y Sonnet
  hizo el arreglo.
- **No aplicaron 5:**
  - Las dos carreras entre turnos de la misma consulta: los mensajes de un número se atienden de a uno y el
    guardado se espera dentro del turno.
  - Las fotos del mismo mensaje en que se piden no se guardan, como dice la spec ("después del pedido").
  - Los enlaces simbólicos en la carpeta simulada: es local, de desarrollo, y la maneja la app.
  - Los temas ya se clasifican pregunta por pregunta, y el bot hace una sola pregunta por mensaje.

## Tarea 9. Fotos del usado en el panel (2026-11-18, `sea_automotores` commit `568644a`)

- **Test primero (Claude):** `lib/fotos-usado.test.js`. Solo URLs http(s) de `fotosUsado`, en orden; nada de
  `javascript:`, `data:` ni vacíos. Sin fotos, una lista vacía.
- **Código (Sonnet):**
  - `lib/fotos-usado.js`;
  - `chat-consulta.jsx`: "Fotos del usado (N)" dentro de "Datos de la consulta", miniaturas de 64 px que se
    abren en otra pestaña, y un recuadro "Foto N no disponible" si la URL venció.
  - No había un visor reutilizable: `papel-vista.jsx` está atado a los ingresos y no hay un `Dialog` de shadcn.
- **Verificación en el navegador:** backend local con la barrera de red, sin claves, `BLOB_SIMULADO=1` y
  `RECORDATORIO_MINUTOS=0`; panel con `next dev`; capturas con Edge sin ventana por CDP.
  - Datos de prueba en la base local: cliente 2336 y consulta 2415, sin nombre y con 2 fotos. Se borraron al
    terminar, solo esos ids, igual que las fotos de `tmp/blob-simulado`.
  - **Encontrado:** las miniaturas no cargaban en desarrollo porque la CSP del panel tiene
    `img-src 'self' data: blob: https:` y las fotos simuladas vienen de `http://localhost:4000`. Se agregó el
    backend local a `img-src` solo fuera de producción; en producción la CSP queda igual. Con eso cargan las
    dos.
  - "Sin nombre" en la lista y en el detalle ✅. Las fotos aparecen junto a los datos del usado ✅.
  - El aviso "1 Issue" de Next es el de React sobre `eval` en desarrollo, que ya estaba antes: no es de este
    cambio.
  - El log del backend no tuvo ningún intento de conexión a APIs externas.
- **Codex:** aprobable, sin hallazgos.
- **Pruebas:** 3 de 3 en `fotos-usado.test.js`. Sonnet informó la suite del front en 29 de 29, `npm run build`
  sin errores y ESLint sin errores nuevos (`chat-consulta.jsx` ya tenía uno, `react-hooks/set-state-in-effect`).
