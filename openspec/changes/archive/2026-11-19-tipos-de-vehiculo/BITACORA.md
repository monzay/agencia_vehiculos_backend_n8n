# Bitácora — tipos-de-vehiculo

## 2026-11-19

- **Vista previa:** con los datos de producción (solo lectura), primero en 6 tipos y después en los 4 que eligió
  el dueño. Queda en el scratchpad de la sesión, fuera del repo, porque tiene datos de producción.
- **Tareas 1 a 3:** código con TDD, hecho por Sonnet.
  - Los tests nuevos fallaron antes del código: las dos descripciones y el test del camión en el front.
  - Revisión propia: se reemplazaron por `̀-ͯ` los caracteres de tilde sueltos de la regex de
    `normalizarTipoVehiculo`.
- **Tarea 4:** la 087 se corrió sobre una copia local de la tabla `autos` de producción del 19/11 (102 filas),
  con el `sql_mode` de producción.
  - Cambian 25 de los 80 vigentes, igual que la vista previa: 22 a camioneta, 2 a camión y 1 a auto.
  - Los 22 borrados quedan intactos.
  - Una segunda corrida deja todo igual.
- **Tarea 5:** Codex revisó el diff completo (razonamiento medio) y no encontró hallazgos.
  - Backend: 1970 de 1972. Falla solo el control de anclas, por el cambio previo `importar-lista-por-etapas`,
    que todavía no tiene código.
  - Front: 35 de 35, y `next build` pasa.
  - `openspec validate --strict` da válido.
- **Tarea 6 (producción, por orden del dueño):**
  - Respaldo `backups/prod-antes-087-tipos-vehiculo-2026-11-19_1839.sql` (39 tablas).
  - Backend `84d163c` por `git archive` + build, con copia en `/opt/agencia/backend.bak.20261119-184216`.
    `/health` da 200 y el contenedor acepta `camion`.
  - 087 aplicada: cambiaron 25, igual que la vista previa, y no tocó ningún borrado. Vigentes: 44 autos,
    34 camionetas y 2 camiones.
  - Front `461e89a` en `main`. La API pública da 34 autos y 21 camionetas visibles.
