-- Marca de última revisión de la sección Clientes por usuario, para el badge de
-- novedades del panel: cuántos clientes NUEVOS (su primera consulta útil) llegaron
-- desde la última vez que el usuario la abrió. Mismo mecanismo que
-- `consultas_visto_at` / `ventas_visto_at`.
--
-- Rollback:
--   ALTER TABLE `usuarios` DROP COLUMN `clientes_visto_at`;

ALTER TABLE `usuarios`
  ADD COLUMN `clientes_visto_at` DATETIME NULL AFTER `descuentos_visto_at`;
