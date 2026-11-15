-- Fotos ya enviadas: columna nueva `historial_mensajes.fotos_ref` (modelo Prisma `historial_mensajes`).
-- Cambio OpenSpec `respuestas-del-bot`.
--
--   fotos_ref -> el código (`autos.ref`) del auto cuyas fotos salieron con ese mensaje del agente.
--                NULL en todo mensaje que no llevó fotos. El agente lo usa para no decir que no mandó
--                unas fotos que sí mandó.
--
-- SE PUEDE CORRER DOS VECES: la columna solo se crea si todavía no existe (MySQL no tiene
-- ADD COLUMN IF NOT EXISTS). Sin relleno: los mensajes anteriores quedan con NULL.
-- Sin GRANT: `agente_ia` tiene los permisos de tabla (067) y el historial lo escribe el backend.
-- Se aplica a mano, sentencia por sentencia, con el cliente mysql.
--
-- Orden al desplegar: primero esta migración y después el backend.
--
-- Rollback (con el backend anterior ya desplegado):
--   ALTER TABLE historial_mensajes DROP COLUMN fotos_ref;

SET SESSION lock_wait_timeout = 10;

SET @existe_columna = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'historial_mensajes' AND COLUMN_NAME = 'fotos_ref');
SET @sql_columna = IF(@existe_columna = 0, 'ALTER TABLE historial_mensajes ADD COLUMN fotos_ref VARCHAR(30) NULL', 'DO 0');
PREPARE agregar_columna FROM @sql_columna;
EXECUTE agregar_columna;
DEALLOCATE PREPARE agregar_columna;
