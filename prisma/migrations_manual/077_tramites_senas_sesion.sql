-- De qué consulta nació cada trámite y cada seña (pedido del dueño del 03/11/2026).
-- Spec: openspec/changes/vinculo-consulta-tramite.
--
-- No es único: si se cancela un trámite o una seña, la misma consulta puede volver a avanzar.
-- Una consulta que se borra no se lleva el trámite: el vínculo queda vacío.
-- Los trámites sin consulta (compra, consignación, cliente presencial) quedan en NULL.
--
-- `agente_ia` (067) no recibe SELECT sobre estas columnas: el bot no las usa.
--
-- Columnas nuevas y nulas: no tocan filas existentes. En producción se aplica antes del backend.
--
-- Rollback:
--   ALTER TABLE `consignacion_ingresos` DROP FOREIGN KEY `consignacion_ingresos_sesion_fk`, DROP INDEX `idx_sesion`, DROP COLUMN `sesion_id`;
--   ALTER TABLE `senas` DROP FOREIGN KEY `senas_sesion_fk`, DROP INDEX `idx_sesion`, DROP COLUMN `sesion_id`;

ALTER TABLE `consignacion_ingresos`
  ADD COLUMN `sesion_id` INT UNSIGNED NULL AFTER `cliente_id`,
  ADD INDEX `idx_sesion` (`sesion_id`),
  ADD CONSTRAINT `consignacion_ingresos_sesion_fk` FOREIGN KEY (`sesion_id`) REFERENCES `sesiones` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT;

ALTER TABLE `senas`
  ADD COLUMN `sesion_id` INT UNSIGNED NULL AFTER `cliente_id`,
  ADD INDEX `idx_sesion` (`sesion_id`),
  ADD CONSTRAINT `senas_sesion_fk` FOREIGN KEY (`sesion_id`) REFERENCES `sesiones` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT;
