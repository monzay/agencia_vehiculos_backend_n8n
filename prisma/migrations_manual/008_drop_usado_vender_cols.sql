-- Fase 3 (cierre): quitar de chat_estado las columnas migradas a vehiculo_cliente.
-- Ya no las escribe/lee ni el backend ni n8n (verificado). Los datos viven en
-- `vehiculo_cliente`.
--
-- Rollback: re-agregar columnas y volver a copiar desde vehiculo_cliente:
--   ALTER TABLE chat_estado ADD COLUMN usado_marca VARCHAR(60) NULL, ... ;
--   UPDATE chat_estado ce JOIN vehiculo_cliente vc ON vc.sesion_id=ce.id ...

ALTER TABLE `chat_estado`
  DROP COLUMN `usado_marca`,
  DROP COLUMN `usado_modelo`,
  DROP COLUMN `usado_anio`,
  DROP COLUMN `usado_kms`,
  DROP COLUMN `vender_precio`;
