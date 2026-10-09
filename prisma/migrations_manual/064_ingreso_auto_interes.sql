-- El auto que compra el cliente se elige al crear el trámite (parte de pago o
-- venta al contado), no al cargar el boleto. El boleto lo toma de acá.
--
-- Relleno de las filas existentes, solo con datos que constan:
--   - el auto del boleto (`compraventa_contratos.auto_entregado_id`);
--   - si no hay boleto, el auto de la seña de la que nació el trámite.
-- El resto queda en NULL y se elige en Editar trámite.
--
-- Rollback:
--   ALTER TABLE `consignacion_ingresos`
--     DROP FOREIGN KEY `consignacion_ingresos_auto_interes_fk`,
--     DROP INDEX `idx_auto_interes`,
--     DROP COLUMN `auto_interes_id`;

ALTER TABLE `consignacion_ingresos`
  ADD COLUMN `auto_interes_id` INT UNSIGNED NULL AFTER `parte_pago_efectivo`,
  ADD INDEX `idx_auto_interes` (`auto_interes_id`),
  ADD CONSTRAINT `consignacion_ingresos_auto_interes_fk`
    FOREIGN KEY (`auto_interes_id`) REFERENCES `autos` (`id`)
    ON DELETE RESTRICT ON UPDATE RESTRICT;

UPDATE `consignacion_ingresos` i
  JOIN `compraventa_contratos` c ON c.`ingreso_id` = i.`id` AND c.`deleted_at` IS NULL
  SET i.`auto_interes_id` = c.`auto_entregado_id`
  WHERE i.`modalidad` IN ('permuta', 'contado') AND c.`auto_entregado_id` IS NOT NULL;

UPDATE `consignacion_ingresos` i
  JOIN `senas` s ON s.`ingreso_id` = i.`id` AND s.`deleted_at` IS NULL
  SET i.`auto_interes_id` = s.`auto_id`
  WHERE i.`auto_interes_id` IS NULL;
