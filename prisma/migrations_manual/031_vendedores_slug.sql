-- Identificador público de cada asesor para su link de captación
-- (`/a/<slug>`): el asesor lo publica en sus redes, y la consulta que entra por
-- ahí queda atribuida a él en vez de repartirse por carga.
--
-- Va un slug legible y no el `id` porque el link es público y lo lee una
-- persona: "/a/agustina" se puede dictar por teléfono, "/a/7" no.
--
-- El UNIQUE incluye a los asesores dados de baja (deleted_at IS NOT NULL) a
-- propósito: si alguien se va, su slug NO se reasigna a otro, así los links que
-- quedaron publicados en redes nunca terminan atribuyendo a la persona
-- equivocada.
--
-- Rollback:
--   ALTER TABLE `vendedores` DROP INDEX `uq_vendedores_slug`;
--   ALTER TABLE `vendedores` DROP COLUMN `slug`;

ALTER TABLE `vendedores`
  ADD COLUMN `slug` VARCHAR(40) NULL AFTER `nombre`;

-- Backfill desde el nombre: minúsculas, sin tildes y con guiones.
UPDATE `vendedores`
   SET `slug` = LOWER(
         REPLACE(
           REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(`nombre`,
             'á','a'), 'é','e'), 'í','i'), 'ó','o'), 'ú','u'),
         ' ', '-')
       )
 WHERE `slug` IS NULL;

-- Dos asesores con el mismo nombre romperían el UNIQUE: se desempata con el id.
UPDATE `vendedores` v
  JOIN (
    SELECT `slug` FROM `vendedores` GROUP BY `slug` HAVING COUNT(*) > 1
  ) d ON d.`slug` = v.`slug`
   SET v.`slug` = CONCAT(v.`slug`, '-', v.`id`);

ALTER TABLE `vendedores`
  ADD UNIQUE INDEX `uq_vendedores_slug` (`slug`);
