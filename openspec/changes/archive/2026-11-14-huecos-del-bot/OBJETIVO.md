# OBJETIVO

> Escrito el 2026-11-14. Este archivo es del user: Claude no lo modifica.

Parchar todos los huecos del bot que responde todas las consultas y simula ser un asesor de ventas de agencias de vehículos.

## 1. Memoria del cliente a largo plazo

El bot tiene que conservar todo el contexto de la consulta  durante  un mes en caso  de que pase el mes se  le  pregunta de nuevo todas las pregunta  porque  peude cambiar  la situacion del cliente ,
en caso de que  el  cliente este interesado en otro vehiculo en el plazo de un mes que ese consulta  le siga perteneciendo al asesor  que  se le asigno la  consulta asi como tambien se aplique a las consultas que entraron  por la url de un asesor
en caso contrario de que  un cliente entro por  la ulr de otro asesor  se le asigan al dueño de la  url  y sigue manteniendo el contexto  y que  se  le muestre al nuevo asesor  todo el contexto

si el cliente le intereso  otro  vehiclo en el tiempo de 1 mes no crear  una nueva consulta   , avisar  al asesor  que el cliente esta interesado el otro  vehiculo  y marcalo  como pendiente  en caso de  ya fue marcado como atendida  y que se reposicione mas arraba  para mostrarle al asesor

## 2. Asignación de asesor

Regla general:

Si un cliente ya hizo una consulta y fue asignado a un asesor, y vuelve a consultar dentro de los 1 mes la consulta le sigue perteneciendo a ese asesor.
Si ya pasaron los  plazo la nueva consulta entra al sistema de repartición equitativa.

Excepción:

Si el cliente entró por la URL de otro asesor, la consulta se asigna al asesor de esa URL.

## 3. Audios

El bot tiene que saber interpretar y entender los audios que manda el cliente, y devolver una respuesta.

## 4. Imágenes del vehículo en parte de pago

El bot tiene que preguntar después si el cliente le puede mandar imágenes del vehículo que puede dejar como parte de pago.
Si el cliente las manda:

- Almacenarlas.
- Mostrárselas al asesor.

## Pruebas

para todos estos puntos  hacer un test   y verificarlo con codex

una  vez finalizodo hacer un test con mas  de 1000 consultas  sumuladas  con  distintos ecenario  temporales
confuciones  intesiones  etc en un entorno de desarrollo  simalando que se usa la api de claude code el modelo que se
usa para razonar las pregunta  haiku 5.5  asi como qgrap  creo que se llama la herramienta  para  la traduccion  de
audio a texto  tambine simalanod entrega de imagenes tood dentro de un json simuladdo chat de clientes

## Ajustes

<!-- Si al revisar el plan querés cambiar algo, anotalo acá. -->

**2026-11-14** (respuestas del user en el chat, copiadas tal cual):

- "Si el cliente vuelve dentro del mes por el mismo auto y la consulta estaba atendida, ¿también vuelve a
  pendiente y sube?" → si
- "¿Cuánto tiempo se guardan las fotos?" → mejor que no se haga nada que no se guarden las imgs tampoco que
  las pida que este asi como funciona esa parte
- okey que los test solo sean a nivel local usandol base de datos local que quede claro

## Aprobación

<!-- Cuando el plan esté bien, agregá: Aprobado: AAAA-MM-DD -->

Aprobado: 2026-11-14 (el user en el chat: "aproba el plam esta de 10/10 par escribri codigo usa sonnet
pasamos a la fase 2")
