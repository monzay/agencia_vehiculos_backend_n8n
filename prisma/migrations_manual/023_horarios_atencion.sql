-- Horarios de atención de la agencia: una fila por día de la semana.
-- Es dato tipado (horas y un flag por día), no un par clave-valor, así que va en
-- su propia tabla y no en `configuracion` (donde `valor` es VARCHAR).
--
-- `dia`: 0=Domingo … 6=Sábado (convención JS getDay(); así el bot sabe, leyendo
--   el día actual, si en este momento la agencia está abierta).
-- `apertura`/`cierre`: "HH:MM" en 24 h. NULL cuando el día está cerrado.
--
-- Rollback:
--   DROP TABLE `horarios_atencion`;

CREATE TABLE IF NOT EXISTS `horarios_atencion` (
  `dia`        TINYINT UNSIGNED NOT NULL,
  `abierto`    TINYINT(1)   NOT NULL DEFAULT 1,
  `apertura`   CHAR(5)      NULL,
  `cierre`     CHAR(5)      NULL,
  `updated_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`dia`),
  CONSTRAINT `horarios_dia_valido`   CHECK (`dia` BETWEEN 0 AND 6),
  CONSTRAINT `horarios_apertura_fmt` CHECK (`apertura` IS NULL OR `apertura` REGEXP '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  CONSTRAINT `horarios_cierre_fmt`   CHECK (`cierre`   IS NULL OR `cierre`   REGEXP '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  -- Coherencia: abierto ⇒ ambas horas cargadas; cerrado ⇒ ninguna.
  CONSTRAINT `horarios_coherencia` CHECK (
    (`abierto` = 1 AND `apertura` IS NOT NULL AND `cierre` IS NOT NULL)
    OR
    (`abierto` = 0 AND `apertura` IS NULL AND `cierre` IS NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Semilla: las 7 filas para que el panel siempre tenga la semana completa que
-- editar. Por defecto Lunes a Viernes 09–18, Sábado 09–13 y Domingo cerrado.
INSERT IGNORE INTO `horarios_atencion` (`dia`, `abierto`, `apertura`, `cierre`) VALUES
  (1, 1, '09:00', '18:00'),
  (2, 1, '09:00', '18:00'),
  (3, 1, '09:00', '18:00'),
  (4, 1, '09:00', '18:00'),
  (5, 1, '09:00', '18:00'),
  (6, 1, '09:00', '13:00'),
  (0, 0, NULL, NULL);
