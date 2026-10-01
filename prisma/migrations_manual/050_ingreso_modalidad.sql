-- Cómo entra el vehículo a la agencia: en consignación, comprado o recibido en
-- permuta (parte de pago).
--
-- Las tres modalidades comparten la toma: el titular, los papeles del auto, su
-- tenencia y sus imágenes son los mismos, y un mismo dominio no puede estar
-- tomado dos veces sea cual sea la modalidad. Lo único que cambia es el
-- contrato: la consignación usa `consignacion_contratos` y la compra y la
-- permuta usan `compraventa_contratos` (migración 052).
--
-- DEFAULT 'consignacion': todos los ingresos que ya existen son consignaciones.
-- La modalidad no se edita después del alta: cambiarla dejaría colgado un
-- contrato del tipo equivocado.
--
-- Rollback:
--   ALTER TABLE `consignacion_ingresos` DROP INDEX `idx_modalidad`, DROP COLUMN `modalidad`;

ALTER TABLE `consignacion_ingresos`
  ADD COLUMN `modalidad` ENUM('consignacion','compra','permuta') NOT NULL DEFAULT 'consignacion' AFTER `cliente_id`,
  ADD INDEX `idx_modalidad` (`deleted_at`, `modalidad`, `estado`);
