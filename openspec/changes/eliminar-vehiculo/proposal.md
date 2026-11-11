# Eliminar vehículos desde el panel

> Pedido del dueño el 2026-11-11.

## Why

El dueño quiere sacar vehículos del sistema desde la sección Vehículos. La API ya tenía la ruta
(`DELETE /api/vehiculos/:ref`, solo admin, borrado lógico), pero el panel no tenía ningún botón que la
usara y no había tests que fijaran quién puede borrar ni qué hace el borrado.

## What Changes

- **`vehiculos` (ADDED)**: solo el admin elimina un vehículo; un asesor recibe 403 y sin sesión 401.
- **`vehiculos` (ADDED)**: eliminar es un borrado lógico. El auto queda guardado con `deleted_at` y
  `disponible = false`, y sale del catálogo y del panel. Un auto que no existe o ya fue eliminado da 404.
- **`vehiculos` (ADDED)**: en el panel, cada vehículo tiene un botón Eliminar que solo ve el admin. Pide
  confirmación antes de borrar y, al confirmar, el auto desaparece de la lista.

## Impact

- Sin migración y sin cambios en el backend: solo tests de lo que ya hace.
- Front: botón y confirmación en `components/panel/secciones/vehiculos.jsx`, con el `ConfirmarModal`
  que ya usan Asesores y Descuentos.
- No se puede deshacer desde el panel: el auto queda en la base, pero no hay botón para restaurarlo.
- No se frena el borrado de un auto con seña o trámite abierto (YAGNI: hoy no hay ninguno en producción).
