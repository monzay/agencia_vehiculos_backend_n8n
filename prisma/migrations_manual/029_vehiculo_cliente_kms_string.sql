-- Los kms que declara el cliente (vehiculo_cliente.kms) pasan a texto libre:
-- se guarda y se muestra lo que escribió ("120.000", "120 mil aprox"), igual
-- que precio_pedido y sesiones.anticipo (ver 028). Los valores numéricos
-- existentes se convierten solos a su representación en texto.
ALTER TABLE `vehiculo_cliente`
  MODIFY COLUMN `kms` VARCHAR(40) NULL;
