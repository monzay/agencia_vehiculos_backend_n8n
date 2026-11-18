# Tareas — ajustes-por-chats-reales

Cada tarea pasa por el loop de la fase 2:
1. Tests primero, que revisa Codex.
2. Los tests se congelan.
3. Código.
4. Tests, lint y build.
5. Codex revisa el diff.
6. Commit y `BITACORA.md`.

Los escenarios con `<!-- test: FALTA -->` se cierran con el nombre exacto del test que escribe la tarea.

**Quién hace qué:** el código lo escribe Sonnet 5.5. Claude escribe los tests de aceptación de cada regla,
revisa el diff y verifica.

**Ramas:** se trabaja en `feat/ajustes-por-chats-reales`, desde `main`, en el backend y en el panel
(`sea_automotores`).

**Regla del user (OBJETIVO › Ajustes, 2026-11-18): ninguna API real, nada de producción.** Todos los tests y
simulaciones corren en desarrollo:
- **Sin APIs que gastan:** nunca se llama a la API de Claude (Anthropic), WhatsApp (Graph API), Groq, BCRA ni
  Vercel Blob.
- **Haiku 5.5 simulado:** el modelo que responde al cliente es un doble que actúa como Haiku 5.5. Es
  `crearClaudeFalso` de `src/agente/simulador/masivo/claude-falso.js`: devuelve, con el mismo formato que la
  API (texto y llamadas a herramientas), las respuestas de un guion escrito para cada chat.
- **Los otros servicios también simulados:** BCRA, transcripción de audio, envío de WhatsApp y Blob privado
  solo anotan lo que se les pide.
- **Red cortada:** la barrera de `red.js`, que solo deja conectar a la máquina local, se precarga antes de
  importar cualquier código del backend:
  - en toda la suite de tests, con `node --import` en el script de tests de `package.json`, así ningún test,
    de punta a punta o no, puede salir de la máquina;
  - en cada script de simulación, como lo primero que hace.

  Los procesos arrancan sin `ANTHROPIC_API_KEY`, `WA_TOKEN`, `GROQ_API_KEY` ni `BLOB_DOCUMENTOS_TOKEN`. La tarea
  1 agrega la precarga a la suite y un test que comprueba que un intento de conexión externa falla.
- **Comprobación:** el resumen de cada corrida informa los intentos de conexión fuera de la máquina, y tienen
  que ser 0. Si hay uno solo, la corrida falla.
- **Bases:** los tests con base pasan por `src/lib/base-local.js` y los chats simulados usan
  `agencia_simulacion`. Ninguna prueba toca ni lee la base de producción (Aiven), su Blob ni su servidor.

**Qué se puede medir así y qué no:**
- **Sí:**
  - que cada regla esté escrita en las instrucciones (tests `test:`);
  - todo el circuito del código con el modelo simulado: contexto, herramientas, guardado, limpiezas,
    recordatorio, nombre y fotos.
- **Cómo se prueban las limpiezas:** el guion le hace decir al modelo simulado los errores reales de
  producción ("Soy José" repetido, "Monotributo no es impedimento", "Perfecto, anotado 👍 ¿…?"), y se
  comprueba que el código los limpia.
- **No:** si el Haiku real obedece las reglas nuevas que dependen solo de las instrucciones (la respuesta de
  la entrega mínima, las frases que leía mal). Eso queda fuera de este cambio (ver tarea 11).

## Chats nuevos del simulador

Salen de las conversaciones reales del 16 y 17/11, sin nombres ni teléfonos reales y con CUIL ficticios.

| Chat | De dónde sale | Qué mide |
|---|---|---|
| X1 | C43, C44 | "¿Cuánto es el mínimo anticipo?" / "¿con 4 millones?": respuesta A, sin círculo ni "si alcanza" |
| X2 | C50 | Pregunta dos veces con cuánto se retira |
| X3 | C50 | Segundo link un minuto después y "y esta disculpe" |
| X4 | C58 | Dos links, "Sinanciado" y "tengo a mi padre que es empleado municipal" |
| X5 | C54 | "Monotributo… ya pregunté en varios lugares" |
| X6 | C55 | "Trabajo de Uber" y "tengo los 7 millones" a la pregunta del usado |
| X7 | C49 | "Entregando 5 millones, ¿cómo podría ser el resto?" |
| X8 | C52 | "No me lo pueden enviar por este medio" |
| X9 | nuevo | Acuerda la visita, "ok gracias" → pide el nombre una vez; si no contesta, no insiste |
| X10 | C56 | Dice "soy Claudia" antes → no se le pide después de la visita |
| X11 | C9 | Perfil "Mi Reina" → nunca la llama por un nombre |
| X12 | nuevo | "Tengo un Fox 2017 para entregar" → pide fotos y sigue; manda 2 fotos → gracias, sin opinar |
| X13 | nuevo | "Tengo una moto para entregar" → pide fotos, y marca, modelo y año; no contesta → el recordatorio retoma marca, modelo y año sin mencionar las fotos; después no insiste con las fotos |
| X14 | C2, C48, C49 | Recordatorio solo en las preguntas elegidas: sale con "¿qué auto buscás?" sin contestar; no sale con el permiso del BCRA ni con "¿Te quedás con el Voyage o con la Bora?" |


## Tareas

- [ ] 0. Ramas y punto de partida
  - Qué:
    - Crear `feat/ajustes-por-chats-reales` desde `main` en el backend y en `sea_automotores`.
    - Correr `openspec validate ajustes-por-chats-reales --strict`.
    - Probar `openspec archive` en una copia en el scratchpad, para ver que los MODIFIED aplican sobre las
      specs actuales aunque haya cambios sin archivar.
  - Criterio: la validación pasa y el archive de prueba deja las specs con los requisitos nuevos, sin
    errores.

- [ ] 1. Chats nuevos con Haiku 5.5 simulado y ronda 0 (medición antes de cambiar)
  - Qué:
    - **Script sin API:** `scripts/simular-chats.js` deja de crear el cliente real de Anthropic.
      - **Barrera de red:** hoy usa `limitarFetch` de `chats/entorno.js`, que deja pasar a Anthropic a
        propósito. Se reemplaza por el corte de `red.js` (solo la máquina local, a nivel de socket), que se
        instala lo primero, antes de importar el código del backend. `limitarFetch` deja de permitir
        cualquier host externo.
      - **Sin claves:** si el proceso tiene alguna de las claves (`ANTHROPIC_API_KEY`, `WA_TOKEN`,
        `GROQ_API_KEY`, `BLOB_DOCUMENTOS_TOKEN`), el script aborta antes de hacer nada.
      - **El modelo:** usa el Claude simulado con el guion de cada chat.
      - **Guion por mensaje del cliente:** cada mensaje del cliente lleva la lista de llamadas al modelo de ese
        turno, en orden (por ejemplo, `registrar_calificacion` y después el texto). El doble se adapta para que,
        si el código hace más o menos llamadas que las del guion en un turno, el chat falle con el número de
        paso, en vez de desfasarse.
      - El resumen informa los intentos de conexión fuera de la máquina.
    - **Chats nuevos:** agregar X1 a X14 a `src/agente/simulador/chats/chats-simulados.md`.
      - **Guion del modelo:** cada mensaje del cliente lleva lo que contesta el Haiku simulado: texto y, si
        corresponde, llamadas a herramientas (`registrar_calificacion`, `enviar_fotos_auto`…).
      - **Errores reales en el guion:** donde el chat real falló, el guion repite lo que dijo el Haiku en
        producción ("Soy José" repetido, "Monotributo no es impedimento", "Perfecto, anotado 👍 ¿…?"), para
        medir que el código lo limpia.
      - **Fotos:** paso nuevo `Foto: <descripción>`. El script manda una imagen JPEG chica generada en el
        momento, como si fuera una foto de WhatsApp.
      - **Perfil de WhatsApp:** el chat puede fijar el nombre del perfil (`Perfil: Mi Reina`).
    - **Chats viejos:** los 25 que ya existen (E, K, P, R, N) fueron escritos para el Haiku real, sin guion, así
      que no se corren en este cambio. Lo que ya anda queda cubierto por la suite de tests.
    - **Controles nuevos:**
      - no hay "Soy José" después del primer mensaje;
      - no aparecen las frases de crédito prohibidas;
      - no se nombra al cliente si no dijo su nombre;
      - el pedido de fotos va en el mismo mensaje que la pregunta que sigue;
      - las fotos y el nombre se piden a lo sumo una vez;
      - el recordatorio sale solo en las preguntas elegidas;
      - lo que quedó guardado: `nombre_declarado`, `fotos_usado` y `entrega_usado`.
    - **Ronda 0:** correr X1 a X14 contra el bot de hoy (el commit de `main` del que sale la rama). La base
      `agencia_simulacion` se arma de cero antes de la corrida. Con el modelo simulado la corrida es
      determinista: alcanza con una.
  - Criterio:
    - **Lector** (`leer.test.js`): los tests entienden el guion del modelo, el paso `Foto:` y el `Perfil:`, y
      un paso mal escrito falla nombrando la línea.
    - **Controles** (`controles.test.js`): cada control nuevo se prueba sobre una transcripción fija, con un
      caso que pasa y uno que falla.
    - **Lo guardado** (`guardado.test.js`): se lee `nombre_declarado`, `fotos_usado_json` y `entrega_usado` de
      la base de simulación.
    - **Sin red:** la suite de tests corre con la barrera precargada. Un test comprueba que el script falla si encuentra una clave de API en el proceso. Otro
      comprueba que, con la barrera puesta, un intento de conectar a `api.anthropic.com` (por `fetch` y por
      socket) se bloquea y hace fallar la corrida.
    - **Guion:** un test comprueba que un turno con una llamada a herramienta y un texto consume exactamente
      esas dos respuestas, y que un turno con una llamada de más falla nombrando el paso.
    - **Ronda 0:** `simulacion/ronda-0/` queda guardada con la transcripción, los resultados, el commit, la
      fecha y 0 intentos de conexión fuera de la máquina. Los controles de X1 a X14 que dependen del código
      nuevo fallan: eso confirma que miden los errores de producción.

- [ ] 2. Entrega mínima
  - Qué: en `instrucciones.js`, la regla del anticipo en `null` y su ejemplo pasan a la respuesta A: "No hay
    un monto fijo: depende de la situación de cada cliente, y el asesor te lo calcula en la agencia con tus
    datos". Después sigue con lo primero que falta. Se saca "para decírtela necesito…".
  - Criterio: escenarios de `agente-comportamiento` › Entrega mínima sin cargar y › La entrega mínima sigue
    con el recorrido.

- [ ] 3. Limpieza final del texto
  - Qué: en `agente.js`:
    - **Opiniones de crédito:** el filtro de valoraciones suma "no es impedimento", "sirve para financiar",
      "queda cubierto", "lo podemos trabajar" y "estás en buena posición".
    - **Parte de una oración:** si la frase a quitar comparte oración con una pregunta, se quita solo la frase
      (vale también para "anotado").
    - **Presentación repetida:** filtro nuevo que la quita si la asesora ya escribió en la consulta. El dato
      lo pasa `atender.js`, que ya tiene el historial.
  - Criterio: escenarios de `agente-conversacion` › Limpieza final del texto.

- [ ] 4. Instrucciones: otro auto, frases y crédito
  - Qué: en `instrucciones.js`:
    - **Otro auto de la web en la misma charla:** sin presentación, el precio del nuevo y la pregunta que
      faltaba; "¿y esta?" se aplica al auto nuevo.
    - **Cómo hablan los clientes:** "Sinanciado", "recién" por "reciben", "por este medio", "el resto" y
      contestar con plata a la pregunta del usado.
    - **No opina sobre si puede financiar:** con ejemplos de monotributo, Uber, independiente y garante.
  - Criterio: escenarios de `agente-comportamiento` › Otro auto de la web en la misma charla, › Frases de los
    clientes que se leían mal y › No opina sobre los datos del cliente.

- [ ] 5. Migración 086
  - Qué: `prisma/migrations_manual/086_nombre_y_fotos_del_usado.sql` agrega a `sesiones`:
    - `nombre_pedido_at DATETIME NULL`;
    - `fotos_usado_pedidas_at DATETIME NULL`;
    - `fotos_usado_json JSON NULL`, con los pathnames del Blob privado.

    Se refleja en `schema.prisma`, y no toca filas existentes.
  - Criterio:
    - `scripts/migracion-086.test.js` aplica la migración en una base local con el `sql_mode` de producción
      (ANSI), comprueba las columnas y que las filas existentes no cambian.
    - Se puede aplicar dos veces sin error.

- [ ] 6. El nombre lo dice el cliente (backend)
  - Qué:
    - **Ficha:** `resolverCliente` ya no guarda el nombre del perfil.
    - **Guardar:** `registrar_calificacion` acepta `nombre`, lo guarda saneado en
      `sesiones.nombre_declarado` y completa la ficha solo si está vacía.
    - **Contexto:** `contextoDelTurno` pasa el último nombre dicho (de esta consulta o de una anterior) y
      nunca el de la ficha.
    - **Lo que falta:** `pendientes` agrega "su nombre" después de la visita acordada, y se marca
      `nombre_pedido_at` al responder con eso.
    - **👍 automático:** `cierre.debeReaccionar` no reacciona si falta pedir el nombre.
    - **Instrucciones:** usar solo un nombre dicho, pedirlo una vez con una pregunta corta, y "¿Decidís por tu
      cuenta o lo consultás con alguien?" sin género.
    - **Panel:** `consulta.mapper.nombreDe` usa el orden dicho → ficha → vacío (el panel ya muestra "Sin
      nombre").
  - Criterio: escenarios de:
    - `agente-conversacion` › Una persona, una ficha, › Despedidas con 👍 y › El nombre del cliente en el
      contexto;
    - `agente-calificacion` › El nombre después de la visita y › Guardar el nombre que dijo el cliente;
    - `agente-comportamiento` › El nombre lo dice el cliente y › Defensa contra manipulación;
    - `consultas-ficha` › El nombre del cliente en el panel.

- [ ] 7. Fotos del usado (backend)
  - Qué:
    - **El pedido:** `registrar_calificacion` avisa que hay que pedir fotos la primera vez que se guarda
      `entrega_usado: true` y marca `fotos_usado_pedidas_at`.
    - **Instrucciones:** pedido de fotos sin pregunta, en el mismo mensaje que la pregunta que sigue. Cuando
      llegan, gracias sin opinar.
    - **Fotos juntas, una sola respuesta** (agregado en la fase 2, ver BITACORA › Tarea 1):
      - `rafagas.js` deja de despachar enseguida los mensajes con foto: esperan como un texto y se juntan con
        los que lleguen. El audio sigue saliendo ya.
      - `combinar` junta las fotos de todo el lote. Al modelo le llegan hasta 3, las últimas, y para guardar
        quedan todas.
      - Criterio: escenarios de `agente-entrada` › Mensajes en ráfaga se responden una sola vez.
    - **Guardar:** `atender.js` ya recibe cada foto validada: JPEG, PNG, GIF o WEBP, hasta ~5 MB y hasta 3 por
      mensaje, en base64 con su tipo.
      - En las 24 horas siguientes a `fotos_usado_pedidas_at`, las sube al Blob privado, hasta completar 10
        guardadas por consulta. Las que no entran, o llegan después, no se guardan.
      - `blob-privado.js` suma `subirImagenPrivada(buffer, tipo, pathname)` con el `put` de `@vercel/blob` y
        el `BLOB_DOCUMENTOS_TOKEN`. El pathname es `consultas/<id de la consulta>/usado/<uuid>.<ext>`, sin datos
        del cliente.
      - Primero se sube y después se anota el pathname en `fotos_usado_json`. Si la anotación falla, el
        archivo queda suelto en el store privado y solo se registra en el log.
      - Nada de esto frena la respuesta al cliente.
    - **Blob simulado en desarrollo:** con `BLOB_SIMULADO=1` y fuera de producción, `blob-privado.js` guarda
      las fotos en una carpeta local y firma con una URL del backend local, en una ruta que solo existe fuera
      de producción. Lo usan los tests, el simulador y la prueba del panel, para no tocar ningún store de
      Vercel. En producción la variable se ignora.
      - **Falla cerrado:** los tests, el simulador y el backend local de la prueba del panel (tarea 9) exigen
        `BLOB_SIMULADO=1` y la ausencia de `BLOB_DOCUMENTOS_TOKEN`; si no se cumple, abortan antes de subir o
        firmar nada.
      - **Criterio extra:** un test comprueba que, en modo simulado, las fotos quedan solo en la carpeta local
        y no se llama a ninguna función de `@vercel/blob`: ni `put`, ni `issueSignedToken`, ni
        `presignUrl`.
    - **Panel:** el mapper firma los pathnames al armar el detalle.
    - **Recordatorio:** la línea de sistema pide no retomar las fotos.
  - Criterio: escenarios de:
    - `agente-calificacion` › El pedido de fotos del usado;
    - `agente-conversacion` › Las fotos del usado quedan guardadas;
    - `agente-comportamiento` › Fotos del usado y › El usado se ve en la agencia;
    - `agente-recordatorio` › Qué dice el recordatorio;
    - `consultas-ficha` › Fotos del usado en la consulta (la parte del backend).

- [ ] 8. Recordatorio solo en las preguntas elegidas
  - Qué:
    - **Temas nuevos en `TEMAS` de `temas-preguntados.js`:**
      - `auto`: "¿qué auto (o modelo) buscás / estás buscando / te interesa?" y "¿tenés alguno en mente?";
      - `usado_datos`: la marca, el modelo o el año del vehículo que entrega ("¿Qué marca, modelo y año
        es?", "¿De qué año es el Fox?"). Hoy no lo reconoce ningún tema, porque `usado` solo mira "usado" y
        "parte de pago";
      - `permiso` (BCRA, Central de Deudores, "me autorizás") y `cuil`, para dejarlos afuera de forma
        explícita.
    - **Dónde se aplica la lista:** `esPreguntaSinContestar` de `recordatorio.js` deja de aceptar cualquier
      pregunta (`cierre.pregunta`). Pasa a aceptar solo si `temasPreguntados(último mensaje)` tiene al menos un
      tema permitido (`auto`, `pago`, `anticipo`, `recibo`, `usado`, `usado_datos`, `decisor`, `visita`) y
      ninguno excluido (`permiso`, `cuil`, `usado_precio`). Así, `consultasParaRecordar` no incluye la
      consulta.
    - **Todo lo demás no sale:** permiso, CUIL, cuánto pide, ofertas y preguntas que no se reconocen.
    - Lo demás del recordatorio no cambia: 10 a 60 minutos, uno por consulta cada 24 horas, y las mismas
      consultas excluidas.
  - Criterio:
    - Escenarios de `agente-recordatorio` › Cuándo corresponde el recordatorio y › Qué preguntas se
      recuerdan.
    - Tests de `temasPreguntados` con los textos exactos de los chats reales:
      - "¿Qué auto estás buscando?" y "¿Qué marca, modelo y año es?" (X13) dan temas permitidos;
      - "¿Me autorizás a hacer esa consulta?", "¿Cuánto pedís por él?" y "¿Te quedás con el Voyage o con la
        Bora?" (X14) no.

- [ ] 9. Fotos del usado en el panel (`sea_automotores`)
  - Qué:
    - En el detalle de la consulta (`components/panel/secciones/chat-consulta.jsx`), junto a los datos del
      usado, se muestran las miniaturas que vienen firmadas, con vista en grande. Sin fotos no cambia nada.
    - Comprobar que la lista y el detalle muestran "Sin nombre" cuando el nombre viene vacío.
  - Criterio:
    - Escenarios de `consultas-ficha`.
    - `npm run build` y ESLint sin errores nuevos.
    - Verificación en el navegador contra el backend local, con una consulta de prueba con 2 fotos y otra sin
      nombre, cargadas directo en la base local.
      - El backend local arranca con `BLOB_SIMULADO=1` y sin `ANTHROPIC_API_KEY`, `WA_TOKEN`, `GROQ_API_KEY`
        ni `BLOB_DOCUMENTOS_TOKEN`, así que tampoco corre el recordatorio contra WhatsApp.
      - Nada de esto toca producción.

- [ ] 10. Rondas de chats con Haiku 5.5 simulado y Codex (hasta 4)
  - Qué: correr X1 a X14 con el modelo simulado y la red cortada. Codex juzga cada ronda; Claude verifica cada
    hallazgo contra la transcripción y corrige.
  - Criterio:
    - Los controles automáticos de X1 a X14 pasan.
    - 0 intentos de conexión fuera de la máquina en todas las rondas.
    - La suite completa de tests pasa, salvo el test de anclas viejo de `importar-lista-por-etapas`, que ya
      fallaba antes de este cambio.
    - Codex no deja hallazgos altos sin resolver.
    - La comparación con la ronda 0 queda escrita en `simulacion/`.

- [ ] 11. Cierre
  - Qué:
    - **`DOCUMENTO-FINAL.md`:** qué cambió, la comparación antes y después, y los pasos de deploy:
      - respaldo de la base de producción;
      - la 086 antes del backend;
      - verificar `BLOB_DOCUMENTOS_TOKEN` en `backend.env` de producción;
      - el front después del backend.
    - **`BITACORA.md`:** completa.
    - **Bóveda:** resumen en "BOT CON RAZONAMIENTO" (sección 13) y registro en "Plan de mejora del bot".
    - **Fuera de este cambio:** medir si el Haiku real cumple las reglas que dependen solo de las
      instrucciones requiere leer conversaciones de producción. No es parte del cierre ni un criterio. Si el
      user lo pide más adelante, se hace como el 17/11: exportación de solo lectura y comparación con el
      diagnóstico de ese día.
  - Criterio:
    - El user revisa el documento final y el PR.
    - Nada se sube a producción sin su orden.
