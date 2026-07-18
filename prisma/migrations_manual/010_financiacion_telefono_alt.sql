-- #9: teléfono alternativo (opcional) en la financiación.
-- Rollback: ALTER TABLE financiaciones DROP COLUMN telefono_alt;

ALTER TABLE `financiaciones`
  ADD COLUMN `telefono_alt` VARCHAR(30) NULL AFTER `dia_pago`;
