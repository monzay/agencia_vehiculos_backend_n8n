# Tope de imágenes por vehículo

> Pedido del dueño el 2026-11-13.

## Why

Un vehículo podía tener cualquier cantidad de imágenes. El dueño quiere un máximo de 6: la principal y 5 más.

## What Changes

- **`vehiculos` (ADDED)**: crear o editar un vehículo con más de 6 imágenes se rechaza con un error 400.
- **`vehiculos` (ADDED)**: el formulario no deja agregar más de 5 imágenes adicionales a la principal.

## Impact

- Sin cambios en la base.
- Un vehículo que ya tenga más de 6 imágenes se sigue viendo igual. Para guardarle un cambio de imágenes
  hay que dejarlo en 6 o menos.
