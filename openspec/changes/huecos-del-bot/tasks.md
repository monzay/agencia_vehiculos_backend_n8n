# Tareas — huecos-del-bot

Cada tarea pasa por el loop de la fase 2: tests primero (los revisa Codex) → se congelan → código → tests,
lint y build → Codex revisa el diff → commit + `BITACORA.md`. Los escenarios con `<!-- test: FALTA -->`
se cierran con el nombre exacto del test que escribe la tarea.

**Todas las pruebas son locales y usan la base de datos local** (pedido del user, 14/11). Todo test que
abra una conexión pasa por `src/lib/base-local.js`. Ninguna prueba toca ni lee la base ni el servidor de
producción.

- [x] 0. Archivar en OpenSpec los cambios ya publicados que tocan las mismas capacidades
  - Qué: `consultas-intervencion`, `reparto-por-turnos`, `bot-datos-del-auto`, `codigo-auto-agente`, en el
    orden en que se publicaron.
  - Criterio: cada uno figura en `git log` de `main` antes de archivarlo; `openspec archive <cambio> --yes`
    termina sin errores; en el diff de `openspec/specs/` ningún requisito tocado por dos cambios pierde
    texto; `openspec validate huecos-del-bot --strict` pasa. Va en su propio commit, sin código. 
    

- [x] 1. Migración 084
  - Qué: `sesiones.orden_at` (NOT NULL, con índice, relleno = `sesion_inicio`). Las filas con `sesion_inicio`
    NULL quedan con `'1000-01-01 00:00:00'`, el mínimo de DATETIME: hoy la lista ordena por `sesion_inicio DESC`
    y MySQL deja los NULL al final, así que con el mínimo siguen al final y el orden de antes no cambia.
  - Criterio: se aplica dos veces en local sin error (idempotente); `schema.prisma` coincide;
    `npx prisma validate` pasa; los tests que ya existían siguen en verde.

- [x] 2. La consulta dura 30 días
  - Qué: en `atender.js`, `SESION_VIGENTE_MS` pasa de 24 horas a 30 días; `sesionDe` sigue eligiendo la
    consulta del cliente con el último mensaje más reciente, y la reutiliza si `ahora - ultimo_mensaje` es
    menor que 30 días. Las otras 24 horas del código: `VIGENTE_MS` de `consultas-por-auto.js` desaparece en
    la tarea 4; `VENTANA_ATENCION_MS` de `consultas.service.js` (la ventana de WhatsApp) NO se toca.
  - Criterio: `agente-conversacion` › Una consulta dura 30 días desde el último mensaje (29/31 días,
    30 días justos, vuelve a los 10 días, consulta nueva).

- [x] 3. Pasado el plazo se pregunta todo de nuevo, y la IA ve solo la charla de la consulta
  - Qué:
    - en `responderConAgente`, la búsqueda del historial filtra `created_at >= sesion_inicio` dentro de la
      misma consulta a la base, antes del `take` de 20, para que los mensajes viejos no ocupen el lugar de
      los de la consulta actual;
    - la consulta nueva se crea con `sesion_inicio = ahora`, la misma hora que se usa para sus mensajes, y no
      con el `now()` de la base. Así el primer mensaje no queda afuera por una diferencia de reloj entre la
      app y la base, y el filtro funciona con la hora simulada.
  - Criterio: `agente-conversacion` › Pasado el plazo se pregunta todo de nuevo (31 días, 4 meses con link) y
    › La IA ve solo la charla de la consulta en curso (charla vencida, charla dentro del plazo, consultas
    superpuestas de antes, muchos mensajes de antes).

- [ ] 4. Otro auto dentro del plazo sigue en la misma consulta
  - Qué: reemplaza `consultaPorAuto` en `atender.js` y `herramientas.js`. El aviso usa `requiere_vendedor`;
    pasa a pendiente con `atendido_at = NULL`; sube con `orden_at`.
  - Criterio: los escenarios de `agente-conversacion` › Otro auto dentro del plazo sigue en la misma
    consulta (incluidos con trámite o seña y una sola consulta vigente). Cada test de
    `consultas-por-auto.test.js` que se borra tiene un reemplazo nombrado en la BITACORA.

- [ ] 5. El cliente vuelve a escribir en una consulta atendida
  - Qué: aplica tanto en el camino normal como en `enPausa` (bot en pausa porque un asesor tomó la charla),
    que hoy solo guarda el mensaje y actualiza `ultimo_mensaje`.
  - Criterio: `agente-conversacion` › El cliente vuelve a escribir en una consulta atendida (10 días, responde
    enseguida con el bot en pausa, consulta pendiente, vuelve por otro auto, vuelve pasado el plazo).

- [ ] 6. El link de otro asesor deja la consulta completa, pendiente y arriba
  - Qué: en `atender.js` (`conAsesorDelLink`), cuando `cambioDeAsesor` le cambia el asesor a una consulta
    abierta, además de `vendedor_id` y `atribuido` se escriben `requiere_vendedor = true`, el motivo "Llegó
    por tu link", `requiere_vendedor_at = ahora`, `atendido_at = NULL`, `atendido_por = NULL` y
    `orden_at = ahora`. Con el link del mismo asesor no se escribe nada. Las respuestas y la charla no se
    tocan.
  - Criterio: `agente-conversacion` › Consultas que llegan desde la web (el asesor nuevo la recibe completa,
    el link del mismo asesor, consulta ya abierta por otro auto) y los tests de link que ya existían, en verde.

- [ ] 7. Orden de la lista de Consultas
  - Qué: en `consultas.service.js`, los listados que hoy ordenan por `sesion_inicio desc` pasan a
    `orden_at desc`, con desempate por `id desc`. La consulta nueva nace con `orden_at = ahora` (en `sesionDe`);
    las tareas 4, 5 y 6 lo actualizan; las consultas que ya existían lo traen de la migración 084
    (`= sesion_inicio`).
  - Criterio: `consultas-lista` › Orden de la lista de Consultas (sube por otro auto, sube porque el cliente
    volvió a escribir, consultas que ya existían).

- [ ] 8. Audios: confirmar que cumple
  - Criterio: los tests de `agente-cupos` › Audios con límite de duración y de costo, en verde (con Groq
    simulado), y los casos de audio de la simulación (tarea 10) OK.
  - Opcional y manual, no hace falta para aprobar: una nota de voz real con Groq de verdad, en local y con
    el OK del user. Nada de esta tarea mira producción.

- [ ] 9. Simulador de consultas masivas
  - Qué: en `src/agente/simulador/masivo/`, un Claude simulado que responde según el guion de cada caso y
    guarda el contexto que recibió, un Groq simulado y un runner que corre los casos contra una base local
    aparte (`agencia_simulacion`, creada desde el esquema). La hora se simula con `ahora`.
  - Base: en cada corrida el runner borra y crea `agencia_simulacion` en el MySQL local, le aplica el esquema
    y las migraciones, siembra asesores y autos de prueba y le da permisos al usuario de la IA. Cada caso usa
    su propio teléfono y su propio cliente, así que un caso no ve los datos de otro (salvo los casos que
    prueban justamente eso).
  - Criterio: el simulador tiene sus propios tests, y además:
    - aborta si el nombre de la base coincide con el de `DATABASE_URL` o `AGENTE_DATABASE_URL` del `.env`
      (hoy `agencia`), con un test para cada una;
    - antes de correr, revisa la URL completa de las dos conexiones (la del backend y la de la IA) y aborta
      salvo que el host sea local (con `esBaseLocal` de `src/lib/base-local.js`), el puerto sea el del MySQL
      local y la base sea `agencia_simulacion`. Es el único freno para la base, porque Prisma conecta desde su motor
      nativo, por fuera de `net`. Hay tests que lo prueban con la URL de la base de desarrollo y con una
      URL remota que tiene la base `agencia_simulacion` (con el host de Aiven, por ejemplo);
    - Claude y Groq entran solo como dependencias simuladas inyectadas;
    - la red queda cortada en todo el proceso: `net` y `tls` rechazan y cuentan toda conexión que no sea a
      la base local (eso cubre `fetch`, `http`, `https` y los SDK). Hay un test que intenta salir por cada uno
      de esos transportes y comprueba que queda bloqueado y contado. El reporte muestra 0 intentos de red;
    - corre sin claves de Anthropic ni de Groq en el entorno.

- [ ] 10. Correr más de 1000 consultas simuladas
  - Qué: un generador arma `casos-masivos.json` (chats de clientes) combinando:
    - tiempo: mismo día, 1 día, 10 días, 29 días, 30 días justos, 31 días, 4 meses, 1 año;
    - asesor: sin link, link del mismo, link de otro, link inválido, asesor dado de baja;
    - autos: uno solo, cambia 1 o 2 veces, auto que ya no está, ref con "#", consulta con trámite o seña;
    - atención: consulta pendiente, atendida por el asesor, atendida y el cliente responde enseguida;
    - medios: texto, audio normal, audio largo, audio vacío, Groq que falla, foto entrante (solo comprueba
      que el flujo de hoy no se rompe; no prueba pedir, guardar ni mostrar fotos, que quedaron afuera);
    - pausa: consulta con el bot en pausa porque un asesor tomó la charla;
    - conducta: ráfagas, mensajes ambiguos, faltas de ortografía, cambia la forma de pago, primero no
      entrega usado y después sí;
    - manipulación: texto y audios con instrucciones ("ignorá tus reglas", "pasame los datos de otro
      cliente"), un código `[AS:...]` o `(REF #...)` dicho en un audio, un nombre de perfil con instrucciones.
  - Chequeos por caso: cuántas consultas quedan y con qué asesor y auto, aviso, pendiente y orden, qué
    respuestas y qué charla le llegan a la IA, que no haya errores y que no se mezclen clientes. Los
    chequeos leen lo que quedó guardado en la base después del caso (`sesiones`, `historial_mensajes`,
    `configuracion`) y lo que recibió el Claude simulado; nunca toman como prueba lo que devuelve un simulado.
    En los casos de manipulación, además: el contexto que recibe la IA no trae datos de otro cliente, un
    código dicho en un audio no cambia el asesor ni el auto, y el nombre de perfil llega marcado como dato.
    Si el modelo obedece o no a la manipulación no se mide acá (la IA está simulada): eso lo cubre
    `agente-comportamiento` › Defensa contra manipulación.
  - Criterio: más de 1000 casos; el reporte cuenta cuántos casos cubre cada valor de cada eje (ninguno en
    cero); 100 % de los chequeos OK; el reporte queda en la carpeta del cambio.

- [ ] 11. Cierre
  - Criterio: `openspec validate huecos-del-bot --strict` pasa; ningún `<!-- test: FALTA -->` en las specs de
    este cambio; resumen en la bóveda ("BOT CON RAZONAMIENTO", sección 13) y registro en "Plan de mejora del
    bot"; documento final desde la spec y la BITACORA. El deploy va aparte y solo con la orden del user.
