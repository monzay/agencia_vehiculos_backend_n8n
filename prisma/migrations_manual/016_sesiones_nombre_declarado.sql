-- Nombre que el cliente declara al final del flujo, cuando el bot pregunta
-- "¿a nombre de quién registramos la consulta?" (pasos q_nombre / vender_nombre).
--
-- Vive en la sesión y no en `clientes` porque es un dato POR consulta: el mismo
-- teléfono puede registrar consultas a nombre de personas distintas. Además
-- `clientes.nombre` no sirve como fuente: cada mensaje entrante lo sobrescribe
-- con el nombre de perfil de WhatsApp.
--
-- NULL = el cliente todavía no llegó a esa pregunta (consulta abandonada antes).
ALTER TABLE sesiones
  ADD COLUMN nombre_declarado VARCHAR(120) NULL AFTER tipo_lead;
