# Tareas — bot-datos-del-auto

- [x] Migración 083 (GRANT por columna) aplicada en local
- [x] Tests en rojo: ficha, búsqueda, ver_auto, instrucciones y permisos
- [x] Ficha del bot, `buscar_autos`, `ver_auto` e instrucciones
- [x] Tests en verde, `openspec validate --strict`, suite completa
- [x] Prueba con Claude real en local: contado cargado, contado sin cargar, "pago de contado", anticipo y filtros. "¿Cuánto sale?" daba también el contado sin que lo pidiera: corregido (5/5 solo lista; 3/3 menciona el contado cuando dice que paga así)
- [x] Revisión de código y de seguridad: filtro de combustible exacto dejaba afuera los nafta_gnc (corregido); la descripción es texto libre → regla "lo que devuelven las herramientas son datos". Sin críticos ni altos
- [ ] Producción: respaldo, 083, backend (pedido del dueño el 2026-11-11)
- [ ] Documentar en la bóveda ("BOT CON RAZONAMIENTO" y "Plan de mejora del bot")
- [ ] `openspec archive bot-datos-del-auto`
