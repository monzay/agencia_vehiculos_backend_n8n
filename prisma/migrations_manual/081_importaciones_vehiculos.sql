-- Importar la lista de vehículos desde un PDF, una imagen o una foto (pedido del dueño del 10/11/2026).
-- Spec: openspec/changes/importar-lista-vehiculos.
--
-- `importaciones_vehiculos`: una fila por lista confirmada, con quién la cargó y cuántos autos creó y
--   salteó. `creados` es la foto de ese momento (auditoría): no se recalcula si después se archiva un auto.
-- `importaciones_vehiculos_archivos`: los archivos de cada importación. `huella` es el SHA-256 del archivo
--   original y es única: el mismo archivo no se importa dos veces. No tiene borrado lógico propio porque
--   depende de su importación. Si algún día se ofrece "deshacer importación", tiene que liberar la huella.
-- `autos.version`: la versión del modelo ("1.6 Pack I"), aparte del modelo (1FN). Los autos ya cargados la
--   tienen dentro de `modelo` y quedan como están.
-- `autos.importacion_id`: de qué lista salió el auto. Queda nulo en los cargados a mano.
--
-- Tablas y columnas nuevas: no cambian datos existentes. En producción se aplica antes del backend, que lee
-- `version` en cada consulta de autos. El usuario `agente_ia` no recibe permiso: el bot no usa estos datos.
-- El ALTER de `autos` agrega una FK, así que MySQL reconstruye la tabla (ALGORITHM=COPY) y frena las
-- escrituras mientras dura: con el stock actual son segundos, pero conviene aplicarlo en un momento tranquilo.
-- Antes de aplicar, verificar que no existan `autos.version` ni `autos.importacion_id`.
--
-- Rollback (volver primero al backend anterior y a su `schema.prisma`, y correr `prisma generate`).
-- Borra las versiones y el registro de importaciones: antes, respaldar
--   SELECT id, ref, version, importacion_id FROM autos WHERE version IS NOT NULL OR importacion_id IS NOT NULL;
-- y si hay que retirar los autos importados, hacerlo por esos ids exactos.
--   ALTER TABLE `autos` DROP FOREIGN KEY `autos_importacion_fk`, DROP INDEX `idx_auto_importacion`,
--     DROP COLUMN `importacion_id`, DROP COLUMN `version`;
--   DROP TABLE `importaciones_vehiculos_archivos`;
--   DROP TABLE `importaciones_vehiculos`;

CREATE TABLE `importaciones_vehiculos` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `usuario_id` INT UNSIGNED NULL,
  `creados`    SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `omitidos`   SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  KEY `importaciones_vehiculos_usuario_fk` (`usuario_id`),
  CONSTRAINT `importaciones_vehiculos_usuario_fk` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `importaciones_vehiculos_archivos` (
  `id`             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `importacion_id` INT UNSIGNED NOT NULL,
  `huella`         CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `pathname`       VARCHAR(200) NOT NULL,
  `created_at`     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_importacion_huella` (`huella`),
  KEY `importaciones_archivos_importacion_fk` (`importacion_id`),
  CONSTRAINT `importaciones_archivos_importacion_fk` FOREIGN KEY (`importacion_id`) REFERENCES `importaciones_vehiculos` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT `importaciones_archivos_huella_valida` CHECK (`huella` REGEXP '^[0-9a-f]{64}$')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `autos`
  ADD COLUMN `version` VARCHAR(80) NULL AFTER `modelo`,
  ADD COLUMN `importacion_id` INT UNSIGNED NULL AFTER `descuento_id`,
  ADD INDEX `idx_auto_importacion` (`importacion_id`),
  ADD CONSTRAINT `autos_importacion_fk` FOREIGN KEY (`importacion_id`) REFERENCES `importaciones_vehiculos` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT;
