-- Migración manual: configuración global del panel + control de qué asesores
-- participan en la repartición de consultas.
--
-- 1) `configuracion`: tabla clave-valor para settings globales editables desde el
--    panel del admin. Primer setting: `reparticion_equitativa` = '1'|'0'. Cuando
--    está en '0', el dashboard OCULTA quién atiende cada consulta (el bot sigue
--    asignando igual; es un toggle de visualización).
--
-- 2) `vendedores.recibe_consultas`: flag por asesor. Cuando es 0, ese asesor
--    queda EXCLUIDO del round-robin del bot (no recibe consultas nuevas). El
--    admin lo controla con un switch por asesor. Default 1 (participa).
--
-- Rollback:
--   ALTER TABLE `vendedores` DROP COLUMN `recibe_consultas`;
--   DROP TABLE `configuracion`;

CREATE TABLE IF NOT EXISTS `configuracion` (
  `clave`      VARCHAR(60)  NOT NULL,
  `valor`      VARCHAR(255) NULL,
  `updated_at` DATETIME     NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`clave`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO `configuracion` (`clave`, `valor`) VALUES ('reparticion_equitativa', '1')
  ON DUPLICATE KEY UPDATE `clave` = `clave`;

ALTER TABLE `vendedores`
  ADD COLUMN `recibe_consultas` TINYINT(1) NOT NULL DEFAULT 1 AFTER `activo`;
