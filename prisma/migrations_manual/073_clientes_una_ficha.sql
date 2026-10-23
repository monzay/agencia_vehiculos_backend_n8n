-- Una persona = una ficha de cliente (fase 1 de la normalización, 18/10/2026).
--
-- Hoy la misma persona queda en varias fichas: la del bot (número de WhatsApp en
-- `canal_id`, sin teléfono ni DNI), la de la financiación web (`canal_id` = el
-- teléfono otra vez) y la del trámite presencial (`canal_id` = el DNI otra vez).
-- Esta migración solo AGREGA lo necesario para unificarlas; no borra nada:
--
-- 1) `clientes.deleted_at`: borrado lógico. Una ficha fusionada se archiva.
-- 2) `clientes.fusionado_en_id`: con qué ficha se fusionó (FK a la misma tabla).
--    Una ficha fusionada siempre está archivada (CHECK).
-- 3) Índices por `telefono` y `dni`: las tres puertas que crean clientes buscan
--    por ahí antes de crear.
-- 4) `cliente_canales`: el identificador de cada persona en WhatsApp, Facebook o
--    Instagram (hoy mezclado en `canal_id`). Una persona puede tener varios
--    canales; cada identificador pertenece a una sola ficha (UNIQUE).
-- 5) `cliente_fusiones`: registro de cada fusión, con las filas que se movieron
--    de tabla en tabla, para poder auditarla y deshacerla a mano.
-- 6) `canal_id` pasa a admitir NULL: el código nuevo ya no lo escribe. Sale en la 074.
-- 7) Copia los identificadores de WhatsApp/Facebook/Instagram que hoy están en
--    `canal_id` a `cliente_canales`.
--
-- En producción: aplicar después de 057-072 y ANTES del backend nuevo (el backend
-- viejo sigue andando con esta tabla: escribe `canal_id`, que todavía existe).
-- Ojo: el workflow viejo de n8n (bot "agencia") escribía `clientes` directo con
-- `canal_id`; tiene que estar apagado antes de la 074.
-- Chequeo previo (debe dar 0 filas: un identificador repetido rompería el UNIQUE):
--   SELECT canal, canal_id, COUNT(*) n FROM clientes WHERE canal IN ('whatsapp','facebook','instagram') GROUP BY canal, canal_id HAVING n > 1;
--
-- Cómo aplicarla: a mano y con backup previo (`desplegar-produccion.mjs` solo conoce 055-056).
-- * Ensayarla antes en MySQL 8.4, la versión de producción (la base local es 9.5), con un volcado
--   de producción, y mirar qué ALGORITHM y LOCK usa cada sentencia: el ALTER agrega columnas,
--   índices, una FK y un CHECK, y cambia `canal_id` a NULL. No forzar ALGORITHM ni LOCK: que MySQL elija.
-- * Todo en UNA sola sesión (el cliente `mysql`, no un pool de conexiones): el SET vale solo para la
--   conexión donde se corre. La primera sentencia, `SET SESSION lock_wait_timeout = 10`, limita a
--   10 segundos la espera por el bloqueo de metadatos: el default es de un año, y un ALTER que lo
--   espera (por una transacción larga abierta sobre `clientes`) frena también todas las consultas
--   nuevas a la tabla. Si vence (error 1205), reintentar cuando no haya transacciones largas.
-- * Sentencia por sentencia (el SET, el ALTER, los dos CREATE y el INSERT) y, después de cada una,
--   verificar con `SHOW CREATE TABLE clientes` (y con `cliente_canales` / `cliente_fusiones` cuando
--   ya existan).
-- * El DDL confirma solo (MySQL hace un commit por cada sentencia): el archivo no es una
--   transacción. Una 073 a medias NO se puede volver a correr entera: el ALTER ya aplicado falla
--   por columna repetida y los CREATE por tabla existente. `SHOW CREATE TABLE` dice hasta dónde
--   llegó y se sigue desde la sentencia que falta. El INSERT final es una sola sentencia: si falla
--   no queda nada a medias y se repite solo ese INSERT.
-- Efecto visible: ninguno. La unificación de fichas la hace `scripts/unificar-clientes.js`.
--
-- Rollback (sin fusiones hechas; si las hubo, primero deshacerlas con `cliente_fusiones`).
-- Si la 074 ya está aplicada, primero va su rollback: el índice funcional `uq_clientes_dni_vigente`
-- usa `deleted_at` y MySQL no deja borrar una columna mientras un índice funcional la usa.
-- Las fichas que creó el backend nuevo tienen `canal_id` NULL y el MODIFY ... NOT NULL fallaría.
-- Antes se les completa: a las de mensajería, con su identificador de `cliente_canales`; a las
-- demás, con uno propio:
--   UPDATE `clientes` c JOIN `cliente_canales` k ON k.cliente_id = c.id AND k.canal = c.canal SET c.canal_id = k.identificador WHERE c.canal_id IS NULL;
--   UPDATE `clientes` SET `canal_id` = CONCAT(`canal`, '-', `id`) WHERE `canal_id` IS NULL;
--   DROP TABLE `cliente_fusiones`;
--   DROP TABLE `cliente_canales`;
--   ALTER TABLE `clientes` DROP CHECK `chk_cliente_fusionado_archivado`, DROP FOREIGN KEY `clientes_fusionado_en_fk`,
--     DROP INDEX `idx_clientes_fusionado_en`, DROP INDEX `idx_clientes_telefono`, DROP INDEX `idx_clientes_dni`,
--     DROP COLUMN `fusionado_en_id`, DROP COLUMN `deleted_at`, MODIFY COLUMN `canal_id` VARCHAR(120) NOT NULL;

SET SESSION lock_wait_timeout = 10;

ALTER TABLE `clientes`
  MODIFY COLUMN `canal_id` VARCHAR(120) NULL,
  ADD COLUMN `deleted_at` DATETIME NULL,
  ADD COLUMN `fusionado_en_id` INT UNSIGNED NULL,
  ADD KEY `idx_clientes_fusionado_en` (`fusionado_en_id`),
  ADD KEY `idx_clientes_telefono` (`telefono`),
  ADD KEY `idx_clientes_dni` (`dni`),
  ADD CONSTRAINT `clientes_fusionado_en_fk` FOREIGN KEY (`fusionado_en_id`) REFERENCES `clientes` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `chk_cliente_fusionado_archivado` CHECK (`fusionado_en_id` IS NULL OR `deleted_at` IS NOT NULL);

CREATE TABLE `cliente_canales` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `cliente_id` INT UNSIGNED NOT NULL,
  `canal` ENUM('whatsapp', 'facebook', 'instagram') NOT NULL,
  `identificador` VARCHAR(120) NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_canal_identificador` (`canal`, `identificador`),
  KEY `idx_cliente_canales_cliente` (`cliente_id`),
  CONSTRAINT `cliente_canales_cliente_fk` FOREIGN KEY (`cliente_id`) REFERENCES `clientes` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `cliente_fusiones` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `origen_id` INT UNSIGNED NOT NULL,
  `destino_id` INT UNSIGNED NOT NULL,
  `motivo` ENUM('mismo_dni', 'mismo_telefono', 'manual') NOT NULL,
  `detalle` JSON NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_fusiones_origen` (`origen_id`),
  KEY `idx_fusiones_destino` (`destino_id`),
  CONSTRAINT `cliente_fusiones_origen_fk` FOREIGN KEY (`origen_id`) REFERENCES `clientes` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `cliente_fusiones_destino_fk` FOREIGN KEY (`destino_id`) REFERENCES `clientes` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO `cliente_canales` (`cliente_id`, `canal`, `identificador`, `created_at`)
  SELECT `id`, `canal`, `canal_id`, COALESCE(`created_at`, NOW())
  FROM `clientes`
  WHERE `canal` IN ('whatsapp', 'facebook', 'instagram') AND `canal_id` IS NOT NULL AND `canal_id` <> '';
