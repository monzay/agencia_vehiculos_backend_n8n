-- El agente vendedor lee la ficha completa del auto (pedido del dueño del 11/11/2026).
-- Spec: openspec/changes/bot-datos-del-auto.
--
-- La 067 le dio al usuario `agente_ia` lectura por columna de `autos`, sin `costo` ni `precio_venta`. Ahora el
-- bot también cuenta la versión, el stock, el precio de contado, el anticipo y la descripción del auto, así que
-- se le suman esas cinco columnas. `costo` y `precio_venta` siguen sin permiso.
--
-- Solo agrega permisos: no cambia datos ni estructura. En producción se aplica ANTES del backend, porque el
-- backend nuevo las pide en cada consulta de autos y la base le negaría el acceso. Reemplazar `agencia` si la
-- base tiene otro nombre.
--
-- Rollback (volver primero al backend anterior):
--   REVOKE SELECT (`version`, `stock`, `precio_contado`, `anticipo`, `descripcion`) ON `agencia`.`autos` FROM 'agente_ia'@'%';

GRANT SELECT (`version`, `stock`, `precio_contado`, `anticipo`, `descripcion`) ON `agencia`.`autos` TO 'agente_ia'@'%';
