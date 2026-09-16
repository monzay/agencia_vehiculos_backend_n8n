-- La consignación deja de pedir los datos del cónyuge.
--
-- Decisión de negocio: cargar al cónyuge como segunda persona sumaba carga de
-- datos en el alta. Para comunicarse con alguien cercano se usa el contacto
-- alternativo de la migración 043.
--
-- Queda asentado el riesgo que se evaluó al decidirlo: si el auto es ganancial,
-- la transferencia necesita el asentimiento del cónyuge (CCyC art. 470). Eso ya
-- no se registra acá; se resuelve al momento de la venta.
--
-- Qué cambia:
--   · El papel "DNI del cónyuge" sale del catálogo (src/lib/documentos-catalogo.js)
--     y el servicio ya no lo acepta. Las filas que había se archivan.
--   · El backend deja de leer y escribir `consignacion_ingresos.conyuge_cliente_id`.
--
-- Qué NO cambia, a propósito:
--   · La columna `conyuge_cliente_id` y su FK se quedan. Borrarlas perdería el
--     vínculo de los ingresos que ya lo tenían cargado, y esta base no borra
--     historia. Queda inerte: nada la escribe, nada la muestra.
--   · El valor 'dni_conyuge' se queda en el ENUM de `tipo`, por la misma razón
--     que 'comprobante_cbu' en la 041.
--   · Los clientes que se cargaron como cónyuge siguen en `clientes`.
--
-- Rollback: volver a agregar `dni_conyuge` al catálogo, restaurar la lectura del
-- cónyuge en el backend y
--   UPDATE `consignacion_documentos` SET `deleted_at` = NULL
--     WHERE `tipo` = 'dni_conyuge';

UPDATE `consignacion_documentos`
   SET `deleted_at` = NOW()
 WHERE `tipo` = 'dni_conyuge'
   AND `deleted_at` IS NULL;
