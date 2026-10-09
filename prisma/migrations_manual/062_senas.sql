-- Señas: un cliente reserva un vehículo (propio o en consignación) pagando un
-- monto, antes de que exista el trámite en Documentos.
--
-- Estados guardados:
--   vigente    → el auto está reservado hasta `vence` inclusive.
--   convertida → se concretó: pasó a un trámite de parte de pago (`ingreso_id`)
--                o el auto se marcó vendido.
--   cancelada  → el cliente se arrepintió: la seña se pierde.
-- "Vencida" no se guarda: es una vigente cuyo `vence` ya pasó.
--
-- `vence` es obligatorio a propósito: la agencia decide cuánto tolera cada seña,
-- no hay plazo por defecto.
--
-- `ingreso_id` es UNIQUE: un trámite nace de una sola seña.
--
-- Tabla nueva: no toca filas existentes.
--
-- Rollback:
--   DROP TABLE `senas`;

CREATE TABLE `senas` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `auto_id`     INT UNSIGNED NOT NULL,
  `cliente_id`  INT UNSIGNED NOT NULL,
  `monto`       DECIMAL(12,2) NOT NULL,
  `forma_pago`  ENUM('efectivo','transferencia','cheque') NOT NULL DEFAULT 'efectivo',
  `senado_at`   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `vence`       DATE NOT NULL,
  `estado`      ENUM('vigente','convertida','cancelada') NOT NULL DEFAULT 'vigente',
  `estado_at`   DATETIME NULL,
  `ingreso_id`  INT UNSIGNED NULL,
  `notas`       VARCHAR(500) NULL,
  `creado_por`  INT UNSIGNED NULL,
  `created_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `deleted_at`  DATETIME NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ingreso` (`ingreso_id`),
  KEY `idx_auto_estado` (`auto_id`, `estado`),
  KEY `idx_cliente` (`cliente_id`),
  KEY `idx_vigentes` (`deleted_at`, `estado`, `vence`),
  KEY `senas_usuario_fk` (`creado_por`),
  CONSTRAINT `senas_auto_fk` FOREIGN KEY (`auto_id`) REFERENCES `autos` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `senas_cliente_fk` FOREIGN KEY (`cliente_id`) REFERENCES `clientes` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `senas_ingreso_fk` FOREIGN KEY (`ingreso_id`) REFERENCES `consignacion_ingresos` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `senas_usuario_fk` FOREIGN KEY (`creado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT `chk_senas_monto` CHECK (`monto` > 0)
);
