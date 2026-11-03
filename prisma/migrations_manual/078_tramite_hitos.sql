-- Cobrado, Entregado y Transferido de una venta (pedido del dueño del 03/11/2026).
-- Spec: openspec/changes/cierre-venta.
--
-- Un hito por tipo y trámite: desmarcar es borrado lógico y volver a marcar reactiva la misma fila.
-- `fecha` es el día en que pasó de verdad. No reemplaza a `compraventa_contratos.entrega_at`, que es
-- lo pactado e impreso en el boleto firmado.
-- El cobro es una marca con fecha: no es una caja ni registra montos.
--
-- `entregas.ingreso_id`: de qué trámite salió la foto de la galería. Queda nulo en las fotos anteriores
-- y en las que se suben desde la sección Entregas.
--
-- Tabla y columna nuevas: no tocan filas existentes. En producción se aplica antes del backend.
--
-- Rollback:
--   ALTER TABLE `entregas` DROP FOREIGN KEY `entregas_ingreso_fk`, DROP INDEX `idx_entrega_ingreso`, DROP COLUMN `ingreso_id`;
--   DROP TABLE `tramite_hitos`;

CREATE TABLE `tramite_hitos` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `ingreso_id` INT UNSIGNED NOT NULL,
  `tipo`       ENUM('cobrado','entregado','transferido') NOT NULL,
  `fecha`      DATE NOT NULL,
  `creado_por` INT UNSIGNED NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ingreso_tipo` (`ingreso_id`, `tipo`),
  KEY `tramite_hitos_usuario_fk` (`creado_por`),
  CONSTRAINT `tramite_hitos_ingreso_fk` FOREIGN KEY (`ingreso_id`) REFERENCES `consignacion_ingresos` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT `tramite_hitos_usuario_fk` FOREIGN KEY (`creado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT
);

ALTER TABLE `entregas`
  ADD COLUMN `ingreso_id` INT UNSIGNED NULL AFTER `cliente_id`,
  ADD INDEX `idx_entrega_ingreso` (`ingreso_id`),
  ADD CONSTRAINT `entregas_ingreso_fk` FOREIGN KEY (`ingreso_id`) REFERENCES `consignacion_ingresos` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT;
