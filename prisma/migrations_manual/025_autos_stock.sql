-- Stock: unidades disponibles del vehículo.
-- Hasta ahora `autos` solo tenía `disponible` (booleano publicado/no publicado),
-- que no distingue "una unidad" de "varias". Se agrega la cantidad como columna atómica.
-- Las filas existentes se asumen con 1 unidad (default).
--
-- Rollback:
--   ALTER TABLE autos DROP COLUMN stock;

ALTER TABLE `autos`
  ADD COLUMN `stock` SMALLINT UNSIGNED NOT NULL DEFAULT 1 AFTER `kms`;
