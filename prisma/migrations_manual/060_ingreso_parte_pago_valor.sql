-- En cuánto toma la agencia el usado de la parte de pago, cargado en el alta
-- junto al nombre del vehículo y el efectivo (migración 059).
--
-- Solo lo usa la modalidad `permuta`. Columna nueva y opcional: no toca filas
-- existentes.
--
-- Rollback:
--   ALTER TABLE `consignacion_ingresos` DROP COLUMN `parte_pago_valor`;

ALTER TABLE `consignacion_ingresos`
  ADD COLUMN `parte_pago_valor` DECIMAL(12,2) NULL AFTER `parte_pago_vehiculo`;
