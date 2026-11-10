# Tareas — cuil-en-consulta

- [x] Tests de `formatearCuil`, `verificarSituacion`, `construirRespuestas` y `obtenerConsulta` (en rojo)
- [x] Migración 076 y `schema.prisma`, aplicada en local
- [x] Implementar: guardar en `verificarSituacion`, mostrar en `construirRespuestas` y `obtenerConsulta`
- [x] Tests en verde (969), `openspec validate --strict`
- [x] Revisión de código: sin hallazgos críticos ni altos
- [ ] Probar en el panel
- [ ] `openspec archive cuil-en-consulta`
- [x] Producción: aplicada la 076 ANTES de subir el backend (`desplegar-produccion.mjs` no la toma; sin la columna, las consultas dan 500)
