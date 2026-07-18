-- Migración manual: garantizar UN SOLO admin activo a nivel de base de datos.
--
-- Regla de negocio: como máximo puede existir un usuario con rol='admin' que
-- esté vigente (self-delete: deleted_at IS NULL). Un admin borrado lógicamente
-- NO ocupa el cupo, así se puede designar un nuevo admin luego de dar de baja
-- al anterior.
--
-- Implementación declarativa (sin triggers, invisible a la lógica de la app):
--   - Columna generada STORED `admin_unico` = 1 solo cuando rol='admin' y no
--     está borrado; en cualquier otro caso NULL.
--   - Índice UNIQUE sobre `admin_unico`. MySQL permite múltiples NULL en un
--     índice único, por lo que solo puede existir UNA fila con valor 1, es
--     decir, un único admin activo. Cualquier INSERT/UPDATE que intente crear
--     un segundo admin activo falla con error de clave duplicada.
--
-- Al hacer self-delete de un admin (setear deleted_at), `admin_unico` recalcula
-- a NULL y libera el cupo automáticamente.
--
-- PRECONDICIÓN: debe haber a lo sumo un admin activo antes de aplicar, o el
-- ADD UNIQUE INDEX fallará (comportamiento deseado: obliga a limpiar datos).
--
-- Rollback:
--   ALTER TABLE `usuarios` DROP INDEX `uq_admin_unico`;
--   ALTER TABLE `usuarios` DROP COLUMN `admin_unico`;

ALTER TABLE `usuarios`
  ADD COLUMN `admin_unico` TINYINT UNSIGNED
    GENERATED ALWAYS AS (IF(`rol` = 'admin' AND `deleted_at` IS NULL, 1, NULL)) STORED
    AFTER `activo`,
  ADD UNIQUE INDEX `uq_admin_unico` (`admin_unico`);
