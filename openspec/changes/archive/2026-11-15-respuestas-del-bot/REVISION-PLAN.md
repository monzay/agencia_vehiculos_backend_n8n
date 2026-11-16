# Revisión del plan — respuestas-del-bot

Codex revisa el plan y los chats simulados contra `OBJETIVO.md` y el código; Claude verifica cada hallazgo y
corrige el plan. El user aprobó el plan el 2026-11-15, antes de esta ronda.

## Ronda 1 — 2026-11-15

**Veredicto de Codex:** no aprueba (10 altas y varias medias).

| # | Severidad | Hallazgo | Verificación de Claude | Qué se hizo |
|---|---|---|---|---|
| 1 | Alta | El orden del recorrido después del CUIL no está definido y `calificacion.js` no figura en el impacto | No es correcto: el orden completo está en `agente-calificacion` › Lo que falta preguntar, en orden, y `calificacion.js` está en el impacto y en la tarea 5 | Nada |
| 2 | Alta | El recordatorio no tiene una reserva atómica: dos revisiones pueden mandar dos mensajes, y un timeout queda sin política | Correcto | Requisito nuevo "La consulta se reserva antes de enviar": una escritura condicional sobre `recordatorio_en`, sin reintentos |
| 3 | Alta | Si la IA falla, el texto fijo puede salirle a quien avisó "más tarde te escribo"; `recordatorio_en` no distingue enviado de descartado | Correcto | El texto fijo no sale si el último mensaje del cliente avisa una demora. `recordatorio_en` pasa a ser "cuándo se evaluó", haya salido o no |
| 4 | Alta | Faltan los límites exactos de 10 y 60 minutos | Correcto en parte: 9 minutos y más de una hora ya estaban | Escenarios "Justo a los 10 minutos" y "Justo a los 60 minutos" |
| 5 | Alta | No se comprueba la ventana de 24 horas de WhatsApp | El recordatorio sale como mucho 60 minutos después del último mensaje del cliente: siempre está dentro de la ventana | Nada |
| 6 | Alta | La tarea 2 no enumera qué servicios externos toca el camino real | Correcto | Tarea 2: lo único real es Claude; BCRA, audio y WhatsApp inyectados, sin `WA_TOKEN` ni `GROQ_API_KEY` |
| 7 | Alta | La medición del nivel de razonamiento no dice con cuántas repeticiones ni con qué criterio | Correcto | Tarea 10: 2 repeticiones por nivel, con los mismos controles y la misma revisión que una ronda |
| 8 | Alta | E1: los dos mensajes seguidos del cliente confunden qué respuesta se evalúa; no hay control del orden permiso → CUIL | Los mensajes seguidos llegan juntos y tienen una sola respuesta (así funciona el bot). El orden lo revisa Codex en la transcripción | Nada |
| 9 | Alta | R1 y R2: el cliente no tiene una pregunta sin contestar cuando calla | No es correcto: tras "Financiado" el bot pregunta por el anticipo, y esa es la pregunta que queda sin contestar | Nada |
| 10 | Alta | P7: no queda fijada la hora de cada mensaje | Correcto en parte | P7 aclara las fechas y la hora |
| 11 | Media | Los controles por texto son frágiles ante paráfrasis; faltan controles por auto y por turno (P1, P3, P4, P9, R4) | Cierto: por eso cada chat tiene además su "Debe" y "No debe", que revisa Codex en cada ronda. Los controles automáticos son la red de abajo, no el juez | Nada por ahora; si en la ronda 0 un control da un falso resultado, se corrige el documento |
