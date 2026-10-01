-- Qué pasa si el titular retira el vehículo antes de que se cumpla el plazo.
--
-- Hasta acá la cláusula 6 se armaba sola con dos números: los días de aviso y
-- un costo. Eso alcanza para el caso simple, pero no para lo que cada agencia
-- quiere dejar escrito: gastos de publicación ya hechos, penalidad, qué pasa si
-- hay una seña cobrada, o si el dueño lo vende por su cuenta después de
-- retirarlo. Nada de eso se puede modelar con un número, y un ENUM de casos
-- sería una lista que nunca termina.
--
-- Va como texto libre: el contenido lo decide la agencia, contrato por contrato.
-- NULL = no se pactó nada especial y la cláusula imprime como antes.
--
-- Rollback:
--   ALTER TABLE `consignacion_contratos` DROP COLUMN `retiro_condiciones`;

ALTER TABLE `consignacion_contratos`
  ADD COLUMN `retiro_condiciones` TEXT NULL AFTER `retiro_costo`;
