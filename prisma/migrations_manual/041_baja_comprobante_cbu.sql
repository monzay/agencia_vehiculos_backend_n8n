-- El comprobante de CBU deja de pedirse como papel.
--
-- El CBU y el alias ya se cargan en la ficha del titular al dar de alta la
-- consignación (`cliente_perfiles.cbu` / `alias_cbu`), y de ahí salen para la
-- cláusula de liquidación del contrato. El papel repetía los mismos dos campos
-- sin agregar nada: quedaban guardados dos veces y nadie los comparaba.
--
-- El tipo se saca del catálogo (src/lib/documentos-catalogo.js), que es lo que
-- decide qué se puede cargar: el servicio valida contra esa lista, así que no
-- puede volver a entrar una fila de este tipo.
--
-- El valor 'comprobante_cbu' SE DEJA en el ENUM de la columna. Sacarlo obligaría
-- a borrar físicamente las filas que ya existen, y esta base usa soft delete
-- justamente para no perder el rastro de lo que se cargó. Queda inerte: nadie
-- lo puede usar, y las filas viejas siguen ahí para auditoría.
--
-- Acá solo se archivan las filas que quedaron, para que dejen de aparecer en los
-- legajos y en los recibos impresos.
--
-- Rollback: volver a agregar el bloque `comprobante_cbu` al catálogo y
--   UPDATE `consignacion_documentos` SET `deleted_at` = NULL
--     WHERE `tipo` = 'comprobante_cbu';

UPDATE `consignacion_documentos`
   SET `deleted_at` = NOW()
 WHERE `tipo` = 'comprobante_cbu'
   AND `deleted_at` IS NULL;
