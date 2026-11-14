# Bitácora — huecos-del-bot

Qué se hizo en cada tarea de la fase 2 y por qué. Rama `feat/huecos-del-bot` (desde `main` ca967e4).

## Tarea 0 — Archivar los cambios ya publicados (2026-11-14)

- **Qué:** `openspec archive` de `consultas-intervencion`, `reparto-por-turnos`, `bot-datos-del-auto` y
  `codigo-auto-agente`, en el orden en que se publicaron (03/11, 10/11 y 11/11 los dos últimos).
- **Por qué:** este cambio modifica reglas de `agente-conversacion` que solo existían en esos cambios sin
  archivar; sin esto, `huecos-del-bot` no se puede archivar.
- **Verificación:**
  - los cuatro están en `main`: sus commits (9dbf8f0, bbae742, d322e79, 5207723) son ancestros de `main`;
  - ningún requisito lo modifican dos cambios a la vez, así que el orden no pierde texto;
  - los cuatro archivos terminaron sin errores: +21 requisitos agregados y 9 modificados en `openspec/specs/`
    (`agente-*` y la capacidad nueva `consultas-intervencion`);
  - `openspec validate huecos-del-bot --strict` pasa después del archivado.
- **Sin código.** Commit propio.
