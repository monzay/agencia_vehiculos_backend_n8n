# Documento final — huecos-del-bot

> Cambio OpenSpec `huecos-del-bot`, del 14/11/2026. Rama `feat/huecos-del-bot` del backend, 11 commits sobre `main`,
> **solo en local**: no se subió nada a producción. Armado a partir de la spec, `tasks.md` y `BITACORA.md`.

## 1. Qué cambia para el cliente y para el asesor

| Situación | Antes | Ahora |
|---|---|---|
| El cliente vuelve dentro del mes | A las 24 h se abría una consulta vacía: el bot volvía a preguntar todo y podía tocarle otro asesor | Sigue en la **misma consulta** (30 días desde el último mensaje), con el mismo asesor y sus respuestas: el bot no le repregunta |
| Vuelve con 30 días o más | — | Consulta **nueva**: el bot pregunta todo de nuevo y **no ve la charla vieja**; va por turno o al asesor del link |
| Le interesa **otro auto** dentro del mes | Se abría otra consulta por cada auto | **Misma consulta** con el auto nuevo, aviso **"Ahora le interesa X, antes Y"**, vuelve a pendiente y sube en la lista. Vale aunque tenga trámite o seña |
| Escribe en una consulta **atendida** | El asesor no se enteraba | Vuelve a pendiente con el aviso **"Volvió a escribir"** y sube. También con el bot en pausa (el bot sigue sin responder) |
| Llega por el **link de otro asesor** | La consulta pasaba al del link, sin aviso | Le llega **completa**, pendiente, arriba y con **"Llegó por tu link"** (con otro auto en el mismo mensaje: "Llegó por tu link. Ahora le interesa X, antes Y") |
| Lista de Consultas | Ordenada por fecha de inicio | Ordenada por la **última novedad** (al abrirse, cambiar de auto, volver a escribir en una atendida o pasar de asesor por link) |
| Audios | — | Sin cambios: ya se transcriben con Groq y el bot responde (confirmado con tests y en la simulación) |
| Fotos | — | Sin cambios, por decisión del dueño: el bot las ve, no las guarda ni las pide |

No cambian: la ventana de 24 h de WhatsApp para escribirle al cliente desde el panel (regla de Meta), el reparto por
turnos, los cupos ni los topes de costo. El front no cambia: el aviso ya se mostraba y el orden lo da el backend.

## 2. Decisiones

**Del dueño:** 30 días, con el mismo criterio que antes las 24 h (desde el último mensaje; con 30 justos ya vence);
el mismo auto en una consulta atendida también la reabre; fotos sin cambios; todas las pruebas locales; Claude y
Groq simulados en la prueba masiva; código escrito con Sonnet.

**Tomadas por Claude durante la implementación (para confirmar):**
- Con el link de otro asesor y otro auto en el mismo mensaje, el aviso dice las dos cosas.
- El aviso "Llegó por tu link" sale solo cuando el link **cambia** el asesor (incluido de ninguno a uno).
- Las consultas viejas sin fecha de inicio no le mandan historial previo a Claude (no se puede saber dónde empiezan).
- Al aplicar la migración, las consultas sin fecha de inicio quedan al final de la lista (como hoy).

## 3. Cómo se hizo y cómo se verificó

- **Plan:** revisado por Codex en 9 rondas antes de escribir código (21 hallazgos; 20 reales y corregidos), más los
  ajustes del dueño.
- **Cada tarea:** tests primero (Sonnet), revisados por Codex, congelados (con huella), código (Sonnet) sin tocar los
  tests, suite completa, revisión del diff por Codex y commit con su entrada en la bitácora.
- **Tests:** 1466 en la suite; falla solo uno previo y ajeno (anclas de otro cambio, `importar-lista-por-etapas`).
  `openspec validate --strict` pasa y ningún escenario del cambio quedó sin test.
- **Simulación:** 1200 consultas con Claude y Groq simulados, en una base local aparte y con la red cortada: **1200 de
  1200 OK, 0 intentos de red**, cubriendo todos los valores de 8 ejes (tiempo, asesor, autos, atención, medios, pausa,
  conducta, manipulación). La base de desarrollo quedó igual antes y después.

## 4. Errores encontrados en el camino (y corregidos)

- La regla nueva "vuelve a escribir" chocaba con un test de la tarea 4: se ajustó para mirar el estado final.
- El aviso combinado de link y auto **no habría salido nunca en la base real**: se comparaban fechas al milisegundo y
  la base guarda al segundo. La base simulada no lo mostraba; se agregó un test que redondea como la base real.
- Las consultas viejas sin fecha de inicio le podían pasar charla anterior a Claude.
- En el simulador: un test imprimía la clave real de Anthropic al fallar; Prisma reponía las claves borradas desde
  el `.env`; una seña de prueba dejaba un auto fuera de venta para los casos siguientes.

## 5. Observaciones que quedaron sin cambiar

- Si en un mismo turno la IA registra otro auto, el contexto de ese turno todavía nombra el auto anterior (ya pasaba
  antes; el auto nuevo lo eligió la propia IA).
- Dos entregas simultáneas del mismo mensaje con el panel marcando atendida en el medio podrían reabrirla dos veces
  (un solo proceso y atención de a un mensaje por teléfono: el peor caso es un aviso de más).
- La consulta que sube en la lista sigue mostrando su fecha de inicio; el aviso sí trae la fecha de la novedad.
- La prueba opcional de un audio real con Groq no se hizo.

## 6. Para pasar a producción (solo con la orden del dueño)

1. Migración `prisma/migrations_manual/084_sesiones_orden_at.sql` en la base de producción (se puede correr dos
   veces; sin permisos nuevos). Va **antes** del backend.
2. Backend de la rama `feat/huecos-del-bot` (después de mergear a `main`).
3. El front no cambia.
4. Después: `openspec archive huecos-del-bot` y actualizar el estado en la bóveda ("BOT CON RAZONAMIENTO", sección 13,
   y "Plan de mejora del bot").

Desde el deploy: cada cliente genera menos consultas (una por mes en vez de una por día o por auto), así que el
Resumen y la conversión cuentan distinto. Un cliente con una consulta de menos de 30 días vuelve a esa misma.
