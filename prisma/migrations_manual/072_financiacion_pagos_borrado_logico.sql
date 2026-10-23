-- Borrado lógico de los pagos de cuotas (`financiacion_pagos`: una fila = una
-- cuota pagada). Hasta ahora anular un pago borraba la fila; desde ahora se
-- marca con `deleted_at` (metodología del proyecto) y queda como historial: una
-- cuota puede figurar pagada, anulada y pagada otra vez.
--
-- 1) `deleted_at`: la fila vigente es la que lo tiene nulo.
-- 2) Una cuota puede tener varias filas (el historial) pero UNA sola vigente.
--    El UNIQUE `uq_financiacion_numero` (financiacion_id, numero) se reemplaza
--    por el índice único funcional `uq_pago_vigente`, que cuenta solo las
--    vigentes: su parte funcional vale 1 si la fila está vigente y NULL si no,
--    y un UNIQUE admite varios NULL. Mismo patrón que `uq_usuarios_email_activo`
--    (071). Prisma no ve los índices funcionales: la garantía de fondo es el
--    índice, así dos pagos simultáneos de la misma cuota no pueden quedar los
--    dos vigentes.
-- 3) `idx_financiacion` (financiacion_id) NO se toca y NO es redundante: no
--    borrarlo. Sin el UNIQUE viejo es el índice que sostiene la FK
--    `financiacion_pagos_ibfk_1`. Parece un prefijo de `uq_pago_vigente`, pero
--    ese lleva una parte funcional: por precaución la FK no tiene que depender
--    de él (no está probado que MySQL acepte un índice así para una FK).
--
-- Todo va en un solo ALTER TABLE: el DDL de InnoDB es atómico, se aplica entero
-- o no se aplica nada.
--
-- En producción: aplicar después de 057-071, en la misma ventana que el backend
-- nuevo y que el cambio del SQL del workflow de n8n "MySQL: Vencen Mañana", que
-- cuenta pagos y tiene que ignorar los anulados (`pp.deleted_at IS NULL`).
-- Esta migración va primero: el backend y el workflow viejos siguen andando con
-- la tabla nueva (el backend viejo borra de verdad y ninguno conoce la columna);
-- los nuevos fallan sin `deleted_at`.
-- Ensayarla antes en MySQL 8.4 (por ejemplo un contenedor `mysql:8.4`) y
-- aplicarla a mano con backup previo: `desplegar-produccion.mjs` solo conoce 055-056.
-- Antes de aplicar, `SHOW CREATE TABLE financiacion_pagos;` tiene que mostrar
-- `uq_financiacion_numero`, `idx_financiacion` y la FK `financiacion_pagos_ibfk_1`,
-- y ninguna columna `deleted_at` (si ya está, la 072 ya se aplicó).
-- La primera sentencia, `SET SESSION lock_wait_timeout = 10;`, evita quedar
-- esperando el bloqueo de metadatos si hay conexiones abiertas (si vence con el
-- error 1205, reintentar). Vale solo para la sesión: aplicar todo en una misma
-- conexión. No forzar ALGORITHM ni LOCK: MySQL reconstruye la tabla, que es chica.
-- Efecto visible: ninguno al aplicarla, los pagos que existen quedan vigentes.
-- Con el backend nuevo, anular un pago conserva la fila (historial) y la cuota
-- vuelve a figurar impaga. Todo lo que cuenta pagos (backend, n8n, agente IA)
-- tiene que filtrar `deleted_at IS NULL`: si no, cuenta las anuladas como
-- pagadas.
--
-- Verificación después de aplicar (no deja datos; con la tabla vacía el INSERT
-- no prueba nada):
--   SHOW INDEX FROM financiacion_pagos WHERE Key_name = 'uq_pago_vigente';  -- 3 partes: financiacion_id, numero y la expresión
--   START TRANSACTION;
--   INSERT INTO financiacion_pagos (financiacion_id, numero)
--     SELECT financiacion_id, numero FROM financiacion_pagos WHERE deleted_at IS NULL LIMIT 1;  -- tiene que fallar con 1062 en uq_pago_vigente
--   ROLLBACK;
-- Después de un `prisma db pull`, revisar el diff: Prisma omite `uq_pago_vigente`
-- y borra el comentario del model.
--
-- Rollback: primero se vuelve al código anterior (backend y n8n) y después la
-- base. Solo es posible si no hay más de una fila por cuota, porque el UNIQUE
-- viejo no admite historial. Y como el código viejo da por paga toda fila que
-- existe, tampoco puede quedar ninguna anulada. Paso 0, si las hay: respaldarlas
-- (`mysqldump agencia financiacion_pagos --where="deleted_at IS NOT NULL"`) y
-- recién ahí borrarlas; se pierde ese historial. Después, los dos chequeos deben dar 0:
--   SELECT financiacion_id, numero, COUNT(*) n FROM financiacion_pagos GROUP BY financiacion_id, numero HAVING n > 1;
--   SELECT COUNT(*) FROM financiacion_pagos WHERE deleted_at IS NOT NULL;
-- En dos pasos, porque MySQL no deja borrar la columna mientras un índice
-- funcional la usa:
--   ALTER TABLE `financiacion_pagos` DROP INDEX `uq_pago_vigente`, ADD UNIQUE KEY `uq_financiacion_numero` (`financiacion_id`, `numero`);
--   ALTER TABLE `financiacion_pagos` DROP COLUMN `deleted_at`;

SET SESSION lock_wait_timeout = 10;

ALTER TABLE `financiacion_pagos`
  ADD COLUMN `deleted_at` DATETIME NULL,
  DROP INDEX `uq_financiacion_numero`,
  ADD UNIQUE INDEX `uq_pago_vigente`
    (`financiacion_id`, `numero`, (IF(`deleted_at` IS NULL, 1, NULL)));
