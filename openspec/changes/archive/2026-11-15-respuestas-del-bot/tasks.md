# Tareas — respuestas-del-bot

Cada tarea pasa por el loop de la fase 2: tests primero (los revisa Codex) → se congelan → código → tests,
lint y build → Codex revisa el diff → commit + `BITACORA.md`. Los escenarios con `<!-- test: FALTA -->`
se cierran con el nombre exacto del test que escribe la tarea.

El código lo escribe Sonnet 5.5; Claude escribe los tests de aceptación de cada regla, revisa el diff y
verifica. Se trabaja en la rama `feat/respuestas-del-bot`, desde `main`.

**Todas las pruebas son locales.** Los tests con base pasan por `src/lib/base-local.js`. Los chats
simulados usan su propia base, `agencia_simulacion`, con Claude Haiku 5.5 real, BCRA simulado y sin enviar
nada a WhatsApp. Ninguna prueba toca ni lee la base ni el servidor de producción.

Las rondas de chats quedan en `simulacion/ronda-N/` de esta carpeta. Cada ronda corre los 25 chats 2 veces.

- [x] 1. Lector de chats simulados y controles automáticos
  - Qué: `src/agente/simulador/chats/leer.js` lee `chats-simulados.md` y devuelve cada chat con sus pasos,
    su "Debe", su "No debe" y sus controles. `src/agente/simulador/chats/controles.js` aplica los controles
    automáticos a una transcripción; reutiliza `temasPreguntados` y la regla de cuotas de
    `simulador/evaluar.js`. Una línea o un control que no se entiende hace fallar la lectura con el número
    de línea.
  - Criterio: tests sin red ni base. Lee los 25 chats de este cambio; cada tipo de paso y cada control
    tiene un caso que pasa y uno que falla; un documento mal escrito falla nombrando la línea.

- [x] 2. Script de chats simulados y ronda 0
  - Qué: `scripts/simular-chats.js`.
    - Arma `agencia_simulacion` de cero con el catálogo y la agencia del documento (`simulador/masivo/base.js`
      pasa a recibir los datos a cargar) y aborta si alguna conexión no es esa base (`guardas.js`).
    - Corre cada chat por `atenderMensaje`, con reloj simulado. Lo único real que sale a la red es Claude
      Haiku 5.5. Todo lo demás se inyecta: BCRA simulado, transcripción de audio simulada (sin Groq) y un
      envío de WhatsApp de prueba que solo anota. Sin `WA_TOKEN` ni `GROQ_API_KEY` en el proceso.
    - Guarda en `simulacion/ronda-N/`: `transcripcion.md` (cada chat con las respuestas, las herramientas
      usadas, lo que quedó guardado y el resultado de los controles), `resultados.json`, el costo y la
      cantidad de mensajes de WhatsApp, y `pedido-codex.md`.
    - Opciones: `--ronda N`, `--solo K1,E1`, `--repeticiones 2`, `--esfuerzo low|medium|high`.
    - Ronda 0: los 25 chats contra el bot sin cambios, y una pasada más con `--esfuerzo medium` como
      referencia. Codex revisa el documento de chats, los controles y las respuestas. Claude verifica cada
      hallazgo; los que son del documento se corrigen en el documento.
  - Criterio: tests: aborta contra una base que no es la de simulación; el envío real a WhatsApp recibe 0
    llamadas; "(pasan 10 minutos)" adelanta el reloj y revisa el recordatorio. La ronda 0 queda guardada
    con la lista de chats que hoy fallan. Tienen que fallar K1 (hoy la ficha manda 0 km), R1 y R2 (el
    recordatorio no existe): si alguno pasa con el bot actual, el chat o su control están mal.

- [x] 3. Kilómetros sin cargar
  - Qué: `auto-publico.js`: un usado con `kms = 0` sale con `km: null`. `instrucciones.js`: la regla de
    qué decir y qué no cuando faltan los km, y la excepción en "dato sin cargar".
  - Criterio: `agente-herramientas` › Usado con kilómetros en cero; `agente-comportamiento` › Kilómetros
    sin cargar y › Dato del auto sin cargar; chats K1, K2 (km), K3 y N2.

- [x] 4. Entrega mínima sin cargar y cómo hablan los clientes
  - Qué: `instrucciones.js`: la regla de la entrega mínima; el glosario ("entrega", "retirar", "llevármelo");
    cuándo se anota un usado; corregir lo anotado; ejemplos nuevos sacados de los chats, en masculino y en
    femenino. `contextoDelMomento`: lo anotado va presentado como anotado, con el aviso de corregirlo.
  - Criterio: `agente-comportamiento` › Entrega mínima sin cargar, › La entrega mínima sigue con el recorrido, › Entrega quiere decir anticipo, › El usado se anota solo si el cliente lo ofrece, › Precio de
    lista, contado y anticipo y › Forma de escribir (Género del auto); `agente-conversacion` › Contexto de
    cada turno (Lo anotado se puede corregir); chats E1 (hasta el anticipo), E2, E3, K2, P1, P2 y N5.

- [x] 5. El permiso y el CUIL entran en el recorrido
  - Qué: `calificacion.js` (`pendientes` recibe en qué va la verificación crediticia), `atender.js` y
    `herramientas.js` (se lo pasan, y `registrar_consentimiento` dice qué sigue), `credito/verificacion.js`
    (no duplica el permiso).
  - Criterio: `agente-calificacion` › Lo que falta preguntar, en orden (los 3 escenarios nuevos y los que ya
    existían, en verde); `agente-herramientas` › Guardar el permiso dice qué sigue; `agente-credito` › El
    permiso se guarda una sola vez; chats P10 y E1 completo.

- [x] 6. No repite la pregunta y ofrece opciones cerca del precio
  - Qué: `instrucciones.js`: la pregunta que sigue del recorrido va solo si el cliente contestó la
    anterior; regla de las otras opciones. `contextoDelMomento`: las preguntas que el bot hizo en sus dos
    últimos mensajes y el cliente no contestó. `herramientas.js`: `buscar_autos` sin presupuesto ordena por
    cercanía de precio al auto de la consulta.
  - Criterio: `agente-comportamiento` › El recorrido de venta (El cliente pregunta otra cosa en vez de
    contestar) y › Otras opciones según lo que busca; `agente-conversacion` › Contexto de cada turno
    (Pregunta sin contestar, El cliente contestó); `agente-herramientas` › Buscar cerca del auto de la
    consulta; chats P3, P4 (opciones) y K1 (no repite la forma de pago).

- [x] 7. El bot se acuerda de lo que hizo
  - Qué: migración 085 (`historial_mensajes.fotos_ref`, VARCHAR(30) NULL) y `schema.prisma`. `agente.js`
    devuelve el código del auto de las fotos y `atender.js` lo guarda con el mensaje. `contextoDelTurno`
    agrega las fotos ya enviadas, el día en que se propuso la visita (`visita_propuesta_at`) y cuánto pasó
    desde el mensaje anterior. `instrucciones.js`: "No inventa lo que hizo" y qué es "[audio]".
  - Criterio: la 085 se aplica dos veces en local sin error; `npx prisma validate` pasa; `agente-conversacion`
    › Las fotos enviadas quedan registradas y › Contexto de cada turno (Fotos ya enviadas, Visita propuesta
    días atrás, Mensajes seguidos); `agente-comportamiento` › No inventa lo que hizo y › Audios
    transcriptos; chats P4 (fotos), P6, P7 y P8.

- [x] 8. Nada interno en el texto
  - Qué: `agente.js`: revisa el texto contra los nombres de las herramientas, pide una reescritura sin
    herramientas y, si persiste, quita la oración; quita el 👍 suelto al final de un texto.
    `instrucciones.js`: regla de nombres internos.
  - Criterio: `agente-conversacion` › El texto no nombra herramientas y › Un 👍 suelto no viaja con texto;
    `agente-comportamiento` › Nombres internos y › Despedidas con 👍; chats P5 y P9.

- [x] 9. Recordatorio a los 10 minutos
  - Qué: módulo nuevo `src/agente/recordatorio.js`: qué consultas corresponden, el texto (IA sin
    herramientas, "no corresponde", texto fijo), el envío (por la cola del número, vuelve a comprobar, manda
    con `crearEnvioWhatsapp`, guarda el mensaje y `recordatorio_en`) y la revisión de cada minuto.
    `atender.js` exporta la cola por número. `server.js` arranca la revisión. `.env.example` documenta
    `RECORDATORIO_MINUTOS`.
  - Criterio: todos los escenarios de `agente-recordatorio` con su test, con reloj y envío inyectados
    (ningún test manda a WhatsApp ni arranca la revisión automática); chats R1 a R4 y P7 (sin recordatorio).

- [x] 10. Nivel de razonamiento
  - Qué: `agente.js`: el nivel sale de una constante y el máximo de tokens depende del nivel. Correr los 25
    chats con `low`, `medium` y `high`, 2 veces cada uno y con los mismos controles y la misma revisión de
    Codex que una ronda, y comparar cuántos pasan, el costo, el tiempo por respuesta y el
    largo de las respuestas.
  - Criterio: tabla en `simulacion/esfuerzo.md`. Queda el nivel más bajo con el que pasan todos los chats;
    si con ninguno pasan todos, el que más pasa, y queda anotado. `agente-conversacion` › Cómo se llama a
    Claude y su test dicen el nivel elegido. Ninguna respuesta se corta por el máximo de tokens.

- [x] 11. Rondas con Codex, hasta 4
  - Qué: con las tareas 3 a 10 hechas, ronda 1: los 25 chats. Codex revisa las respuestas de Haiku y los
    tests contra las reglas. Claude verifica cada hallazgo contra la transcripción y el código, lo anota en
    `REVISION-CHATS.md` (hallazgo, verificación, qué se hizo) y corrige. Una corrección que toca código pasa
    por el loop de siempre. Después, la ronda siguiente.
  - Criterio: termina cuando una ronda da 0 fallas altas o medias de Codex y todos los controles automáticos
    bien en las 2 repeticiones. Como máximo 4 rondas: si la cuarta deja fallas, se frena y el user recibe la
    lista, sin seguir corrigiendo. `npm test` en verde, salvo el test de anclas de
    `importar-lista-por-etapas`, que ya fallaba antes de este cambio.

- [x] 12. Cierre
  - Qué: anclas cerradas con el nombre exacto de cada test; `openspec validate respuestas-del-bot --strict`;
    los 5 clientes simulados de antes (`scripts/simular-ventas.js`) corridos una vez para comparar con su
    última medición; `DOCUMENTO-FINAL.md` con lo que cambió, el resultado de cada ronda y los pasos para
    producción (la 085 antes que el backend; variables); la bóveda ("BOT CON RAZONAMIENTO" sección 13, "Plan
    de mejora del bot" y "Simulación de ventas del agente").
  - Criterio: ningún `<!-- test: FALTA -->` en los requisitos de este cambio, salvo los que ya lo tenían;
    el test de anclas pasa para este cambio; documento final entregado. Nada se sube a producción sin orden
    del user.
