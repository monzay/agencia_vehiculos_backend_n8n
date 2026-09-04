-- Interés por vehículo: una fila por visita a la ficha pública /catalogo/<ref>.
--
-- Es una tabla de HECHOS, no una entidad: guarda QUÉ auto se miró y CUÁNDO, y
-- nada más. Marca, modelo y precio viven en `autos` y se traen por JOIN — no se
-- copian acá, o el ranking mentiría en cuanto se editara un vehículo.
--
-- NO registra visitas de asesores ni del admin: el backend descarta el pedido
-- si llega con un JWT de staff válido (ver `usuarioOpcional`). Sin eso el panel
-- estaría midiendo el trabajo del equipo como si fuera interés de clientes.
--
-- self-delete: lleva deleted_at como el resto del esquema.
--
-- Ojo con el crecimiento: es append-only y una ficha muy visitada suma miles de
-- filas por mes. El índice (auto_id, created_at) sostiene el ranking y los
-- recortes por fecha; si algún día pesa, agregar purga por antigüedad.
--
-- Rollback:
--   DROP TABLE `auto_vistas`;

CREATE TABLE `auto_vistas` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `auto_id`    INT UNSIGNED NOT NULL,
  `created_at` DATETIME     NULL DEFAULT CURRENT_TIMESTAMP,
  `deleted_at` DATETIME     NULL,
  PRIMARY KEY (`id`),
  KEY `idx_auto_created` (`auto_id`, `created_at`),
  CONSTRAINT `auto_vistas_ibfk_1`
    FOREIGN KEY (`auto_id`) REFERENCES `autos` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
