-- El informe de dominio (estado actual) entra como papel del legajo.
--
-- Es distinto del histórico (042): el informe de dominio dice cómo está el auto
-- HOY en el Registro (titular, prenda, embargo, inhibición del titular), que es
-- lo que hace falta para comprarlo o tomarlo sin sorpresas. El histórico agrega
-- la cadena de dueños anteriores.
--
-- Sus campos viven en src/lib/documentos-catalogo.js, como los demás papeles.
-- El valor se agrega al final del ENUM: no reescribe la tabla ni mueve los que
-- ya estaban.
--
-- Rollback (solo si ninguna fila lo usa):
--   ALTER TABLE `consignacion_documentos` MODIFY `tipo` ENUM(
--     'titulo','cedula_verde','libre_deuda_patentes','libre_deuda_infracciones',
--     'vtv','verificacion_policial','dni_titular','dni_conyuge','constancia_cuit',
--     'comprobante_domicilio','comprobante_cbu','informe_dominio_historico',
--     'formulario_08') NOT NULL;

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
    'formulario_08',
    'informe_dominio'
  ) NOT NULL;
