-- Fotos del vehículo cargadas en la toma de la consignación.
--
-- Son las fotos públicas del auto (no los escaneos de papeles, que son
-- privados): la primera es la principal y van hasta 3 más. Al publicar el
-- ingreso pasan a `autos.fotos_json`, con el mismo formato que ya usa el
-- catálogo.
--
-- Columna nueva y opcional: no toca filas existentes.
--
-- Rollback:
--   ALTER TABLE `consignacion_ingresos` DROP COLUMN `fotos_json`;

ALTER TABLE `consignacion_ingresos`
  ADD COLUMN `fotos_json` JSON NULL AFTER `km_recepcion`;
