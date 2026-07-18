-- Fase 4 de normalización: renombrar la tabla `chat_estado` a `sesiones`
-- (representa la sesión de conversación). Es metadata-only e instantáneo.
-- MySQL actualiza solo las FKs que la referencian (vehiculo_cliente).
--
-- En Prisma se mantiene el modelo llamado `chat_estado` con @@map("sesiones")
-- para no tocar el código del backend que usa prisma.chat_estado.
--
-- Rollback: RENAME TABLE `sesiones` TO `chat_estado`;

RENAME TABLE `chat_estado` TO `sesiones`;
