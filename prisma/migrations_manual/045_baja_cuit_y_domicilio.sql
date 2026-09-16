-- La constancia de CUIT/CUIL y el comprobante de domicilio dejan de pedirse
-- como papeles.
--
-- Los dos repetían datos que ya se cargan en la ficha del titular al dar de alta
-- la consignación: el CUIT y el domicilio viven en `cliente_perfiles`, y de ahí
-- salen para el contrato. El papel solo volvía a pedir lo mismo.
--
-- Mismo criterio que la 041 (comprobante de CBU) y la 044 (DNI del cónyuge):
--   · Los tipos salen del catálogo (src/lib/documentos-catalogo.js), que es lo
--     que el servicio usa para validar: no pueden volver a cargarse.
--   · Los valores quedan inertes en el ENUM de `tipo`. Sacarlos obligaría a
--     borrar físicamente las filas, y esta base no borra historia.
--   · Las filas que existían se archivan para que dejen de verse.
--
-- Los contratos ya firmados conservan estos papeles en su copia congelada
-- (`contrato_json`): es lo que el cliente firmó, y no se reescribe.
--
-- Rollback: volver a agregar ambos bloques al catálogo y
--   UPDATE `consignacion_documentos` SET `deleted_at` = NULL
--     WHERE `tipo` IN ('constancia_cuit', 'comprobante_domicilio');

UPDATE `consignacion_documentos`
   SET `deleted_at` = NOW()
 WHERE `tipo` IN ('constancia_cuit', 'comprobante_domicilio')
   AND `deleted_at` IS NULL;
