-- Marca de "última vez que el usuario revisó la sección Consultas".
-- Sirve para detectar cuántas consultas nuevas hubo desde su última visita.
-- NULL = nunca revisó (todas las consultas cuentan como nuevas).
ALTER TABLE usuarios
  ADD COLUMN consultas_visto_at DATETIME NULL AFTER updated_at;
