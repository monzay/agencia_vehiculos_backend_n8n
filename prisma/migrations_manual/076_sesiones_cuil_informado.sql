-- El CUIL que informó la persona en esa consulta (pedido del dueño del 03/11/2026).
-- Spec: openspec/changes/cuil-en-consulta.
--
-- `clientes.cuil` (075) es el dato de la persona y no se reemplaza. Este es lo que dijo en la
-- consulta, como `nombre_declarado`: si lo corrige y no coincide con la ficha, el asesor ve cuál informó.
--
-- `agente_ia` (067) no recibe UPDATE sobre esta columna: lo escribe el backend con su usuario.
--
-- Columna nueva y nula: no toca filas existentes.
--
-- Rollback:
--   ALTER TABLE `sesiones` DROP COLUMN `cuil_informado`;

ALTER TABLE `sesiones`
  ADD COLUMN `cuil_informado` CHAR(11) NULL AFTER `nombre_declarado`;
