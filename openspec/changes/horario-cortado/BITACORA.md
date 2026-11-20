# Bitácora — horario-cortado

## 2026-11-20

- **Plan:** aprobado por el dueño el mismo día (ver `OBJETIVO.md`). Antes de arrancar se precisó en el spec
  que, al apagar "Cortado", el día vuelve a ser corrido de la primera apertura al último cierre.
- **Ramas:** `feat/horario-cortado` en el backend y en el front, desde `feat/tipos-de-vehiculo`.
- **Tareas 1 a 5:** código con TDD, hecho por Sonnet en dos agentes en paralelo (backend y front).
  - Backend: los 14 tests nuevos o ajustados fallaron antes del código, por lo que faltaba. Los 4 tests
    viejos de `horariosEnPalabras` pasaron antes y después, sin tocarlos.
  - Front: `lib/horarios.test.js` falló antes de existir `lib/horarios.js`.
- **Tarea 1, base local:** respaldo `backups/horarios-atencion-antes-088-2026-11-20_1318.sql`. La 088 entró
  sin cambiar datos: los 7 días siguen de 09:00 a 18:00, con `apertura_2` y `cierre_2` en NULL.
  - En transacciones deshechas, la base acepta 08-13 y 16-21. Rechaza estos casos: la que se pisa (12-21),
    la incompleta, la que va al revés (21-16), un día cerrado con segunda franja y el formato "16h".
  - En una base descartable con `sql_mode` ANSI, como en producción, la 023 y la 088 corren sin errores. La
    base se borró después.
  - `prisma generate` con el backend frenado y el backend levantado de nuevo. `GET /api/horarios` devuelve
    los seis campos.
- **Tarea 6, navegador (local):**
  - En Configuración, al prender "Cortado" el día de 09:00 a 18:00 pasa a 09:00-13:00 y 16:00-18:00.
  - Lunes y martes cortados se guardan, y la portada muestra "Lunes: 09:00 - 13:00 y 16:00 - 18:00".
  - El bot, con esos datos, dice "lunes y martes de 09:00 a 13:00 y de 16:00 a 18:00, miércoles a domingo
    de 09:00 a 18:00", y su herramienta devuelve el `horario` de cada día en palabras.
  - Con la tarde del martes a las 12:00, el panel muestra "El Martes la segunda franja debe empezar después
    del cierre de la primera." y no manda nada.
  - La API, con un miércoles que se pisa, da 400 con el día en el mensaje; sin sesión da 401.
  - Ajuste de diseño tras la primera prueba: el interruptor "Cortado" saltaba de línea al prenderlo. Ahora
    queda fijo después de la primera franja, y la segunda franja va alineada debajo.
  - Los horarios locales quedaron como estaban (los 7 días de 09:00 a 18:00) y el token de prueba se borró.
  - Detalle aparte: el aviso "1 Issue" de Next en desarrollo es de React por la falta de `eval` en la
    política de seguridad del sitio, no de este cambio.
- **Tarea 7, revisión:**
  - Checklist de `/code-review` de ECC: ninguna función pasa de 50 líneas ni archivo de 800, no hay
    `console.log` ni TODO nuevos, los campos tienen `aria-label` y la escritura sigue solo para admin.
  - Codex (razonamiento medio) reportó dos hallazgos medios:
    1. "El CHECK acepta una segunda franja con el cierre de la mañana en NULL": **descartado**. El CHECK
       `horarios_coherencia` de la 023 exige apertura y cierre en todo día abierto. Probado en la base:
       rechaza el caso, y en un día cerrado lo rechaza `horarios_segunda_franja`.
    2. "El panel no valida el formato HH:MM y la API sí": **aceptado** por el spec ("validar lo mismo que la
       API"), aunque los campos de hora del navegador siempre dan HH:MM. Se agregó el escenario y el test.
  - Con ese arreglo: front 42 de 42 y `next build` pasa. Backend 1983 de 1985: falla solo el control de
    anclas, por las 50 de `importar-lista-por-etapas` (cambio previo sin código); ninguna es de este
    cambio. `openspec validate horario-cortado --strict` da válido.
- **Chequeo previo a producción (20/11, solo lectura en prod):**
  - Base de prod: MySQL 8.4.11, `sql_mode` ANSI. Horarios: lunes a viernes de 08:00 a 21:00 (miércoles
    desde las 09:00), sábado de 08:00 a 13:00 y domingo cerrado. Tiene los 4 CHECKs de la 023, incluido
    `horarios_coherencia`. `agente_ia` tiene `SELECT` sobre toda la tabla, no por columna, así que lee las
    columnas nuevas.
  - Servidor: backend con el código de tipos-de-vehiculo y sin `apertura_2`, 9,9 GB libres, `/health` 200.
    El Dockerfile corre `prisma generate`. Cada rama es `origin/main` más un solo commit.
  - Ensayo en un MySQL 8.4.11 descartable (Docker), con el `sql_mode` de prod y la copia real de la tabla:
    - la 088 entra y no cambia datos;
    - las reglas aceptan 08-13 y 16-21 y rechazan los 6 casos malos;
    - el rollback de la 088 deja los datos iguales y se puede volver a aplicar.
  - Código nuevo contra esa copia:
    - con los horarios reales, el bot dice exactamente lo mismo que hoy;
    - la herramienta lee las columnas nuevas con `agente_ia`;
    - guardar desde el panel viejo deja todo igual;
    - un horario que se pisa da 400.
- **Pendiente:** producción (tarea 8), solo cuando el dueño lo pida: respaldo, 088, backend y front, en ese
  orden. Después, `openspec archive horario-cortado` (tarea 9).
