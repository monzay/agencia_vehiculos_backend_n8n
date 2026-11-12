# Tareas — consultas-por-asesor

- [x] Tests en rojo: alcance, listados, detalle y acciones, clientes, novedades
- [x] Backend: alcance desde la base, listados, detalle y acciones con 404, `/api/leads` lista y detalle solo admin, novedades
- [x] Panel: Clientes solo para el admin
- [x] E2E: asesor y admin
- [x] Tests en verde, `openspec validate --strict`, `npm run build` del panel
- [x] Revisión de código y de seguridad: cerrado por defecto (sin alcance no se ve nada), alcance leído de la base, 404 igual que inexistente, señas e ingresos ya eran solo admin. Probado en vivo: asesor 404/0/403, admin 200/1/200
- [x] Producción (pedido del dueño el 2026-11-12): backend `99b8db2` desplegado (copia `/opt/agencia/backend.bak.20261112-133503`), front `92ab96a` en `main` (Vercel Ready). Verificado: admin ve consultas, venta, clientes y resumen (200); sin sesión, clientes 401
- [ ] Prueba del dueño con un asesor real
- [ ] `openspec archive consultas-por-asesor`
