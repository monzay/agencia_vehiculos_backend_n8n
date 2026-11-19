# Tareas — tipos-de-vehiculo

- [x] 1. Backend: tests en rojo de `lib/tipos-vehiculo.js`, del servicio de vehículos, de `buscar_autos` y de
  la importación. **Criterio:** los escenarios de "Cuatro tipos de vehículo", "El bot busca camiones" y "La
  importación reconoce camiones".
- [x] 2. Backend: `camion` en la lista, normalizar sin tildes, describir los tipos en `buscar_autos` y en el
  esquema de la lista. **Criterio:** esos tests en verde y la suite completa.
- [x] 3. Front: tests en rojo de `lib/tipos-vehiculo.js`, después el código: camión con `Truck`, camioneta con
  un ícono de pick-up (`createLucideIcon`) y subtítulos del catálogo. **Criterio:** los escenarios de "El front
  muestra los cuatro tipos", la suite del front y `npm run build`.
- [x] 4. Migración `087_tipos_vehiculo_stock.sql` (solo datos, comillas simples por el `sql_mode` ANSI de
  producción). **Criterio:** el escenario "Copia de producción".
- [x] 5. Revisión del diff (Codex) y `openspec validate --strict`.
- [x] 6. Producción, por orden del dueño del 19/11: respaldo de la base, 087, backend y front.
- [x] 7. `openspec archive tipos-de-vehiculo`.
