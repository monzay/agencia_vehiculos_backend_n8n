-- Entregas: fotos reales de clientes recibiendo su vehículo. Se muestran en la
-- galería del home ("Cada llave, una historia"). El admin las administra desde
-- el panel; cada entrega guarda SOLO la URL de la imagen (subida a Vercel Blob,
-- igual que las fotos de los vehículos).
--
-- No se reusa ninguna tabla existente: no es un vehículo del catálogo ni un
-- cliente del bot, es solo una imagen para vitrina. Por eso su propia tabla.
--
-- Rollback:
--   DROP TABLE `entregas`;
CREATE TABLE IF NOT EXISTS `entregas` (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  url        VARCHAR(500) NOT NULL,

  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- Soft delete, como el resto de las tablas de negocio.
  deleted_at DATETIME NULL,

  PRIMARY KEY (id),
  -- La galería lista las vigentes de la más nueva a la más vieja.
  INDEX idx_vigentes (deleted_at, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Semilla: las 6 fotos que hasta ahora estaban hardcodeadas en el front, para
-- que el home no quede vacío tras la migración. Solo se cargan si la tabla está
-- vacía (idempotente si el archivo se corre más de una vez).
INSERT INTO `entregas` (`url`)
SELECT v.url FROM (
  SELECT '/images/cliente8.jpeg' AS url UNION ALL
  SELECT '/images/cliente2.jpeg' UNION ALL
  SELECT '/images/cliente3.jpeg' UNION ALL
  SELECT '/images/cliente4.jpeg' UNION ALL
  SELECT '/images/cliente5.jpeg' UNION ALL
  SELECT '/images/cliente6.jpeg'
) AS v
WHERE NOT EXISTS (SELECT 1 FROM `entregas`);
