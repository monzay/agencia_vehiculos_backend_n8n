-- Dominio, motor y chasis en la ficha del auto.
--
-- El boleto de una venta con parte de pago identifica el auto que vende la
-- agencia por estos tres datos. Hasta ahora se tipeaban en el boleto cada vez;
-- ahora viven en la ficha de Vehículos y el boleto los toma de ahí.
--
-- Nullable: los autos que ya están en stock no los tienen y se completan desde
-- el panel. No son públicos: el catálogo no los expone.
--
-- Después se copian a la ficha los que ya estaban escritos en boletos, para no
-- tener que volver a cargarlos.
--
-- Rollback:
--   ALTER TABLE autos DROP INDEX idx_dominio, DROP COLUMN chasis, DROP COLUMN motor, DROP COLUMN dominio;

ALTER TABLE `autos`
  ADD COLUMN `dominio` VARCHAR(15) NULL AFTER `ref`,
  ADD COLUMN `motor` VARCHAR(40) NULL AFTER `dominio`,
  ADD COLUMN `chasis` VARCHAR(40) NULL AFTER `motor`,
  ADD INDEX `idx_dominio` (`dominio`);

UPDATE `autos` a
  JOIN `compraventa_contratos` c ON c.auto_entregado_id = a.id AND c.deleted_at IS NULL
   SET a.dominio = COALESCE(a.dominio, c.entregado_dominio),
       a.motor   = COALESCE(a.motor, c.entregado_motor),
       a.chasis  = COALESCE(a.chasis, c.entregado_chasis);
