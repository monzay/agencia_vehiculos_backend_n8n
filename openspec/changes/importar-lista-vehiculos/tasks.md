# Tareas — importar-lista-vehiculos

- [x] Migración 081 aplicada en local y `schema.prisma` actualizado
- [x] Backend: tests en rojo de la lectura, la clasificación y la importación
- [x] Backend: `lista-vehiculos.js`, servicio, rutas y PDF en `vision-claude.js`
- [x] Backend: versión en el formulario y en la API
- [x] Front: tests en rojo de la huella, el PDF y la propuesta
- [x] Front: destino `listas` en la subida, modal "Importar lista", versión y "Publicado" en el formulario
- [x] Prueba E2E con Playwright
- [x] Suite del backend y del front, ESLint en los archivos tocados, `npm run build` y `openspec validate --strict`
- [x] Revisiones de código, seguridad, React y base de datos (sin CRITICAL ni HIGH de código; HIGH de base resuelto con READ COMMITTED)
- [x] Arreglos de las revisiones: condición y combustible en la propuesta, año válido, error que nombra el vehículo,
  aviso de filas descartadas, límites por usuario en leer e importar, tope de píxeles y mensajes genéricos en la subida,
  charset de las tablas nuevas y rollback ensayado en local
- [ ] Prueba del dueño con una lista real
- [ ] `openspec archive importar-lista-vehiculos`
