# cuil-directo

## Why

El permiso del BCRA confunde y asusta al cliente. Hoy, apenas dice que tiene recibo o garante, el bot le
manda un mensaje largo: la Central de Deudores, "tus datos se usan solo para eso", un link a la política de
privacidad y "respondeme sí o no". Recién con el "sí" le pide el CUIL.

El dueño quiere una sola pregunta, corta y natural: "¿Me pasás tu CUIL? Así el asesor puede consultar tu
situación en la Central de Deudores del BCRA". La política de privacidad queda en una página de la web, con
un link en el pie, y no viaja por el chat.

## What Changes

**El pedido**
- El bot pide el CUIL en un solo mensaje, diciendo para qué es. No hay permiso aparte, ni "sí o no", ni link.
- Mandar el CUIL **es** la autorización. Al recibir un CUIL válido y suyo, después de que el bot dijo para
  qué es, el sistema guarda el "sí" y recién después consulta. El "sí" lleva la versión vigente de los términos y el `wamid` del mensaje en que
  llegó el CUIL, la misma prueba que se guarda hoy.
- Si el cliente no quiere pasarlo, el bot guarda un "no", no insiste y sigue el recorrido; no se le vuelve a
  pedir. Si después lo manda igual, es una autorización nueva y se consulta.
- Si pregunta para qué es o qué se hace con sus datos, el bot contesta en una línea y le pasa el link de
  /privacidad. Es el único caso en que el link va por el chat.

**El sistema**
- En "lo que falta" se juntan el permiso y el CUIL en un solo paso: "su CUIL, para que el asesor consulte su
  situación en el BCRA". Va después del recibo o garante y antes del usado, como hoy.
- El contexto del turno pide el CUIL con la frase de para qué. El link de privacidad viaja aparte, marcado
  "solo si pregunta qué se hace con sus datos".
- Las respuestas viejas siguen valiendo. Con un "sí" al permiso anterior, se le pide el CUIL; con un "no", no.

**La web**
- El pie de la web pública (portada, catálogo, ficha de cada auto y /privacidad) suma el link "Política de
  privacidad" a /privacidad.

**Lo que no cambia**
- Cuándo se consulta: siempre activa, solo con la política publicada, solo si financia y después de lo del
  recibo o garante.
- La validación del CUIL, el semáforo (solo informativo, nunca llega a la IA), la reutilización de 30 días, la
  espera de una hora tras un error y lo que ve el panel.

## Decisiones

Propuestas por Claude; el dueño las confirma o corrige en `OBJETIVO.md › Ajustes`.

1. **Pasar el CUIL cuenta como autorización** y queda guardada con su prueba (`wamid`). Sin esto, la consulta
   al BCRA quedaría sin registro de que el cliente aceptó.
2. **El link de privacidad, solo si el cliente pregunta** qué se hace con sus datos o para qué es. En
   cualquier otro caso no se manda.
3. **Link en el pie de la web.** Hoy /privacidad existe, pero ninguna página lleva a ella.
4. **CUIL antes del aviso.** Si el cliente manda el CUIL antes de que el bot diga para qué es (por su cuenta,
   o junto con lo del recibo), no se consulta todavía. Cuando toca, el bot le dice para qué es y le pide que
   se lo vuelva a mandar si está de acuerdo. Es raro, porque el CUIL se pide después del recibo, y así el "sí"
   sale siempre de un CUIL mandado sabiendo para qué es.
5. **Un "no" solo si lo dice claro.** Si esquiva la pregunta, no se guarda nada.

## Nota legal

Este cambio informa menos en el momento en que se pide el dato. La Ley 25.326 (art. 6) pide informar, al
recolectar un dato, para qué se usa, quién lo recibe y los derechos del titular.

Lo que queda del lado de la agencia:
- el mensaje dice para qué es;
- la política está publicada y enlazada en la web;
- el bot la pasa si el cliente pregunta.

Lo que el mensaje corto no dice son los derechos del titular: quedan en la política. Es lo que pidió el dueño
(sin el texto largo ni el link), y Codex lo marcó como riesgo en la ronda 3. Conviene que lo revise el abogado
que ya está pendiente, junto con la autorización del BCRA y la AAIP.

**Condición para subir a producción** (tarea 7): la política publicada tiene que decir para qué se usa el
CUIL, quién lo ve y los derechos del titular, y no puede decir que el permiso se pide por WhatsApp. Si hace
falta, el admin publica una versión nueva desde el panel antes del deploy. No hace falta código.

## Impact

**Specs**
- `agente-credito`: MODIFIED
  - "El semáforo es solo informativo"
  - "Consentimiento antes de consultar"
  - "Cuándo se consulta"
  - "El permiso se guarda una sola vez"
  - "El CUIL se consulta con la herramienta"
- `agente-credito`: ADDED "La política de privacidad está en la web".
- `agente-calificacion`: MODIFIED "Lo que falta preguntar, en orden".
- `agente-comportamiento`: MODIFIED "La entrega mínima sigue con el recorrido". Este requisito ya lo modifica
  `ajustes-por-chats-reales`, que todavía no está archivado: ese cambio se archiva antes que este (tarea 0).

**Código del backend**
- `src/credito/verificacion.js`: `estadoCredito`, `permisoAnticipado`, `verificarSituacion` y
  `registrarConsentimiento`.
- `src/agente/calificacion.js` (`pendientes`).
- `src/agente/herramientas.js`: descripciones y `sigue` de `registrar_consentimiento` y
  `verificar_situacion_crediticia`.
- `src/agente/atender.js`: el `wamid` llega a `verificar`.
- `src/agente/instrucciones.js`: sección "Verificación crediticia", regla de la entrega mínima y contexto.
- Simulador: chats P10 y E1, y el escenario `financia_bcra`.

**Código del front**
- `components/inicio/seccion-pie.jsx`.

**Base**
- Sin migración: se usan las mismas tablas (`consentimientos`, `consultas_crediticias`).

**Producción**
- Va arriba de `ajustes-por-chats-reales`: se sube después de ese cambio. Backend y front, sin migración
  propia.
