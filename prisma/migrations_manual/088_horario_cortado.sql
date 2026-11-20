-- Horario cortado: un día puede tener una segunda franja (p. ej. 08:00-13:00 y
-- 16:00-21:00). Hasta ahora cada día era una sola franja corrida.
--
-- `apertura_2`/`cierre_2`: "HH:MM" en 24 h, NULL si el día es corrido o cerrado.
-- La segunda franja es completa o no existe, abre después del cierre de la
-- primera y cierra después de abrir. No cambia ningún dato existente.
--
-- Rollback:
--   ALTER TABLE `horarios_atencion`
--     DROP CHECK `horarios_segunda_franja`,
--     DROP CHECK `horarios_apertura_2_fmt`,
--     DROP CHECK `horarios_cierre_2_fmt`,
--     DROP COLUMN `cierre_2`,
--     DROP COLUMN `apertura_2`;

ALTER TABLE `horarios_atencion`
  ADD COLUMN `apertura_2` CHAR(5) NULL AFTER `cierre`,
  ADD COLUMN `cierre_2`   CHAR(5) NULL AFTER `apertura_2`,
  ADD CONSTRAINT `horarios_apertura_2_fmt` CHECK (`apertura_2` IS NULL OR `apertura_2` REGEXP '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  ADD CONSTRAINT `horarios_cierre_2_fmt`   CHECK (`cierre_2`   IS NULL OR `cierre_2`   REGEXP '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  ADD CONSTRAINT `horarios_segunda_franja` CHECK (
    (`apertura_2` IS NULL AND `cierre_2` IS NULL)
    OR
    (`abierto` = 1 AND `apertura_2` IS NOT NULL AND `cierre_2` IS NOT NULL AND `apertura_2` > `cierre` AND `cierre_2` > `apertura_2`)
  );
