-- El informe de dominio histórico entra como papel del legajo.
--
-- Es el único documento del circuito que NO trae el cliente: lo pide la agencia
-- al Registro Seccional. Por eso importa tenerlo aparte del título, que es lo
-- que el cliente declara: el informe es la versión del Registro, y es donde
-- aparecen la prenda, el embargo, la denuncia de venta y el pedido de secuestro
-- que un título en la mano no muestra.
--
-- El valor se agrega al final del ENUM: no reescribe la tabla ni mueve los
-- valores que ya estaban. 'comprobante_cbu' sigue en la lista, inerte desde la
-- migración 041.
--
-- Los campos que pide (registro, fecha de emisión, dominio, titular registral,
-- dueños anteriores, prenda, embargo, denuncia de venta, pedido de secuestro)
-- se declaran en src/lib/documentos-catalogo.js, no acá: viven en `datos_json`.
--
-- Rollback (solo si ninguna fila lo usa):
--   ALTER TABLE `consignacion_documentos` MODIFY `tipo` ENUM(
--     'titulo','cedula_verde','libre_deuda_patentes','libre_deuda_infracciones',
--     'vtv','verificacion_policial','dni_titular','dni_conyuge',
--     'constancia_cuit','comprobante_domicilio','comprobante_cbu') NOT NULL;

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
    'informe_dominio_historico'
  ) NOT NULL;
