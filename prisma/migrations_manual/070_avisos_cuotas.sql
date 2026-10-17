-- Recordatorios de cuotas por WhatsApp (plan del 13/10/2026, decisiones del 15/10/2026).
--
-- 1) `financiaciones.avisos_baja_at`: el cliente respondió BAJA (o el admin le
--    apagó los avisos). NULL = recibe avisos.
--
-- 2) `financiacion_avisos`: cada recordatorio que se intentó mandar. Uno por
--    financiación, cuota y día de aviso (3, 1 o 0 días antes): la clave única
--    impide mandar dos veces el mismo aunque n8n corra dos veces. `telefono` es
--    el número al que salió (54 + 10 dígitos): así se reconoce la respuesta del
--    cliente aunque escriba desde una ficha de WhatsApp distinta a la de la
--    financiación.
--
-- 3) `financiacion_alertas`: lo que Agustina le avisa al administrador cuando el
--    cliente responde (va a pagar en la agencia, por transferencia, ya pagó, no
--    puede pagar, número equivocado) y las bajas. Solo las ve el admin, en
--    Financiación. Una por aviso y tipo: si el cliente repite lo mismo, no se
--    duplica. Mientras haya un "número equivocado" sin atender, a esa
--    financiación no se le mandan avisos.
--
-- 4) El agente (usuario `agente_ia`, 067) solo puede CREAR alertas, y solo con
--    las columnas que completa (no puede marcarlas como atendidas). No lee los
--    avisos: el backend le pasa la financiación en el contexto.
--
-- Columnas nuevas y nulas, tablas nuevas: no toca filas existentes.
--
-- Rollback:
--   REVOKE INSERT (`financiacion_id`, `aviso_id`, `tipo`, `detalle`, `created_at`) ON `agencia`.`financiacion_alertas` FROM 'agente_ia'@'%';
--   DROP TABLE `financiacion_alertas`;
--   DROP TABLE `financiacion_avisos`;
--   ALTER TABLE `financiaciones` DROP COLUMN `avisos_baja_at`;

ALTER TABLE `financiaciones`
  ADD COLUMN `avisos_baja_at` DATETIME NULL AFTER `telefono_alt`;

CREATE TABLE `financiacion_avisos` (
  `id`              INT UNSIGNED      NOT NULL AUTO_INCREMENT,
  `financiacion_id` INT UNSIGNED      NOT NULL,
  `numero`          SMALLINT UNSIGNED NOT NULL,
  `vencimiento`     DATE              NOT NULL,
  `dias_antes`      TINYINT UNSIGNED  NOT NULL,
  `telefono`        VARCHAR(20)       NULL,
  `estado`          ENUM('pendiente', 'enviado', 'fallo', 'sin_aviso') NOT NULL DEFAULT 'pendiente',
  `wamid`           VARCHAR(128)      NULL,
  `error`           VARCHAR(200)      NULL,
  `enviado_at`      DATETIME          NULL,
  `created_at`      DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_aviso_cuota_dia` (`financiacion_id`, `numero`, `dias_antes`),
  KEY `idx_aviso_telefono` (`telefono`, `created_at`),
  CONSTRAINT `financiacion_avisos_fk` FOREIGN KEY (`financiacion_id`) REFERENCES `financiaciones` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `financiacion_alertas` (
  `id`              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `financiacion_id` INT UNSIGNED NOT NULL,
  `aviso_id`        INT UNSIGNED NULL,
  `tipo`            ENUM('pagara_en_agencia', 'transferencia', 'ya_pago', 'no_puede_pagar', 'numero_equivocado', 'baja', 'otro') NOT NULL,
  `detalle`         VARCHAR(300) NULL,
  `atendida_at`     DATETIME     NULL,
  `atendida_por`    VARCHAR(120) NULL,
  `created_at`      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_alerta_aviso_tipo` (`aviso_id`, `tipo`),
  KEY `idx_alerta_pendiente` (`atendida_at`, `created_at`),
  KEY `idx_alerta_financiacion` (`financiacion_id`),
  CONSTRAINT `financiacion_alertas_fk` FOREIGN KEY (`financiacion_id`) REFERENCES `financiaciones` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `financiacion_alertas_aviso_fk` FOREIGN KEY (`aviso_id`) REFERENCES `financiacion_avisos` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

GRANT INSERT (`financiacion_id`, `aviso_id`, `tipo`, `detalle`, `created_at`) ON `agencia`.`financiacion_alertas` TO 'agente_ia'@'%';
