-- Vender un auto deja de ser lo mismo que borrarlo.
--
-- Hasta acá el único cierre posible era el soft delete, que mezclaba dos hechos
-- distintos: "lo cargué mal, sacalo" y "se vendió". En la base quedaban iguales,
-- así que no había forma de contar ventas ni de sacar contabilidad.
--
--   costo        -> lo que PAGÓ la agencia. `precio` es el de lista (lo que
--                   pide), nunca sirvió como costo. Sin esta columna la
--                   ganancia neta no se puede calcular.
--   precio_venta -> a cuánto cerró de verdad, que rara vez es el de lista.
--   vendido_at   -> NULL = sigue a la venta. Es el ÚNICO campo que define si un
--                   auto se vendió, sea propio o consignado, para que "cuántos
--                   vendí" sea una sola pregunta a una sola columna.
--
-- Los tres son NULL: los autos ya cargados no tienen esta información y no hay
-- forma de inventarla. Un auto vendido sin `costo` aporta 0 a la ganancia (no
-- se cuenta la venta entera como ganancia, que sería mentir).
--
-- Rollback:
--   ALTER TABLE `autos` DROP COLUMN `costo`, DROP COLUMN `precio_venta`,
--     DROP COLUMN `vendido_at`, DROP INDEX `idx_vendido`;

ALTER TABLE `autos`
  ADD COLUMN `costo`        DECIMAL(12,2) NULL AFTER `precio`,
  ADD COLUMN `precio_venta` DECIMAL(12,2) NULL AFTER `costo`,
  ADD COLUMN `vendido_at`   DATETIME      NULL AFTER `precio_venta`,
  ADD KEY `idx_vendido` (`vendido_at`);
