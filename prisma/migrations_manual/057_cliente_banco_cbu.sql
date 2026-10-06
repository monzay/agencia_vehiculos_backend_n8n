-- El banco o la billetera de la cuenta del titular (Banco Nación, Mercado
-- Pago…), para saber a dónde se le transfiere la liquidación.
--
-- Texto libre y no un catálogo: entre bancos y billeteras virtuales la lista es
-- larga y cambia, y el dato solo se lee y se imprime en el contrato.
--
-- Solo tiene sentido con un CBU o un alias cargado: el backend lo guarda en NULL
-- si no hay ninguno de los dos.
--
-- Rollback:
--   ALTER TABLE `cliente_perfiles` DROP COLUMN `banco_cbu`;

ALTER TABLE `cliente_perfiles`
  ADD COLUMN `banco_cbu` VARCHAR(60) NULL AFTER `alias_cbu`;
