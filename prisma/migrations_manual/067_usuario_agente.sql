-- Usuario de MySQL del agente vendedor con IA (mínimo privilegio).
--
-- El agente se conecta con este usuario (variable AGENTE_DATABASE_URL), no con
-- el del backend. Así, aunque una herramienta fallara o alguien manipulara al
-- agente por chat, la base no le deja ver ni tocar nada fuera de lo suyo:
--
--   - LEE solo lo que usan sus herramientas, y por columna donde hay datos
--     sensibles: de `clientes` solo id y DNI (nada de email ni teléfono de
--     otros); de `autos` todo menos `costo` y `precio_venta`.
--   - ESCRIBE solo: sus consumos de IA, sus intentos de verificación de DNI,
--     los mensajes de la conversación, el usado que declara el cliente y los
--     campos de calificación y derivación de la sesión.
--   - No puede borrar nada (sin DELETE en ninguna tabla).
--
-- Host '%': en producción la base es remota (Aiven), así que el usuario no
-- puede quedar atado a 'localhost'. El acceso se restringe por red (ip_filter
-- de Aiven, solo la IP del servidor) y TLS.
--
-- La contraseña NO se guarda acá: reemplazar __CONTRASENA__ al aplicarlo.
-- Reemplazar también `agencia` si la base tiene otro nombre.
--
-- Rollback:
--   DROP USER 'agente_ia'@'%';

CREATE USER IF NOT EXISTS 'agente_ia'@'%' IDENTIFIED BY '__CONTRASENA__';

-- Lectura por columna: datos sensibles fuera.
GRANT SELECT (`id`, `dni`) ON `agencia`.`clientes` TO 'agente_ia'@'%';
GRANT SELECT (
  `id`, `ref`, `marca`, `modelo`, `anio`, `kms`, `tipo`, `tipo_vehiculo`, `combustible`,
  `precio`, `disponible`, `vendido_at`, `deleted_at`, `fotos_json`, `descuento_id`
) ON `agencia`.`autos` TO 'agente_ia'@'%';

-- Lectura por columna: solo lo necesario para saber si un auto está reservado.
GRANT SELECT (`id`, `auto_id`, `estado`, `vence`, `ingreso_id`, `deleted_at`) ON `agencia`.`senas` TO 'agente_ia'@'%';
GRANT SELECT (`id`, `auto_id`, `estado`, `deleted_at`) ON `agencia`.`consignaciones` TO 'agente_ia'@'%';
GRANT SELECT (`id`, `auto_interes_id`, `estado`, `deleted_at`) ON `agencia`.`consignacion_ingresos` TO 'agente_ia'@'%';
GRANT SELECT (`id`, `ingreso_id`, `auto_entregado_id`, `deleted_at`) ON `agencia`.`compraventa_contratos` TO 'agente_ia'@'%';

-- Lectura completa: datos públicos o ya filtrados por el cliente en el código.
GRANT SELECT ON `agencia`.`descuentos`            TO 'agente_ia'@'%';
GRANT SELECT ON `agencia`.`promociones`           TO 'agente_ia'@'%';
GRANT SELECT ON `agencia`.`auto_promociones`      TO 'agente_ia'@'%';
GRANT SELECT ON `agencia`.`horarios_atencion`     TO 'agente_ia'@'%';
GRANT SELECT ON `agencia`.`financiaciones`        TO 'agente_ia'@'%';
GRANT SELECT ON `agencia`.`financiacion_pagos`    TO 'agente_ia'@'%';
GRANT SELECT ON `agencia`.`sesiones`              TO 'agente_ia'@'%';
GRANT SELECT ON `agencia`.`historial_mensajes`    TO 'agente_ia'@'%';
GRANT SELECT ON `agencia`.`vehiculo_cliente`      TO 'agente_ia'@'%';
GRANT SELECT ON `agencia`.`ia_consumos`           TO 'agente_ia'@'%';
GRANT SELECT ON `agencia`.`verificacion_intentos` TO 'agente_ia'@'%';

-- Escritura: solo lo suyo, y sin DELETE.
GRANT INSERT ON `agencia`.`ia_consumos`           TO 'agente_ia'@'%';
GRANT INSERT ON `agencia`.`verificacion_intentos` TO 'agente_ia'@'%';
GRANT INSERT ON `agencia`.`historial_mensajes`    TO 'agente_ia'@'%';
GRANT INSERT ON `agencia`.`vehiculo_cliente`      TO 'agente_ia'@'%';

-- El usado que declara el cliente: puede corregirlo o reactivarlo si estaba archivado.
GRANT UPDATE (`marca`, `modelo`, `anio`, `updated_at`, `deleted_at`) ON `agencia`.`vehiculo_cliente` TO 'agente_ia'@'%';

-- En la sesión, solo los campos de la calificación y de la derivación.
GRANT UPDATE (
  `pago_tipo`, `anticipo`, `cuotas`, `credito_ok`, `entrega_usado`,
  `decisor`, `decisor_con`, `disponibilidad`, `score`, `clasificacion`,
  `auto_id`, `ultimo_mensaje`, `updated_at`,
  `requiere_vendedor`, `requiere_vendedor_motivo`, `requiere_vendedor_at`
) ON `agencia`.`sesiones` TO 'agente_ia'@'%';
