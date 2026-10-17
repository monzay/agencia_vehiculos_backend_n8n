-- Base del agente vendedor con IA (bot con razonamiento).
--
-- 1) `sesiones`: marca "requiere vendedor". La pone el agente cuando deriva la
--    charla a una persona, y el backend cuando se alcanza el tope de gasto o el
--    límite de mensajes del cliente. El panel destaca esas consultas.
--
-- 2) `ia_consumos`: una fila por cada llamada a Claude o a Groq, con su costo
--    en dólares. El gasto del mes se calcula sumando estas filas, y de ahí sale
--    el tope por agencia. Es un registro contable: solo se insertan filas, no se
--    editan ni se borran, por eso no lleva `deleted_at`.
--    `created_at` va en UTC, como el resto de la base; el corte del mes se hace
--    en hora de Argentina desde el backend.
--
-- 3) `verificacion_intentos`: cada vez que el agente verifica el DNI de un
--    cliente para mostrarle su financiación. Con 3 fallos en 24 h se bloquea
--    sin comparar (contra la fuerza bruta). Solo se insertan filas.
--
-- Columnas nuevas con valor por defecto y tablas nuevas: no toca filas existentes.
--
-- Rollback:
--   DROP TABLE `verificacion_intentos`;
--   DROP TABLE `ia_consumos`;
--   ALTER TABLE `sesiones`
--     DROP KEY `idx_requiere_vendedor`,
--     DROP COLUMN `requiere_vendedor_at`,
--     DROP COLUMN `requiere_vendedor_motivo`,
--     DROP COLUMN `requiere_vendedor`;

ALTER TABLE `sesiones`
  ADD COLUMN `requiere_vendedor`        TINYINT(1)   NOT NULL DEFAULT 0 AFTER `bot_pausado`,
  ADD COLUMN `requiere_vendedor_motivo` VARCHAR(120) NULL AFTER `requiere_vendedor`,
  ADD COLUMN `requiere_vendedor_at`     DATETIME     NULL AFTER `requiere_vendedor_motivo`,
  ADD KEY `idx_requiere_vendedor` (`requiere_vendedor`);

CREATE TABLE `ia_consumos` (
  `id`                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `sesion_id`             INT UNSIGNED NULL,
  `cliente_id`            INT UNSIGNED NULL,
  `proveedor`             ENUM('claude','groq') NOT NULL,
  `modelo`                VARCHAR(60) NOT NULL,
  `input_tokens`          INT UNSIGNED NOT NULL DEFAULT 0,
  `cache_creation_tokens` INT UNSIGNED NOT NULL DEFAULT 0,
  `cache_read_tokens`     INT UNSIGNED NOT NULL DEFAULT 0,
  `output_tokens`         INT UNSIGNED NOT NULL DEFAULT 0,
  `segundos_audio`        DECIMAL(8,2) NOT NULL DEFAULT 0,
  `costo_usd`             DECIMAL(12,6) NOT NULL,
  `created_at`            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_created` (`created_at`),
  KEY `idx_cliente_created` (`cliente_id`, `created_at`),
  KEY `idx_sesion` (`sesion_id`),
  CONSTRAINT `ia_consumos_sesion_fk` FOREIGN KEY (`sesion_id`) REFERENCES `sesiones` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT `ia_consumos_cliente_fk` FOREIGN KEY (`cliente_id`) REFERENCES `clientes` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `ia_consumos_costo_valido` CHECK (`costo_usd` >= 0 AND `segundos_audio` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `verificacion_intentos` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `cliente_id` INT UNSIGNED NOT NULL,
  `ok`         TINYINT(1) NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_cliente_ok_created` (`cliente_id`, `ok`, `created_at`),
  CONSTRAINT `verificacion_intentos_cliente_fk` FOREIGN KEY (`cliente_id`) REFERENCES `clientes` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
