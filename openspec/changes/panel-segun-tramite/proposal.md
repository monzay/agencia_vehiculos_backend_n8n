# El panel muestra solo lo que corresponde a cada trámite

> Pedido del dueño el 2026-11-09.

## Why

El panel pide y muestra datos que solo tienen sentido en algunos trámites (CBU, estado de la unidad
recibida) y conserva elementos que el dueño ya no usa: la conversión en Resumen, el filtro de tipo en
Consultas y el enlace a la consulta desde el legajo.

## What Changes

- **`tramites-panel` (ADDED)**: CBU y alias solo en la consignación, tanto en el formulario como en
  el legajo.
- **`tramites-panel` (ADDED)**: el boleto pide el estado de la unidad solo si la agencia recibe un
  vehículo.
- **`tramites-panel` (ADDED)**: Resumen sin conversión, Consultas sin filtro de tipo y legajo sin
  "Ver consulta".

- **`tramites-panel` (ADDED)**: la sección Preparación sale del menú y lo que hacía pasa a una pestaña
  Publicación del legajo en Documentos. Documentos es solo del admin, así que los asesores dejan de verla.

## Impact

- Solo cambia el panel: sin migración y sin tocar el bot. Las rutas `/api/leads/conversion` y
  `/api/consultas/venta` quedan en el backend, como pasó con la sección Consignaciones.
- El CBU ya guardado en una ficha no se borra, y el boleto impreso lo sigue usando si existe.
- En una compra de la agencia ya no se carga: el boleto dice "por transferencia" sin la cuenta.
- El bot no crea consultas de venta, así que quitar el filtro de tipo no esconde consultas nuevas.
