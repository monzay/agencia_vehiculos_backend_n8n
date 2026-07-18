-- Modalidad con la que el cliente quiere entregar su vehículo, preguntada por el
-- bot apenas elige "Vender o consignar" en el menú:
--   venta        → la agencia se lo compra
--   consignacion → la agencia lo exhibe y lo vende por él
--
-- Es una sub-modalidad de `tipo_lead='venta'`, no un tipo_lead distinto: la
-- sección "Quieren vender", la métrica de ventas y el filtro de consultas útiles
-- comparan contra 'venta', y meter 'consignacion' ahí las dejaría afuera.
--
-- NULL = sesión de venta anterior a esta pregunta, o consulta que no es de venta.
ALTER TABLE sesiones
  ADD COLUMN modalidad_venta ENUM('venta','consignacion') NULL AFTER tipo_lead;
