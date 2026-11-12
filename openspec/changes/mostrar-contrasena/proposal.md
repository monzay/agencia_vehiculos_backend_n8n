# Ver la contraseña mientras se escribe

> Pedido del dueño el 2026-11-12.

## Why

En el login y al crear o editar un asesor, la contraseña se escribe a ciegas. Un error de tipeo
recién se nota cuando el login falla o cuando el asesor no puede entrar.

## What Changes

- **`panel-contrasenas` (ADDED)**: todo campo de contraseña del sistema tiene un botón con un ojo
  que muestra u oculta lo escrito. Arranca oculto, no borra lo escrito y se usa con teclado y
  lector de pantalla.

## Impact

- Componente nuevo `components/interfaz/campo-contrasena.jsx`. Lo usan el login
  (`formulario-login.jsx`) y el `Campo` del panel cuando es de tipo contraseña (Asesores), así que
  un campo de contraseña nuevo trae el ojo solo.
- Sin cambios en el backend ni en la base.
