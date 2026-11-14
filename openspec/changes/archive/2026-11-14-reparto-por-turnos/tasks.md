# Tareas — reparto-por-turnos

- [x] Tests en rojo: `reparto.test.js` (link, herencia, turno, puntero, administradores, reparto apagado, simultáneas)
- [x] Backend: `src/agente/reparto.js` (`asesorDelLink`, `heredarAsesor`, `asesorPorTurno`, `asesorParaConsultaNueva`, `cambioDeAsesor`)
- [x] Tests en rojo y código: `atender.js` (`sesionDe` aplica el link a la consulta abierta y reparte la nueva)
- [x] Tests en rojo y código: `consultas-por-auto.js` (link, herencia vigente o turno al abrir; el link reasigna al retomar)
- [x] Tests en rojo y código: `config.service.js` no expone ni escribe `reparto_ultimo_vendedor`
- [x] Base falsa compartida de pruebas `reparto-de-prueba.js` (bloqueo `FOR UPDATE` modelado)
- [x] Revisiones: el turno atrapa errores (reintento solo ante P2034, si no queda sin asignar), READ COMMITTED con topes, migración 082 con respaldo y rollback exactos (se aplica una sola vez)
- [x] Migración 082 aplicada en la base local (verificada con MySQL real: 6 turnos simultáneos sin repetir)
- [x] Front: columna del asesor siempre visible, textos de Configuración y Asesores, comentarios desactualizados
- [x] Suite del backend, ESLint de los archivos tocados del front, `npm run build` y `openspec validate --strict`
- [ ] Revisión del dueño: probar con asesores reales en el panel
- [ ] Aplicar 082 en producción y desplegar (solo cuando el dueño lo pida; 082 va antes que el backend)
- [ ] `openspec archive reparto-por-turnos` (al archivar, reemplaza los requisitos vigentes y las anclas viejas de
  "sin link de un asesor la consulta queda sin asignar" pueden borrarse junto con su test)
