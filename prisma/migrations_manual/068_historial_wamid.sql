-- Id del mensaje de WhatsApp (wamid) en el historial.
--
-- Meta reintenta un webhook si no recibe respuesta a tiempo, y n8n puede
-- reintentar el pedido al backend. Sin esto, cada reintento volvería a llamar
-- a la IA (gasto) y a responderle al cliente. El backend guarda el wamid del
-- mensaje entrante y, si ya existe, no lo procesa de nuevo. El índice único
-- frena también dos reintentos simultáneos.
--
-- Solo se llena en los mensajes entrantes del agente; los demás quedan NULL
-- (MySQL permite varios NULL en un índice único).
--
-- Columna nueva, nula: no toca filas existentes.
--
-- Rollback:
--   ALTER TABLE `historial_mensajes`
--     DROP KEY `uq_historial_wamid`,
--     DROP COLUMN `wamid`;

ALTER TABLE `historial_mensajes`
  ADD COLUMN `wamid` VARCHAR(128) NULL AFTER `paso_nodo`,
  ADD UNIQUE KEY `uq_historial_wamid` (`wamid`);
