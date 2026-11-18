# Tareas — cuil-directo

Cada tarea pasa por el loop de la fase 2:
1. Tests primero, que revisa Codex.
2. Los tests se congelan.
3. Código.
4. Tests, lint y build (máximo 4 intentos; después se frena y se avisa).
5. Codex revisa el diff.
6. Commit y `BITACORA.md`.

Los escenarios con `<!-- test: FALTA -->` se cierran con el nombre exacto del test que escribe la tarea.

**Quién hace qué:** el código lo escribe Sonnet 5.5. Claude escribe los tests de aceptación, revisa el diff y
verifica.

**Ramas:** `feat/cuil-directo` en el backend y en el front (`sea_automotores`), cada una desde
`feat/ajustes-por-chats-reales`. Este cambio va arriba de ese.

**Sin APIs reales ni producción** (regla del user del 18/11/2026):
- Ningún test ni simulación llama a Claude, WhatsApp, Groq, BCRA ni Blob: Haiku simulado (`crearClaudeFalso`),
  BCRA simulado y red cortada con `red.js`.
- Cada corrida informa 0 intentos de conexión fuera de la máquina.
- Las bases son la local y `agencia_simulacion`.

## 0. Ordenar los cambios sin archivar
- [ ] **Qué:** antes de archivar este cambio, archivar `cuil-en-consulta` y `ajustes-por-chats-reales`.
  - El MODIFIED de "La entrega mínima sigue con el recorrido" parte del texto de `ajustes-por-chats-reales`:
    si ese cambio se archiva después, pisa este.
  - Probar los tres archive en una copia en el scratchpad antes de hacerlos de verdad.
- **Criterio:** `openspec validate cuil-directo --strict` pasa, y el archive de prueba aplica los tres
  cambios en orden sin errores.

## 1. Pasar el CUIL es la autorización (`src/credito/verificacion.js`)
- [ ] **Qué:**
  - `estadoCredito` devuelve `"pedir_cuil"` cuando corresponde pedirlo: financia, ya dijo lo del recibo,
    hay términos, no hay consulta vigente ni error reciente, y no hay un "no" como último registro. Si no,
    devuelve `null`. Desaparece `"pedir_consentimiento"`.
  - `permisoAnticipado` pasa a avisar que el CUIL va después del recibo (`"pedir_cuil_tras_el_recibo"`), con
    las mismas condiciones de hoy.
  - `verificarSituacion` recibe los mensajes del cliente que se responden en el turno, cada uno con su texto y
    su `wamid` (los `partes` del lote, cuando llegan varios juntos). "El CUIL en el mensaje" es el primero de
    esos mensajes cuyo texto trae los dígitos del CUIL, y su `wamid` es el que queda como prueba. El orden es:
    1. términos y "financia y dijo lo del recibo", como hoy. Si el CUIL llega antes de lo del recibo, el
       motivo le dice a la IA que siga el recorrido y que, cuando toque, explique para qué es y le pida que se
       lo vuelva a mandar;
    2. autorización, en este orden:
       - si hay **aviso** en un turno anterior y el CUIL está en el texto del mensaje (los dígitos, sin
         separadores), autoriza el CUIL del mensaje, aunque ya hubiera un "sí" vigente o un "no";
       - si no, sirve un "sí" vigente: el último registro del cliente es un "sí", de cualquier versión, como
         hoy con `ultimoConsentimiento`.

       Reemplaza el chequeo de hoy (`if (!consentimiento?.acepta) return no(MOTIVOS.sinPermiso)`);
    3. **sin autorización:** devuelve `{ consultado: false, motivo }` y no guarda nada, tampoco
       `cuil_informado`. El motivo le dice a la IA: "decile para qué es y pedile que te lo vuelva a mandar si
       está de acuerdo". `cuil_informado` sigue guardándose solo con autorización (migración 076);
    4. valida el formato (`validarCuil`): si no es válido, devuelve `cuilInvalido` y no guarda nada;
    5. guarda `cuil_informado` y comprueba que sea suyo (lo que hoy hace `cuilDelCliente`). Si no es suyo,
       devuelve `cuilAjeno`, sin guardar ningún "sí" ni consultar: un CUIL ajeno no deja una autorización que
       sirva para otro;
    6. si la autorización vino del CUIL en el mensaje, pasa por `registrarConsentimiento(true)` (versión
       vigente y ese `wamid`):
       - si el **último** registro ya es un "sí" de la misma versión, no crea otro y conserva el primero con su
         `wamid` (como hoy: compara contra `ultimoConsentimiento`, no contra cualquier "sí" anterior);
       - con una versión nueva de los términos, o si el último registro es un "no" (aunque antes hubiera un "sí"
         de la misma versión), crea uno nuevo. Test: "sí", "no" y después el CUIL deja un tercer registro, un
         "sí".

       Si la autorización vino de un "sí" vigente, no se guarda nada nuevo;
    7. consulta. La consulta queda atada al último "sí" del cliente (`consentimiento_id`).
  - **Aviso:** un mensaje de la agencia de un turno anterior, en la consulta en curso, que nombra el CUIL y la
    Central de Deudores o el BCRA.
    - `verificarSituacion` lo averigua sola, con el usuario del backend (`db`): busca en
      `historial_mensajes`, con `cliente_id` del cliente y `direccion = 'saliente'`, un mensaje del bot, o del
      asesor si intervino.
      - Tiene que ser posterior a `sesion_inicio` y con `created_at` menor que el del mensaje entrante que trae
        el CUIL.
      - Los entrantes del turno se guardan con `turno.ahora` y la respuesta con `ahora + 1 ms`
        (`unMsDespues`), así que un aviso del mismo turno nunca cuenta. Los turnos de un mismo número se
        atienden de a uno, así que el aviso de un turno anterior siempre tiene una fecha menor.
      - Riesgo aceptado: un CUIL mandado por su cuenta justo en los segundos en que el bot escribía el aviso
        cuenta como posterior.
      - Test con el aviso y el CUIL en el mismo turno: no autoriza.
    - Una función nueva, `esAvisoDelCuil(texto)`, exportada desde `temas-preguntados.js` y probada ahí, mira
      el **mensaje completo** y exige las dos cosas: que nombre el CUIL (la expresión del tema "cuil") **y**
      la Central de Deudores o el BCRA (`/central de deudores|\bBCRA\b/i`).
      - "Situación crediticia" o "autorizás" solos no alcanzan, aunque el tema "permiso" los acepte para el
        recordatorio.
      - No se usa `temasPreguntados()`, que mira solo las preguntas: en el ejemplo del dueño, la Central de
        Deudores está en la oración afirmativa.
    - Tests:
      - la frase exacta del plan;
      - un mensaje de varias oraciones;
      - un mensaje que nombra solo el CUIL, otro que nombra solo el BCRA y otro que dice solo "situación
        crediticia": ninguno de esos tres cuenta.
  - **CUIL de la charla:** el CUIL anticipado no se guarda en ningún lado. Como el "sí" solo sale de un CUIL
    que llega en el mensaje después del aviso, la IA no puede autorizar uno viejo tomándolo de la charla.
  - **`registrarConsentimiento`:**
    - lo usan la herramienta (solo el "no") y `verificarSituacion` (el "sí" del paso 6);
    - guarda con el `wamid` del turno y sin duplicados, como hoy;
    - **cambia en una cosa:** recibe quién lo pide. Un `true` que no venga de `verificarSituacion` no se guarda.
      Va en la función de dominio, no solo en la herramienta.
    - Tests:
      - `false` se guarda;
      - `true` desde la herramienta no se guarda;
      - `true` desde `verificarSituacion` se guarda sin duplicar la misma versión.
- **Criterio:** escenarios de `agente-credito`:
  - "Consentimiento antes de consultar": Sin consentimiento, Pasar el CUIL es la autorización, No quiere
    pasarlo, Esquiva la pregunta, CUIL viejo sin un sí en el mensaje, CUIL antes del aviso, CUIL antes de que
    corresponda, Después de un "no" sin aviso en esta consulta, Cambia de idea, CUIL inválido o de otra persona, Respuestas anteriores al cambio.
  - "Cuándo se consulta" › Sin política publicada (test nuevo: sin términos, `estadoCredito` y
    `permisoAnticipado` dan `null`, así que no hay pedido ni CUIL en lo que falta), En qué paso está.
  - "El permiso se guarda una sola vez" › La IA repite el mismo "sí", La IA repite el mismo "no".
  - Los tests existentes de semáforo, reutilización y errores siguen pasando sin cambios.

## 2. Lo que falta (`src/agente/calificacion.js`)
- [ ] **Qué:**
  - `pendientes` reemplaza los textos del permiso por uno solo: "su CUIL, para que el asesor consulte su
    situación en el BCRA (pedilo como dice Verificación crediticia)".
  - Va en el mismo lugar: después del recibo o garante y antes del usado, tanto con `"pedir_cuil"` como con
    `"pedir_cuil_tras_el_recibo"`.
  - El anticipado sigue diciendo "(apenas responda lo del recibo o garante)", como hoy, para que la IA no lo
    pida antes: el recibo o garante sigue primero en la lista.
  - Se borran `PEDIR_PERMISO` y `PEDIR_PERMISO_TRAS_EL_RECIBO`.
- **Criterio:** `agente-calificacion` › "Lo que falta preguntar, en orden": Falta el permiso, Financia y todavía
  no dijo lo del recibo, Autorizó y falta el CUIL (respuestas viejas), Dijo que no o paga de contado.

## 3. Herramientas y orquestador (`src/agente/herramientas.js`, `src/agente/atender.js`)
- [ ] **Qué:**
  - `registrar_consentimiento`: la descripción dice que se usa solo con `false`, cuando el cliente dice
    claramente que no quiere pasar el CUIL.
    - Si esquiva la pregunta o no queda claro, no se usa. `acepta` deja de decir "o no quedó claro".
    - Un `true` no se guarda (lo garantiza `registrarConsentimiento`, tarea 1), y la herramienta responde que
      el "sí" es el CUIL que manda el cliente después del aviso.
    - Los textos `sigue` dejan de nombrar el permiso: tras un "no", "Seguí con el recorrido, sin pedir el
      CUIL".
  - `verificar_situacion_crediticia`: la descripción dice que pasar el CUIL es la autorización y que se usa
    apenas el cliente lo manda.
  - `atender.js`: la función `verificar` del turno le pasa a `verificarSituacion` los mensajes entrantes del
    turno, cada uno con su texto y su `wamid` (`turno.entrantes` / los `partes` del lote), en vez de un solo
    `wamid`.
    - Test de un lote de dos mensajes con el CUIL en el primero: el "sí" queda con el `wamid` del primero. Si la IA consulta en un turno
    posterior, se usa el `wamid` de ese turno, pero un "sí" ya guardado no se reemplaza (deduplicación).
- **Criterio:** `agente-credito`:
  - "Consentimiento antes de consultar" › El wamid llega desde el mensaje real (con un test del orquestador
    con el `wamid` real y otro de que una segunda consulta no cambia el registro), La IA pasa la respuesta tal
    cual.
  - "Cuándo se consulta" › Orquestador.
  - "El semáforo es solo informativo" › Sin la verificación conectada, que sigue pasando.

## 4. Instrucciones y contexto (`src/agente/instrucciones.js`)
- [ ] **Qué:**
  - **Sección "Verificación crediticia":** se reescribe así:
    - pedir el CUIL en un mensaje corto con para qué es, con el ejemplo del dueño;
    - sin permiso, sin "sí o no", sin "tus datos se usan solo para eso" y sin el link;
    - con el CUIL, `verificar_situacion_crediticia` antes de contestar;
    - si pregunta qué hacen con sus datos, una línea y el link de privacidad del contexto;
    - si no quiere, `registrar_consentimiento` con `false`, sin insistir;
    - nunca el resultado.
  - **Regla de la entrega mínima:** "El CUIL se pide solo cuando el contexto lo indica, primero el permiso con
    el link de privacidad" pasa a "…cuando el contexto lo indica, como dice Verificación crediticia".
  - **Línea 21** ("el permiso del BCRA va antes que el usado"): pasa a "el CUIL".
  - **`verificacionCrediticia(credito, privacidadUrl)`:**
    - con `"pedir_cuil"`, el contexto dice "pedile su CUIL diciendo para qué es (ver Verificación
      crediticia)";
    - el link va en una línea aparte: "Si pregunta qué se hace con sus datos: <url>".
    - Desaparece el caso `"pedir_consentimiento"`.
- **Criterio:**
  - `agente-credito`:
    - "El CUIL se consulta con la herramienta": todos sus escenarios.
    - "El semáforo es solo informativo" › Instrucciones del agente.
    - "Cuándo se consulta" › Aviso en el contexto.
  - `agente-comportamiento` › "La entrega mínima sigue con el recorrido".
  - El test que impide el femenino sigue pasando.

## 5. Simulador
- [ ] **Qué:**
  - **P10** pasa a ser "Pide el CUIL directo y el cliente lo manda": un solo pedido con la Central de Deudores,
    sin link ni "sí o no", y después la consulta. Controles:
    - el pedido nombra el BCRA o la Central de Deudores;
    - no hay link de privacidad ni "sí o no";
    - se llamó a `verificar_situacion_crediticia`;
    - quedó un solo "sí", con el `wamid` del mensaje del CUIL.
  - **P11 (nuevo):** "¿Y para qué lo quieren?". Contesta en una línea y pasa el link de /privacidad.
  - **P12 (nuevo):** "Prefiero no pasarlo". Guarda el "no", no insiste y sigue con el usado.
  - **P13 (nuevo):** "Tengo recibo, mi CUIL es …" en el mismo mensaje, antes del aviso. No consulta: dice para
    qué es y le pide que se lo vuelva a mandar si está de acuerdo. Si lo manda, consulta, y el "sí" queda con
    el `wamid` de ese mensaje. Variante: contesta solo "sí" sin el CUIL, y no se consulta.
  - **P14 (nuevo):** el CUIL en el primer mensaje, antes de la forma de pago. Sigue el recorrido y, al llegar
    al CUIL, dice para qué es y le pide que se lo vuelva a mandar.
  - **E1 y X14:** el texto del modelo se adapta al pedido nuevo. X14 sigue sin recordatorio después del pedido
    del CUIL (`temas-preguntados.js` ya reconoce "BCRA" y "Central de Deudores").
  - **Escenario `financia_bcra`** de `escenarios.js`: el cliente simulado manda el CUIL sin que le pidan
    permiso.
  - Corrida completa con el Haiku simulado y la red cortada; 0 intentos de red.
- **Criterio:** escenarios con `eval: chats simulados › P10, P11, P12, P13, P14, E1`. El resto de los chats da el mismo
  resultado que en la ronda 5 de `ajustes-por-chats-reales` (14/14 más los nuevos).

## 6. Link en el pie de la web (`sea_automotores/components/inicio/seccion-pie.jsx`)
- [ ] **Qué:**
  - El pie público suma "Política de privacidad" → `/privacidad`.
  - Se revisa si `/financiacion` usa otro pie: si es pública y no tiene el link, se suma ahí también.
  - Sin cambios en la página /privacidad.
- **Criterio:** `agente-credito` › "La política de privacidad está en la web":
  - Link en el pie: los links del pie salen de un módulo `.js` con su test (`npm test`), que exige el de
    /privacidad.
  - Sin política publicada: un caso de Playwright contra la base local (sin términos) que ve el link en el
    pie y el texto "La política de privacidad todavía no está publicada."

## 7. Cierre
- [ ] **Qué:**
  - Anclas `FALTA` cerradas con los nombres de los tests.
  - `openspec validate cuil-directo --strict`.
  - `DOCUMENTO-FINAL.md`, con los pasos para producción:
    - respaldo;
    - primero `ajustes-por-chats-reales`;
    - después backend y front de este cambio, sin migración;
    - **condición para subir:** la política publicada en producción describe para qué se usa el CUIL (la
      consulta a la Central de Deudores), quién lo ve (el asesor de la agencia) y los derechos del titular, y
      no dice que el permiso se pide por WhatsApp. Si no, el admin publica una versión nueva desde el panel
      antes de subir. Los "sí" nuevos quedan atados a esa versión.
  - Bóveda: fila en el registro de "Plan de mejora del bot", resumen en "BOT CON RAZONAMIENTO" (sección 13) y
    nota "Verificación crediticia (BCRA)".
  - Archive después de la tarea 0.
- **Criterio:** suite completa del backend y del front en verde, `openspec validate --strict` y el archive de
  prueba sin errores.
