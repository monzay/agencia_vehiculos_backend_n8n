# Cada asesor ve solo sus consultas

> Pedido del dueño el 2026-11-12.

## Why

Hoy cualquier usuario del panel ve todas las consultas: un asesor ve las de los otros asesores,
puede abrir su chat, responderles y devolverlas al bot. La sección Clientes le muestra además a
todos los clientes de la agencia.

## What Changes

- **`panel-acceso` (ADDED)**: el alcance de un usuario sale de la base, no del token. El admin ve
  todas las consultas; un asesor, solo las de su ficha de asesor (`sesiones.vendedor_id =
  usuarios.vendedor_id`); un usuario sin ficha, inactivo o borrado, ninguna.
- **`panel-acceso` (ADDED)**: el listado de Consultas (compra y venta/consignación) aplica ese alcance.
- **`panel-acceso` (ADDED)**: el detalle y las acciones sobre una consulta fuera del alcance
  (marcar atendida, responder, devolver al bot) responden 404, igual que si no existiera.
- **`panel-acceso` (ADDED)**: las consultas sin asesor asignado las ve solo el admin.
- **`panel-acceso` (ADDED)**: la sección Clientes es solo del admin: el menú no la muestra a un
  asesor y la API de clientes (`GET /api/leads` y `GET /api/leads/:id`) le responde 403.
- **`panel-acceso` (ADDED)**: el contador de novedades de Consultas y de Vender/Consignación cuenta
  solo las consultas que el usuario puede ver; el de Clientes da 0 a un asesor.

## Impact

- Sin migración: `sesiones.vendedor_id` y `usuarios.vendedor_id` ya existen.
- Resumen no cambia: sus números siguen siendo de toda la agencia (decisión del dueño).
- Un asesor que hoy tiene el panel abierto deja de ver las consultas ajenas al recargar.
- En producción hoy no hay asesores: hasta que se carguen, toda consulta nueva queda sin asignar y
  la ve solo el admin.
