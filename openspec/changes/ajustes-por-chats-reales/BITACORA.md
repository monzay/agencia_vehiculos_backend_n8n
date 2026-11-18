# Bitácora — ajustes-por-chats-reales

Qué se hizo en cada tarea, con qué commit y qué dijo Codex. La escribe Claude al cerrar cada tarea.

## Tarea 0. Ramas y punto de partida (2026-11-18)

- **Ramas:** `feat/ajustes-por-chats-reales` desde `main`.
  - Backend: `main` = `746c8e1`, lo mismo que producción.
  - Panel (`sea_automotores`): `main` = `75ad55f`.
- **Validación:** `openspec validate ajustes-por-chats-reales --strict` pasa.
- **Archivado de prueba** en una copia del scratchpad: + 12 requisitos nuevos, ~ 10 modificados, sin errores.
- **Plan:** aprobado por el user el 2026-11-18, después de 8 rondas de Codex (ver `REVISION-PLAN.md`).

## Tarea 1. Chats con Haiku 5.5 simulado y ronda 0 (en curso, 2026-11-18)

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

### Código

Lo escribe Sonnet 5.5. Pendiente de su informe.
