-- Marca de "última vez que el usuario revisó la sección Quieren vender".
-- Espejo de `consultas_visto_at` (migración 015): cada sección del panel con
-- notificaciones lleva su propia columna, porque el usuario puede revisar una
-- y no la otra.
-- NULL = nunca la revisó (todo cuenta como nuevo).
ALTER TABLE usuarios
  ADD COLUMN ventas_visto_at DATETIME NULL AFTER consultas_visto_at;
