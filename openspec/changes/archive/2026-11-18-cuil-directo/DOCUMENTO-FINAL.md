# Documento final — cuil-directo

Cambio terminado en local el 2026-11-18. No está en producción.

- **Backend:** rama `feat/cuil-directo`. Commits `4178a8d` (plan), `83b12c2` (tareas 1 a 4), `7a50e7b` (simulador)
  y el de cierre.
- **Front:** rama `feat/cuil-directo`, commit `93293db`.

Las dos ramas salen de `feat/ajustes-por-chats-reales`, que tampoco está en producción.

## 1. Qué cambia para el cliente

**Antes:** cuando el cliente financiaba y decía si tenía recibo o garante, el bot mandaba un mensaje largo:
- la Central de Deudores del BCRA;
- "tus datos se usan solo para eso";
- el link a la política de privacidad;
- "respondeme sí o no".

Con el "sí", pedía el CUIL.

**Ahora:** una sola pregunta:

> ¿Me pasás tu CUIL? Así el asesor puede consultar tu situación en la Central de Deudores del BCRA.

Si manda el CUIL, se consulta. Si pregunta para qué es o qué hacen con sus datos, el bot contesta en una línea
y le pasa el link de la política. Si dice que no quiere pasarlo, no insiste y sigue con el recorrido.

**La web:** el pie de todas las páginas públicas (portada, catálogo, ficha de cada auto y /privacidad) tiene el
link "Política de privacidad". La consulta de cuotas, que pide el DNI y no usa el pie, también lo tiene.

## 2. Decisiones

Las cinco que aprobó el dueño el 2026-11-18:
1. Mandar el CUIL es la autorización.
2. El link solo si el cliente pregunta.
3. El link en el pie de la web.
4. Un CUIL que llega antes de que el bot diga para qué es no se consulta: el bot explica y le pide que lo
   reenvíe.
5. Un "no" se guarda solo si es claro.

Cómo se lleva al sistema:
- **Cuándo se guarda el "sí":** cuando llega un CUIL válido y del cliente, en el mensaje que se responde,
  después del **aviso**.
  - El aviso es un mensaje de la agencia, en esta consulta y antes de ese mensaje, que nombra el CUIL y la
    Central de Deudores o el BCRA.
  - El "sí" lleva el `wamid` del mensaje del CUIL. En una ráfaga, el del mensaje que lo trae.
- **Lo que no autoriza:**
  - un CUIL anticipado;
  - un CUIL tomado de mensajes anteriores;
  - un CUIL de otra persona, que queda solo como "CUIL informado" para el asesor.
- **`registrar_consentimiento`:** guarda solo el "no". Un "sí" pedido por la IA se rechaza en la función de
  dominio.
- **Las respuestas viejas siguen valiendo:** con un "sí" al permiso anterior, el CUIL se consulta apenas llega;
  con un "no", no se pide.

## 3. Cómo se hizo y cómo se verificó

- **Plan:** 15 rondas de revisión de Codex (`REVISION-PLAN.md`) y aprobación del dueño.
- **Método:** tests primero en cada tarea, revisados por Codex y congelados. Código de Sonnet 5.5 y diff
  revisado por Codex. Detalle en `BITACORA.md`.
- **Suite del backend:** 1964 de 1966.
  - 1 salteado: el test real de la 086 sin `.env`.
  - 1 que falla: el test de anclas, por dos causas.
    - Las de `importar-lista-por-etapas`, que ya fallaban.
    - Las 5 de la spec vigente `agente-herramientas` que apuntan a tests renombrados. Se arreglan con el
      `openspec archive` del paso 8 de producción.
- **Front:**
  - `npm test`: 32 de 32;
  - Playwright contra el stack local: 3 de 3.
- **Simulador con Haiku 5.5 simulado:** 19 de 19 chats con guion (P10 a P14 nuevos o reescritos), 0 intentos de
  red y US$ 0. Ninguna prueba llamó a Claude, WhatsApp, BCRA ni Blob reales.

## 4. Lo que quedó como límite

- **Las instrucciones nuevas no se probaron con el Haiku real.** El simulador pone el texto del bot con un
  guion. Para saber si el Haiku real pide el CUIL con la frase nueva, hace falta ver conversaciones de
  producción después del deploy.
- **Dos números pegados con un solo espacio** ("4 20123456786") se leen como uno y el CUIL no se reconoce. El
  bot pide que lo reenvíe: falla para el lado seguro.
- **Nota legal:**
  - El mensaje corto no informa los derechos del titular (Ley 25.326, art. 6): quedan en la política
    publicada. Es decisión del dueño.
  - Conviene que lo revise el abogado pendiente, junto con la autorización del BCRA y la AAIP.

## 5. Para pasar a producción (solo con la orden del dueño)

1. Antes, **`ajustes-por-chats-reales`** completo, con su migración 086 (ver su `DOCUMENTO-FINAL.md` § 6).
   Este cambio va arriba de ese.
2. **Política publicada en producción:** tiene que decir para qué se usa el CUIL (la consulta a la Central de
   Deudores), quién lo ve (el asesor de la agencia) y los derechos del titular. No puede decir que el permiso
   se pide por WhatsApp. Si no, el admin publica una versión nueva desde el panel **antes** del backend. Los
   "sí" nuevos quedan atados a esa versión.
3. Respaldo de la base de producción.
4. Sin migración propia.
5. Backend de `feat/cuil-directo`, después de mergear.
6. Front de `feat/cuil-directo` (deploy de Vercel al mergear a `main`).
7. n8n no cambia.
8. Después del deploy:
   - Probar desde el celular una charla que financie: que pida el CUIL con la frase nueva, sin link, y que lo
     consulte.
   - Archivar en este orden:
     - `openspec archive cuil-en-consulta`;
     - `openspec archive ajustes-por-chats-reales`;
     - `openspec archive cuil-directo`.
     Probado en una copia: aplica sin errores.
   - Actualizar la bóveda.
