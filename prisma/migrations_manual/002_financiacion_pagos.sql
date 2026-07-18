-- Migración manual: Pagos de cuotas de una financiación.
-- El cronograma (fecha de cada cuota, fecha de fin) se DERIVA del plan
-- (created_at + dia_pago + numero), así que no se almacena. Acá solo guardamos
-- qué cuotas ya pagó el cliente: existe fila ⇒ esa cuota está paga.
--
--   1) Ejecutar este SQL contra la base MySQL de la agencia.
--   2) cd web/backend && npm run prisma:pull && npm run prisma:generate

CREATE TABLE `financiacion_pagos` (
  `id`              INT UNSIGNED      NOT NULL AUTO_INCREMENT,
  `financiacion_id` INT UNSIGNED      NOT NULL,
  `numero`          SMALLINT UNSIGNED NOT NULL,
  `pagado_en`       DATETIME          NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at`      DATETIME          NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_financiacion_numero` (`financiacion_id`, `numero`),
  KEY `idx_financiacion` (`financiacion_id`),
  CONSTRAINT `financiacion_pagos_ibfk_1`
    FOREIGN KEY (`financiacion_id`) REFERENCES `financiaciones` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
