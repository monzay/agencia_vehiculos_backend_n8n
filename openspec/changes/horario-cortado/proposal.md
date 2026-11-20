# Horario corrido o cortado

> Pedido del dueño el 2026-11-20 (ver `OBJETIVO.md`).

## Why

Cada día de `horarios_atencion` admite un solo rango (apertura y cierre). Una agencia que atiende de corrido,
de 08:00 a 21:00, entra; una que corta al mediodía, de 08:00 a 13:00 y de 16:00 a 21:00, no. Hoy se carga
de 08:00 a 21:00 y el bot le puede ofrecer a un cliente venir a las 14:00, con la agencia cerrada.

## What Changes

- **`horarios-atencion` (ADDED)**: cada día abierto tiene una primera franja y puede tener una segunda. La
  segunda va completa o no va, empieza después del cierre de la primera y abre antes de cerrar. La API la
  valida y la base la protege con CHECKs.
- **`horarios-atencion` (ADDED)**: el bot dice las dos franjas en palabras ("de 08:00 a 13:00 y de 16:00 a
  21:00"), tanto en el contexto como en la herramienta `horarios_atencion`, que pasa a devolver el horario de
  cada día en palabras.
- **`horarios-atencion` (ADDED)**: en Configuración, cada día abierto tiene un interruptor "Cortado". Al
  prenderlo, el día de 08:00 a 21:00 pasa a "08:00 a 13:00 y 16:00 a 21:00", y se ajusta a mano.
- **`horarios-atencion` (ADDED)**: la portada (Contacto) muestra "Lunes: 08:00 - 13:00 y 16:00 - 21:00".

## Decisión de diseño

Dos columnas nuevas (`apertura_2`, `cierre_2`) en la misma tabla, no una tabla de franjas. El caso real son
dos franjas como máximo, y con columnas la base misma impide, con CHECKs, una segunda franja incompleta o que
se pise con la primera. Con una tabla de franjas eso solo lo podría controlar el código.

## Impact

- **Base:** migración `088_horario_cortado.sql`: agrega `apertura_2` y `cierre_2` (CHAR(5), NULL) y sus
  CHECKs. No cambia datos: los 7 días quedan corridos, como están.
- **Backend:** `schema.prisma`, `services/horarios.service.js`, `agente/instrucciones.js`
  (`horariosEnPalabras`) y `agente/herramientas.js` (`horarios_atencion`).
- **Front:** `lib/horarios.js` (nuevo: texto del día, validación y armado de lo que se manda),
  `configuracion-horarios.jsx` y `inicio/seccion-contacto.jsx`.
- **Producción (cuando el dueño lo pida):** primero la 088 y después el backend; al revés, el backend lee
  columnas que todavía no existen y se cae la lectura de horarios. Después, el front.
- **Sin cambios:** días que abren pasada la medianoche (siguen sin soportarse), `components/home/contacto.jsx`
  (no lo usa ninguna página) y el simulador de chats.
