-- Fase 3 de normalización: extraer el vehículo que describe el cliente.
-- Las columnas `usado_marca/modelo/anio/kms` y `vender_precio` de chat_estado
-- describían una entidad aparte (el auto del cliente) y estaban SOBRECARGADAS
-- para dos flujos (entrega de usado en compra / auto a vender). Se mueven a
-- `vehiculo_cliente` con un `contexto` explícito. self-delete: lleva deleted_at.
--
-- Las columnas viejas se dropean recién en 008 (tras cambiar backend + n8n).
-- Rollback: DROP TABLE vehiculo_cliente;

CREATE TABLE `vehiculo_cliente` (
  `id`            INT UNSIGNED           NOT NULL AUTO_INCREMENT,
  `sesion_id`     INT UNSIGNED           NOT NULL,
  `contexto`      ENUM('trade_in','venta') NOT NULL,
  `marca`         VARCHAR(60)            NULL,
  `modelo`        VARCHAR(60)            NULL,
  `anio`          SMALLINT UNSIGNED      NULL,
  `kms`           INT UNSIGNED           NULL,
  `precio_pedido` VARCHAR(40)            NULL,
  `created_at`    DATETIME               NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    DATETIME               NULL DEFAULT CURRENT_TIMESTAMP,
  `deleted_at`    DATETIME               NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_sesion_contexto` (`sesion_id`, `contexto`),
  KEY `idx_sesion` (`sesion_id`),
  CONSTRAINT `vehiculo_cliente_ibfk_1`
    FOREIGN KEY (`sesion_id`) REFERENCES `chat_estado` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Migración de datos: contexto 'venta' (quiere vender su auto).
INSERT INTO `vehiculo_cliente` (sesion_id, contexto, marca, modelo, anio, kms, precio_pedido)
SELECT id, 'venta', usado_marca, usado_modelo, usado_anio, usado_kms, vender_precio
FROM `chat_estado`
WHERE tipo_lead = 'venta'
  AND (usado_marca IS NOT NULL OR usado_modelo IS NOT NULL OR usado_anio IS NOT NULL OR vender_precio IS NOT NULL);

-- Migración de datos: contexto 'trade_in' (usado que entrega en una compra).
INSERT INTO `vehiculo_cliente` (sesion_id, contexto, marca, modelo, anio, kms, precio_pedido)
SELECT id, 'trade_in', usado_marca, usado_modelo, usado_anio, usado_kms, NULL
FROM `chat_estado`
WHERE (tipo_lead IS NULL OR tipo_lead <> 'venta')
  AND (usado_marca IS NOT NULL OR usado_modelo IS NOT NULL OR usado_anio IS NOT NULL);
