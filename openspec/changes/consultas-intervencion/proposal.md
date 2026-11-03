# Intervención humana en las conversaciones (sección Consultas)

> Delta propuesto el 2026-11-01. Pendiente de aprobación del dueño antes de `/feature-dev`.

## Why

La asesora virtual (Claude) atiende sola por WhatsApp. En el panel, la sección Consultas
solo muestra las respuestas **estructuradas** del cliente (preguntas → respuestas), no la
conversación real. Cuando el cliente se enoja o el bot no resuelve, el asesor no tiene cómo:

- ver el chat completo (qué respondió el bot y qué dijo el cliente, en orden), ni
- tomar el control y responder desde el mismo panel.

Hoy, para intervenir, el asesor tiene que escribir desde su propio WhatsApp, por fuera del
sistema, y el bot le sigue respondiendo al cliente en paralelo (doble respuesta).

## What Changes

- **Nueva capacidad `consultas-intervencion`** (ADDED): el chat completo de una consulta en
  el panel, tomar/devolver la conversación, el envío saliente a WhatsApp desde el panel y el
  aviso de la ventana de 24 h de Meta.
- **`agente-entrada` (MODIFIED)**: con la conversación tomada por una persona
  (`sesiones.bot_pausado = true`), el agente MUST registrar lo que escribe el cliente pero
  MUST NOT responder con IA ni enviar nada ni gastar cupo.

### Decisiones del dueño (2026-11-01)

| Tema | Decisión |
|---|---|
| Envío saliente | El backend manda **directo a la Graph API** (ya tiene `WA_TOKEN`; se agrega `WA_PHONE_NUMBER_ID`). No pasa por n8n. |
| Pausa del bot | **Automática** al primer mensaje del asesor desde el panel. |
| Ventana de 24 h | Si está cerrada, el panel **avisa y bloquea** el envío de texto libre (Meta lo rechazaría). Las plantillas quedan fuera de v1. |
| Detección de "cliente harto" | **Manual** en v1. Se reusa el aviso `requiere_vendedor` que ya dispara el Telegram. |
| Memoria al retomar | El bot ve **todo** lo de la pausa: los mensajes del cliente (como `user`) y los del asesor (como `assistant`). Implica incluir `paso_nodo = "humano"` en el historial que arma el agente. |
| Quién interviene | **Cualquier usuario autenticado** del panel. Sin restricción por asesor asignado en v1. |
| Tomar = atendida | Intervenir **marca la consulta como atendida** (reusa `atendido_at`/`atendido_por`). |
| Qué se envía | **Solo texto** en v1 (sin fotos ni audio salientes). |

## Impact

- **Specs**: `consultas-intervencion` (nueva), `agente-entrada` (+1 requisito).
- **Backend**: `agente/atender.js`, `agente/pasos.js`, nuevo `agente/whatsapp-envio.js`,
  `services/consultas.service.js`, `controllers/consultas.controller.js`,
  `routes/consultas.routes.js`, `mappers/consulta.mapper.js`, `.env` (`WA_PHONE_NUMBER_ID`).
- **Front**: nuevo `components/panel/secciones/chat-consulta.jsx`,
  `components/panel/secciones/consultas.jsx`, `lib/api.js`.
- **Base de datos**: sin migración. Reusa `sesiones.bot_pausado` (hoy sin uso en el agente
  nuevo) y `historial_mensajes.paso_nodo` (varchar libre → `"humano"`).
