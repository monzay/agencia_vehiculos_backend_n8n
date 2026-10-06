-- Datos de la parte de pago que se cargan al tomar el usado, antes de tener
-- el título: el vehículo que deja el cliente, escrito tal como se lo nombra
-- (el título lo reemplaza después como fuente), y el efectivo que entrega
-- además del usado.
--
-- Solo los usa la modalidad `permuta`. Columnas nuevas y opcionales: no tocan
-- filas existentes.
--
-- Rollback:
--   ALTER TABLE `consignacion_ingresos`
--     DROP COLUMN `parte_pago_vehiculo`,
--     DROP COLUMN `parte_pago_efectivo`;

ALTER TABLE `consignacion_ingresos`
  ADD COLUMN `parte_pago_vehiculo` VARCHAR(150) NULL AFTER `fotos_json`,
  ADD COLUMN `parte_pago_efectivo` DECIMAL(12,2) NULL AFTER `parte_pago_vehiculo`;
