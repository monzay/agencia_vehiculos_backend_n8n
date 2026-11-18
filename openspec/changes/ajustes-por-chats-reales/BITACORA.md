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
