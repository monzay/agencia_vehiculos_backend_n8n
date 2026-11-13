# Importar la lista por etapas

> Pedido del dueño el 2026-11-12: la importación "no funciona del todo bien". Plan aprobado el 2026-11-12.
> Reglas que fijó el dueño: no se toca la estructura de la base, solo se extraen campos que ya existen, en
> el vehículo que ya está cargado se edita lo necesario, y nada se inventa.

## Why

La importación solo crea vehículos. Si la lista nueva trae un auto que ya está cargado con otro precio, no
lo reconoce (pide modelo, versión, año y kms idénticos) y no lo puede actualizar: queda como "parecido" y,
si se tilda, se duplica.

Probado con dos listas reales del dueño (`backups/listas-prueba-2026-11/`):

- La lista de la agencia (tabla prolija) se lee bien. Falla el reconocimiento.
- La foto de la lista de DGC no se lee: está sacada en ángulo, cada renglón sube unas dos filas de
  izquierda a derecha, y los precios y los kms están en miles. El modelo actual inventa marcas y modelos;
  el nuevo, leyendo la hoja de una vez, le pone a un auto los datos del de al lado sin avisar. Con la foto
  enderezada por franjas y ampliada, Haiku 5.5 leyó exactas 44 de 45 filas.

## What Changes

La importación pasa a ser una cadena de etapas. Cada una hace una sola cosa y la siguiente la controla.

1. **Subir.** Las imágenes de lista se guardan más grandes (2576 px) y, además, cortadas en franjas
   enderezadas y ampliadas. Los PDF van enteros.
2. **Leer** (Opus 5.5). Una lectura por franja o por PDF. Copia cada fila tal cual está escrita y después
   la separa en campos. Lo que la lista no trae queda vacío; lo que no se lee bien queda vacío, marcado
   como dudoso y con el motivo. No deduce nada: tampoco la marca.
3. **Normalizar** (código). Convierte las listas en miles, empalma las franjas, controla la forma de la
   patente y deja solo los campos que ya existen.
4. **Consultar el stock** (código). Los vehículos vigentes y no vendidos, con sus datos actuales.
5. **Cruce exacto** (código). Misma patente, o mismo modelo, versión y año con un solo candidato.
6. **Razonamiento** (Haiku 5.5). Solo para lo que el cruce exacto no resolvió: "es el mismo", "es nuevo" o
   "tengo dudas", con el motivo.
7. **Verificación** (código). No le cree a la IA sin controlar. Calcula qué cambia en cada vehículo.
8. **Revisión** (persona). Cambios, nuevos y dudas. Nada se guarda sin confirmar.
9. **Aplicar** (código). En una transacción crea los nuevos sin publicar y edita los existentes.

Cambios de comportamiento:

- **Se edita el vehículo que ya existe.** Los precios (lista, contado, anticipo) que cambiaron se
  actualizan. Los datos que el vehículo tiene vacíos (versión, kms, combustible, patente) se completan.
  Un dato ya cargado que difiere no se pisa: se muestra.
- **Se guarda la patente** cuando la lista la trae, en la columna `autos.dominio` que ya existe. Es la
  clave más segura para reconocer el mismo auto de un mes al otro. Sigue sin verse en la web pública.
  Cambia la decisión del 2026-11-10 de descartarla.
- **Las dudas se explican.** Cada duda muestra el texto original de la fila y el motivo.
- **La lectura queda en el gasto de IA** del panel (`ia_consumos`, tabla existente).
- **La imagen de la lista la lee Opus 5.5** (decisión del dueño del 2026-11-13). Solo esa función: el
  razonamiento del cruce sigue en Haiku 5.5, y Documentos y el bot no cambian. Opus cuesta 40 veces más
  por token: una hoja por franjas pasa de unos USD 0,014 a unos USD 0,55 (estimado, sin medir). El gasto
  se registra con el precio del modelo usado; hoy `costoClaude` solo conoce el de Haiku 5.5.

## Impact

- **Base de datos: sin cambios.** No hay migración. Se usan las tablas y columnas de la 081.
- Queda fuera, por no tocar la base: historial de precios, contador de actualizados y "Deshacer
  importación".
- Ruta nueva `POST /api/vehiculos/importar/cruzar` (solo admin, con límite por usuario).
- `POST /api/vehiculos/importar` recibe `crear` y `actualizar`. Durante el deploy acepta también
  `vehiculos` como hasta ahora.
- `vision-claude.js`: el modelo y el esfuerzo se eligen por llamada y la lectura devuelve el consumo. El
  escaneo de Documentos no cambia de modelo.
- Front: la ruta de subida prepara las franjas (ya tiene `sharp`); el modal de importación muestra las
  etapas y la revisión por grupos.
- Riesgo a verificar al implementar: una foto de cámara de más de 4,5 MB puede no pasar por la ruta de
  subida en producción. Si se confirma, la foto se reduce en el navegador antes de subirla.
- Orden de deploy, solo cuando el dueño lo pida: backend y después front.
