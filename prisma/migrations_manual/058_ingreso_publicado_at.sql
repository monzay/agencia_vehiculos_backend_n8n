-- Cuándo se publicó el ingreso. `estado_at` guarda solo la fecha del estado
-- ACTUAL: al vender o retirar el auto se pisa y se pierde la de publicación.
--
-- Si se despublica y se vuelve a publicar, queda la última publicación.
--
-- Relleno de las filas existentes, solo con fechas que constan:
--   - publicado hoy → su `estado_at` (es justamente esa fecha);
--   - ya publicado alguna vez → la creación de su ficha en `consignaciones`,
--     que se crea al publicar por primera vez.
-- El resto queda en NULL.
--
-- Rollback:
--   ALTER TABLE `consignacion_ingresos` DROP COLUMN `publicado_at`;

ALTER TABLE `consignacion_ingresos`
  ADD COLUMN `publicado_at` DATETIME NULL AFTER `estado_at`;

UPDATE `consignacion_ingresos`
  SET `publicado_at` = `estado_at`
  WHERE `estado` = 'publicado' AND `estado_at` IS NOT NULL;

UPDATE `consignacion_ingresos` i
  JOIN `consignaciones` c ON c.`id` = i.`consignacion_id`
  SET i.`publicado_at` = c.`created_at`
  WHERE i.`publicado_at` IS NULL;
