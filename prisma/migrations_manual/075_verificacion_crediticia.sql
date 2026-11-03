-- Verificación crediticia con la Central de Deudores del BCRA (decisiones del 01/11/2026).
-- Spec: openspec/specs/agente-credito/spec.md.
--
-- 1) `clientes.cuil`: el CUIL que da el cliente por WhatsApp (11 dígitos, validado con
--    su dígito verificador y contra el DNI de la ficha antes de guardarse). Es un dato de
--    la persona: vive en su ficha, no en cada consulta.
--
-- 2) `terminos_versiones`: el texto de privacidad que publica la agencia (página pública
--    /privacidad). Publicar crea una versión nueva; la vigente es la última no archivada.
--    Las anteriores no se borran: cada consentimiento apunta a la que aceptó.
--
-- 3) `consentimientos`: cada sí o no del cliente al aviso de privacidad, con la versión
--    de los términos y la fecha (Ley 25.326, art. 5 y 6). Manda el último: un no
--    posterior revoca el sí. Solo se agregan filas. `wamid` es el mensaje de WhatsApp
--    en que respondió: la prueba del consentimiento.
--
-- 4) `consultas_crediticias`: el RESUMEN de cada consulta al BCRA (semáforo, peor
--    situación, período), no la respuesta entera (minimización de datos). `estado`
--    'error' = no se pudo consultar (BCRA caído, 429): queda "sin verificar".
--    El semáforo es SOLO INFORMATIVO: no toca el puntaje ni la temperatura de la sesión.
--    `nombre_bcra`: con qué nombre tiene el BCRA ese CUIL, para que el asesor verifique
--    en persona que es quien escribió (se consulta aunque la ficha no tenga DNI).
--
-- El agente (`agente_ia`, 067) NO recibe permisos sobre estas tablas: lo hace el backend
-- con su usuario, como `consultaPorAuto`.
--
-- Columna nueva y nula, tablas nuevas: no toca filas existentes. La verificación queda
-- apagada (clave `verificacion_crediticia` de `configuracion` ausente = apagada).
--
-- Rollback:
--   DROP TABLE `consultas_crediticias`;
--   DROP TABLE `consentimientos`;
--   DROP TABLE `terminos_versiones`;
--   ALTER TABLE `clientes` DROP CHECK `chk_clientes_cuil`, DROP INDEX `idx_clientes_cuil`, DROP COLUMN `cuil`;
--   DELETE FROM `configuracion` WHERE `clave` = 'verificacion_crediticia';

ALTER TABLE `clientes`
  ADD COLUMN `cuil` CHAR(11) NULL AFTER `dni`,
  ADD KEY `idx_clientes_cuil` (`cuil`),
  ADD CONSTRAINT `chk_clientes_cuil` CHECK (`cuil` IS NULL OR `cuil` REGEXP '^[0-9]{11}$');

CREATE TABLE `terminos_versiones` (
  `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `texto`         MEDIUMTEXT   NOT NULL,
  `publicado_por` VARCHAR(120) NULL,
  `created_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `deleted_at`    DATETIME     NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `consentimientos` (
  `id`                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `cliente_id`          INT UNSIGNED NOT NULL,
  `terminos_version_id` INT UNSIGNED NOT NULL,
  `finalidad`           ENUM('consulta_crediticia') NOT NULL,
  `acepta`              TINYINT(1)   NOT NULL,
  `wamid`               VARCHAR(128) NULL,
  `created_at`          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `deleted_at`          DATETIME     NULL,
  PRIMARY KEY (`id`),
  KEY `idx_consentimiento_cliente` (`cliente_id`, `finalidad`),
  KEY `idx_consentimiento_terminos` (`terminos_version_id`),
  CONSTRAINT `consentimientos_cliente_fk` FOREIGN KEY (`cliente_id`) REFERENCES `clientes` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `consentimientos_terminos_fk` FOREIGN KEY (`terminos_version_id`) REFERENCES `terminos_versiones` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `consultas_crediticias` (
  `id`                INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  `cliente_id`        INT UNSIGNED     NOT NULL,
  `sesion_id`         INT UNSIGNED     NULL,
  `consentimiento_id` INT UNSIGNED     NOT NULL,
  `estado`            ENUM('ok', 'error') NOT NULL,
  `semaforo`          ENUM('verde', 'amarillo', 'rojo', 'sin_datos') NULL,
  `peor_situacion`    TINYINT UNSIGNED NULL,
  `periodo`           CHAR(6)          NULL,
  `nombre_bcra`       VARCHAR(120)     NULL,
  `consultado_at`     DATETIME         NOT NULL,
  `deleted_at`        DATETIME         NULL,
  PRIMARY KEY (`id`),
  KEY `idx_consulta_crediticia_cliente` (`cliente_id`, `consultado_at`),
  KEY `idx_consulta_crediticia_sesion` (`sesion_id`),
  KEY `idx_consulta_crediticia_consentimiento` (`consentimiento_id`),
  CONSTRAINT `chk_consulta_crediticia_semaforo` CHECK ((`estado` = 'ok') = (`semaforo` IS NOT NULL)),
  CONSTRAINT `consultas_crediticias_cliente_fk` FOREIGN KEY (`cliente_id`) REFERENCES `clientes` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `consultas_crediticias_sesion_fk` FOREIGN KEY (`sesion_id`) REFERENCES `sesiones` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `consultas_crediticias_consentimiento_fk` FOREIGN KEY (`consentimiento_id`) REFERENCES `consentimientos` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
