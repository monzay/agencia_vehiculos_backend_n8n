-- Orden de la lista de Consultas del panel: columna nueva `sesiones.orden_at` (modelo Prisma `chat_estado`).
-- Cambio OpenSpec `huecos-del-bot`.
--
--   orden_at -> la fecha por la que se ordena la lista de Consultas. Sube (se pone en el momento actual) cuando
--               la consulta se abre, cuando el cliente cambia de auto, cuando el cliente vuelve a escribir en
--               una consulta ya atendida y cuando la consulta pasa a otro asesor por link.
--
-- Relleno: las filas existentes toman `sesion_inicio`, que es la fecha por la que se ordenaba hasta hoy
-- (ORDER BY sesion_inicio DESC). Las que no tienen `sesion_inicio` reciben 1000-01-01 00:00:00: MySQL dejaba
-- los NULL al final y con una fecha vieja siguen al final, así que el orden de antes no cambia.
--
-- SE PUEDE CORRER DOS VECES: la columna y el índice solo se crean si todavía no existen (MySQL no tiene
-- ADD COLUMN IF NOT EXISTS), el relleno solo toca filas con orden_at NULL y el MODIFY es idempotente.
-- Se aplica a mano, sentencia por sentencia, con el cliente mysql.
--
-- Orden al desplegar: primero esta migración y después el backend.
--
-- Rollback (con el backend anterior ya desplegado):
--   DROP INDEX idx_orden_at ON sesiones;
--   ALTER TABLE sesiones DROP COLUMN orden_at;

SET SESSION lock_wait_timeout = 10;

SET @existe_columna = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sesiones' AND COLUMN_NAME = 'orden_at');
SET @sql_columna = IF(@existe_columna = 0, 'ALTER TABLE sesiones ADD COLUMN orden_at DATETIME NULL', 'DO 0');
PREPARE agregar_columna FROM @sql_columna;
EXECUTE agregar_columna;
DEALLOCATE PREPARE agregar_columna;

UPDATE sesiones SET orden_at = COALESCE(sesion_inicio, '1000-01-01 00:00:00') WHERE orden_at IS NULL;

ALTER TABLE sesiones MODIFY orden_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;

SET @existe_indice = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sesiones' AND INDEX_NAME = 'idx_orden_at');
SET @sql_indice = IF(@existe_indice = 0, 'CREATE INDEX idx_orden_at ON sesiones (orden_at)', 'DO 0');
PREPARE crear_indice FROM @sql_indice;
EXECUTE crear_indice;
DEALLOCATE PREPARE crear_indice;
