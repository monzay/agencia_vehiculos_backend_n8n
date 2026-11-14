# Vehículos numerados y sin la ref a la vista

> Pedido del dueño el 2026-11-14, sobre la lista de Vehículos del panel.

## Why

La lista mostraba "REF 86" debajo de cada vehículo. La ref es el identificador interno y no le dice nada a
quien usa el panel; el dueño prefiere ver la lista numerada, como la lista en papel.

## What Changes

- **`vehiculos` (ADDED)**: la lista de Vehículos numera las filas 1, 2, 3… en el orden en que se muestran.
  El número sigue al orden y a los filtros elegidos: no es un dato del vehículo.
- **`vehiculos` (ADDED)**: la sección Vehículos no muestra la ref (lista, ficha de detalle y aviso de
  eliminar).

## Impact

- Solo el front. Sin cambios en la base ni en la API: la ref sigue siendo el identificador interno y la
  siguen usando el bot, las señas, Documentos y la búsqueda.
- Otras secciones (Señas, Documentos, selector de vehículo, Importar lista) siguen mostrando la ref.
