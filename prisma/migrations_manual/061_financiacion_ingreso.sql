-- Financiación del saldo de una parte de pago: la financiación queda ligada al
-- trámite (`consignacion_ingresos`) de donde sale el saldo que se financia.
--
-- NULL = financiación suelta, como todas las anteriores. No es UNIQUE a
-- propósito: el borrado es lógico (deleted_at) y una financiación borrada no
-- tiene que impedir crear otra para el mismo trámite. Que haya una sola
-- vigente por trámite lo controla el servicio.
--
-- Columna nueva y opcional: no toca filas existentes.
--
-- Rollback:
--   ALTER TABLE `financiaciones`
--     DROP FOREIGN KEY `financiaciones_ingreso_fk`,
--     DROP INDEX `idx_ingreso`,
--     DROP COLUMN `ingreso_id`;

ALTER TABLE `financiaciones`
  ADD COLUMN `ingreso_id` INT UNSIGNED NULL AFTER `cliente_id`,
  ADD INDEX `idx_ingreso` (`ingreso_id`),
  ADD CONSTRAINT `financiaciones_ingreso_fk`
    FOREIGN KEY (`ingreso_id`) REFERENCES `consignacion_ingresos` (`id`)
    ON DELETE RESTRICT ON UPDATE RESTRICT;
