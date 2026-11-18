-- Nombre y fotos del usado: columnas nuevas en `sesiones` (modelo Prisma `chat_estado`).
-- Cambio OpenSpec `ajustes-por-chats-reales`.
--
--   nombre_pedido_at       -> cuándo la asesora le pidió el nombre al cliente (una sola vez por consulta).
--   fotos_usado_pedidas_at -> cuándo le pidió las fotos del usado (abre la ventana de 24 h para recibirlas).
--   fotos_usado_json       -> pathnames del Blob privado de las fotos del usado que mandó el cliente.
--
-- SE PUEDE CORRER DOS VECES: cada columna solo se crea si todavía no existe (MySQL no tiene
-- ADD COLUMN IF NOT EXISTS). Sin relleno: las consultas anteriores quedan con NULL.
-- Sin GRANT: estas columnas las escribe el usuario del backend, no `agente_ia`.
-- Se aplica a mano, sentencia por sentencia, con el cliente mysql.
--
-- Orden al desplegar: primero esta migración y después el backend.
--
-- Rollback (con el backend anterior ya desplegado):
--   ALTER TABLE sesiones DROP COLUMN nombre_pedido_at, DROP COLUMN fotos_usado_pedidas_at, DROP COLUMN fotos_usado_json;

SET SESSION lock_wait_timeout = 10;

SET @existe_nombre = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sesiones' AND COLUMN_NAME = 'nombre_pedido_at');
SET @sql_nombre = IF(@existe_nombre = 0, 'ALTER TABLE sesiones ADD COLUMN nombre_pedido_at DATETIME NULL', 'DO 0');
PREPARE agregar_nombre FROM @sql_nombre;
EXECUTE agregar_nombre;
DEALLOCATE PREPARE agregar_nombre;

SET @existe_fotos_at = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sesiones' AND COLUMN_NAME = 'fotos_usado_pedidas_at');
SET @sql_fotos_at = IF(@existe_fotos_at = 0, 'ALTER TABLE sesiones ADD COLUMN fotos_usado_pedidas_at DATETIME NULL', 'DO 0');
PREPARE agregar_fotos_at FROM @sql_fotos_at;
EXECUTE agregar_fotos_at;
DEALLOCATE PREPARE agregar_fotos_at;

SET @existe_fotos_json = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sesiones' AND COLUMN_NAME = 'fotos_usado_json');
SET @sql_fotos_json = IF(@existe_fotos_json = 0, 'ALTER TABLE sesiones ADD COLUMN fotos_usado_json JSON NULL', 'DO 0');
PREPARE agregar_fotos_json FROM @sql_fotos_json;
EXECUTE agregar_fotos_json;
DEALLOCATE PREPARE agregar_fotos_json;
