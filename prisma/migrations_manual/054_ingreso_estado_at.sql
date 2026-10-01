-- Cuándo entró el ingreso a su estado actual (publicado, retirado o de vuelta
-- en recepción). `updated_at` no sirve para eso: cambia con cualquier edición.
--
-- Las filas que ya existen quedan en NULL a propósito: no hay registro de
-- cuándo cambiaron de estado y una fecha inventada sería peor que ninguna.
--
-- Rollback:
--   ALTER TABLE `consignacion_ingresos` DROP COLUMN `estado_at`;

ALTER TABLE `consignacion_ingresos`
  ADD COLUMN `estado_at` DATETIME NULL AFTER `estado`;
