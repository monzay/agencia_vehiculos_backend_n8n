-- El formulario 08 entra como papel del legajo.
--
-- Es el formulario de transferencia que firma el vendedor: sin él el auto no se
-- puede transferir. En el legajo se usa solo para guardar las imágenes del 08
-- firmado; no declara campos propios. Lleva igual los datos comunes a todos los
-- papeles (qué quedó en la agencia, dónde, observaciones).
--
-- Los campos (ninguno) y el resto de la definición viven en
-- src/lib/documentos-catalogo.js, como los demás papeles.
--
-- El valor se agrega al final del ENUM: no reescribe la tabla ni mueve los que
-- ya estaban. Los inertes ('dni_conyuge', 'constancia_cuit',
-- 'comprobante_domicilio', 'comprobante_cbu') siguen en la lista.
--
-- Rollback (solo si ninguna fila lo usa):
--   ALTER TABLE `consignacion_documentos` MODIFY `tipo` ENUM(
--     'titulo','cedula_verde','libre_deuda_patentes','libre_deuda_infracciones',
--     'vtv','verificacion_policial','dni_titular','dni_conyuge','constancia_cuit',
--     'comprobante_domicilio','comprobante_cbu','informe_dominio_historico') NOT NULL;

ALTER TABLE `consignacion_documentos`
  MODIFY `tipo` ENUM(
    'titulo',
    'cedula_verde',
    'libre_deuda_patentes',
    'libre_deuda_infracciones',
    'vtv',
    'verificacion_policial',
    'dni_titular',
    'dni_conyuge',
    'constancia_cuit',
    'comprobante_domicilio',
    'comprobante_cbu',
    'informe_dominio_historico',
    'formulario_08'
  ) NOT NULL;
