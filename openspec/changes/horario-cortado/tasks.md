# Tareas — horario-cortado

Flujo ECC: /plan (este cambio) → /feature-dev (código con Sonnet 5.5 y TDD, agente `tdd-guide`) →
/code-review (agente `code-reviewer` + Codex sobre el diff).

- [x] 1. Migración `088_horario_cortado.sql` (comillas simples por el `sql_mode` ANSI de producción, con
  rollback comentado) y `schema.prisma`. Aplicarla en la base local y correr `prisma generate` con el backend
  frenado (en Windows el motor de Prisma queda bloqueado). **Criterio:** el escenario "Base local", con las
  pruebas anotadas en `BITACORA.md`.
- [x] 2. Backend, tests en rojo: `src/services/horarios.service.test.js` (nuevo, con el molde de
  `config.service.test.js`). **Criterio:** los escenarios de "Horario corrido o cortado" y "Un día que no
  sirve no guarda nada" fallan por lo que falta, no por errores de sintaxis.
- [x] 3. Backend, código: `horarios.service.js` valida y guarda la segunda franja. **Criterio:** esos tests en
  verde y la suite completa.
- [x] 4. Bot, tests en rojo y después código: `horariosEnPalabras` con las dos franjas y `horarios_atencion`
  con `horario` en palabras (se ajusta lo que espera el test "horarios_atencion devuelve los días con su
  nombre"). Los 4 tests actuales de `horariosEnPalabras` no se tocan. **Criterio:** los escenarios de "El bot
  dice el horario cortado" y "La herramienta del bot da el horario de cada día en palabras", y la suite.
- [x] 5. Front, tests en rojo y después código: `lib/horarios.js` (texto del día, partir al prender
  "Cortado", validación y armado de lo que se manda), el interruptor "Cortado" en
  `configuracion-horarios.jsx` y la portada en `inicio/seccion-contacto.jsx`. **Criterio:** los escenarios de
  "El panel edita el horario cortado" y "La portada muestra el horario cortado", la suite del front, `npm run
  lint` sin errores nuevos en estos archivos y `npm run build`.
- [x] 6. Prueba en el navegador (local): cargar un lunes cortado en Configuración, guardarlo, verlo en la
  portada y en `GET /api/horarios`, y volver a dejar los horarios como estaban. **Criterio:** capturas y
  resultado en `BITACORA.md`.
- [x] 7. Revisión del diff (`code-reviewer` de ECC + Codex), verificación de cada hallazgo y
  `openspec validate horario-cortado --strict`.
- [ ] 8. Producción, solo cuando el dueño lo pida: respaldo de la base, 088, backend y front, en ese orden.
- [ ] 9. `openspec archive horario-cortado`.
