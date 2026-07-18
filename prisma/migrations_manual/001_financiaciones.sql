-- Migración manual: Financiación de clientes.
-- El proyecto usa `prisma db pull` (la DB es la fuente de verdad), por eso el
-- esquema se cambia con SQL y luego se sincroniza el cliente de Prisma:
--   1) Ejecutar este SQL contra la base MySQL de la agencia.
--   2) cd web/backend && npm run prisma:pull && npm run prisma:generate
--
-- Cambios:
--   - Se agrega `dni` a `clientes` (dato de identidad de la persona).
--   - Se crea `financiaciones` (1 cliente → N planes de financiación).
--   - Self-delete: baja lógica con `deleted_at` (nunca se borra la fila).

ALTER TABLE `clientes`
  ADD COLUMN `dni` VARCHAR(20) NULL AFTER `telefono`;

CREATE TABLE `financiaciones` (
  `id`              INT UNSIGNED       NOT NULL AUTO_INCREMENT,
  `cliente_id`      INT UNSIGNED       NOT NULL,
  `cantidad_cuotas` SMALLINT UNSIGNED  NOT NULL,
  `precio_cuota`    DECIMAL(12,2)      NOT NULL,
  `dia_pago`        TINYINT UNSIGNED   NOT NULL,
  `activo`          TINYINT(1)         NOT NULL DEFAULT 1,
  `created_at`      DATETIME           NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      DATETIME           NULL DEFAULT CURRENT_TIMESTAMP,
  `deleted_at`      DATETIME           NULL,
  PRIMARY KEY (`id`),
  KEY `idx_cliente` (`cliente_id`),
  KEY `idx_activo` (`activo`),
  CONSTRAINT `financiaciones_ibfk_1`
    FOREIGN KEY (`cliente_id`) REFERENCES `clientes` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
