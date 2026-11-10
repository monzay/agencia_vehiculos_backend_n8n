# Importar la lista de vehículos

> Pedido del dueño el 2026-11-10. Plan aprobado el 2026-11-10 con estas decisiones: los autos entran sin
> publicar, la versión va en una columna propia y de la lista solo se guardan los campos del formulario.

## Why

Hoy el stock se carga de a un auto. La agencia ya tiene la lista del catálogo en papel, en PDF o en foto,
y quiere cargar todos los autos de una vez sin que subir dos veces la misma lista los duplique.

## What Changes

- **`vehiculos-importacion` (ADDED)**: Vehículos ofrece "Importar lista". Acepta hasta 6 archivos (PDF o
  imagen, o foto con la cámara). La IA lee cada fila y el panel muestra una propuesta para revisar. Nada
  se guarda sin que una persona confirme.
- **`vehiculos-importacion` (ADDED)**: de cada fila solo se guardan los campos del formulario de vehículo.
  Color, dominio, observaciones y cualquier otro dato de la lista se descartan.
- **`vehiculos-importacion` (ADDED)**: hay dos frenos contra los duplicados:
  - La huella SHA-256 de cada archivo original es única. El mismo archivo no se vuelve a leer ni a importar.
  - Cada fila se compara con el stock por modelo y versión (sin importar el orden de las palabras ni las
    tildes), año y kms. Lo que ya está cargado no se puede crear. El servidor lo vuelve a verificar al
    confirmar.
- **`vehiculos-importacion` (ADDED)**: los autos importados entran sin publicar y quedan atados a su importación.
- **`vehiculos` (ADDED)**: el vehículo tiene `version`. El formulario la carga y la API la devuelve.
- **`vehiculos` (ADDED)**: el formulario de vehículo permite publicar y despublicar. Hasta ahora no había
  cómo, y sin eso un auto importado quedaría oculto para siempre.

## Impact

- Migración `081`: tablas `importaciones_vehiculos` e `importaciones_vehiculos_archivos`, y columnas
  `autos.version` y `autos.importacion_id`. Va antes que el backend.
- Ruta de subida del front: destino nuevo `listas`, en el store privado de documentos, que acepta PDF. El
  archivo se guarda con su huella como nombre.
- `vision-claude.js` acepta PDF además de imágenes, y una respuesta cortada por largo da un error propio.
- El bot no se toca: no lee `version` ni ve autos sin publicar.
- La lectura usa el mismo modelo de visión que el escaneo de Documentos. No se registra en el gasto de IA
  del panel, igual que ese escaneo: `costoClaude` tiene precios de otro modelo y registraría un costo falso.
