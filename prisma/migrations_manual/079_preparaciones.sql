-- Preparación de usados: de recibir un auto en compra o parte de pago a publicarlo (pedido del dueño
-- del 09/10/2026, retomado el 03/11/2026). Reemplaza a la 065 que se había planeado y nunca se usó.
-- Spec: openspec/changes/preparacion-usados.
--
-- Una fila por trámite. Entra al firmar el boleto. Al desfirmar se borra de forma lógica, y al volver a
-- firmar se reactiva con lo que ya tenía cargado.
-- `estado` es el avance interno. Publicado y Vendido no se guardan: salen de `autos`.
-- Las fotos no están acá: viven en `consignacion_ingresos.fotos_json`, igual que en una consignación.
--
-- `agente_ia` (067) no recibe permisos sobre esta tabla: el bot ve la ficha de `autos`.
--
-- Backfill: los boletos ya firmados de compras y de partes de pago con usado entran con la fecha de
-- la firma. No toca filas existentes de otras tablas. En producción se aplica antes del backend.
--
-- Rollback:
--   DROP TABLE `preparaciones`;

CREATE TABLE `preparaciones` (
  `id`           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `ingreso_id`   INT UNSIGNED NOT NULL,
  `estado`       ENUM('recibido','en_preparacion','listo') NOT NULL DEFAULT 'recibido',
  `precio_venta` DECIMAL(12,2) NULL,
  `descripcion`  TEXT NULL,
  `auto_id`      INT UNSIGNED NULL,
  `created_at`   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `deleted_at`   DATETIME NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ingreso` (`ingreso_id`),
  UNIQUE KEY `uq_auto` (`auto_id`),
  KEY `idx_vigentes` (`deleted_at`, `estado`),
  CONSTRAINT `preparaciones_ingreso_fk` FOREIGN KEY (`ingreso_id`) REFERENCES `consignacion_ingresos` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT `preparaciones_auto_fk` FOREIGN KEY (`auto_id`) REFERENCES `autos` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT
);

INSERT INTO `preparaciones` (`ingreso_id`, `created_at`, `updated_at`)
SELECT i.`id`, c.`firmado_at`, c.`firmado_at`
FROM `consignacion_ingresos` i
JOIN `compraventa_contratos` c ON c.`ingreso_id` = i.`id`
WHERE i.`deleted_at` IS NULL
  AND c.`deleted_at` IS NULL
  AND c.`firmado_at` IS NOT NULL
  AND (
    i.`modalidad` = 'compra'
    OR (i.`modalidad` = 'permuta' AND (COALESCE(i.`parte_pago_valor`, 0) > 0 OR COALESCE(i.`parte_pago_vehiculo`, '') <> ''))
  );
