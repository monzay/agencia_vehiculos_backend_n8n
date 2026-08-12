-- Marca si la sesión llegó por el LINK DE CAPTACIÓN de un asesor (`/a/<slug>`)
-- en vez de por el reparto equitativo.
--
-- Hace falta una columna aparte porque `vendedor_id` significa dos cosas: lo
-- escribe el link al crear la sesión, pero TAMBIÉN el round-robin al asignar.
-- Sin distinguirlas, una asignación por reparto se leía como atribución y el
-- asesor dejaba de sumar `leads_activos` -> quedaba siempre "liviano" y
-- acaparaba los repartos siguientes.
--
-- Se escribe UNA sola vez, al crear la sesión: es un hecho de origen, no un
-- estado que cambie después.
--
-- Rollback:
--   ALTER TABLE `sesiones` DROP COLUMN `atribuido`;

ALTER TABLE `sesiones`
  ADD COLUMN `atribuido` TINYINT(1) NOT NULL DEFAULT 0 AFTER `vendedor_id`;
