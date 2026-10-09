-- Venta al contado y parte de pago sin usado.
--
-- 1. Nueva modalidad `contado`: la agencia vende un auto de su stock y el
--    cliente lo paga sin entregar un usado. Usa el mismo boleto que la parte de
--    pago (`compraventa_contratos` con `auto_entregado_*`).
-- 2. En la parte de pago el usado pasa a ser opcional. Sin usado, el boleto
--    guarda `precio` = 0 (el valor del usado), así que el CHECK pasa de
--    `precio > 0` a `precio >= 0`. Una compra directa sigue exigiendo precio:
--    lo valida el servicio.
--
-- No toca filas existentes.
--
-- Rollback (solo si no hay filas con modalidad 'contado' ni boletos con precio 0):
--   ALTER TABLE `compraventa_contratos` DROP CHECK `compraventa_contratos_precio_valido`;
--   ALTER TABLE `compraventa_contratos` ADD CONSTRAINT `compraventa_contratos_precio_valido`
--     CHECK (precio > 0 AND pago_en_acto >= 0);
--   ALTER TABLE `consignacion_ingresos`
--     MODIFY `modalidad` ENUM('consignacion','compra','permuta') NOT NULL DEFAULT 'consignacion';

ALTER TABLE `consignacion_ingresos`
  MODIFY `modalidad` ENUM('consignacion','compra','permuta','contado') NOT NULL DEFAULT 'consignacion';

ALTER TABLE `compraventa_contratos` DROP CHECK `compraventa_contratos_precio_valido`;
ALTER TABLE `compraventa_contratos`
  ADD CONSTRAINT `compraventa_contratos_precio_valido` CHECK (precio >= 0 AND pago_en_acto >= 0);
