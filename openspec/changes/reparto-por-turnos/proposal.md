# Reparto por turnos de las consultas

> Pedido del dueño el 2026-11-10. Decisiones: las consultas se reparten por turnos, el reparto viene
> encendido y con todos los asesores habilitados, si ningún asesor participa quedan sin asignar, y si el
> cliente de Juan vuelve por el link de Pepito la consulta pasa a ser de Pepito.

## Why

Hoy nadie asigna las consultas que llegan sin link: quedan sin asesor. El interruptor "Repartición
equitativa" del panel solo ocultaba la columna del asesor, y el switch por asesor ("recibe consultas") no
lo lee ningún código. Además hay un error: el link de un asesor solo vale cuando la consulta nace. Si el
cliente ya tenía una consulta abierta (menos de 24 horas), el código `[AS:<slug>]` se ignoraba y la consulta
seguía con el asesor anterior; al abrir la consulta de otro auto se copiaba el asesor de la anterior aunque
el cliente llegara por el link de otro, o aunque ese asesor ya estuviera inactivo o borrado.

## What Changes

- **`agente-conversacion` (ADDED)**: reparto por turnos. Cada consulta nueva sin link válido se asigna en
  ronda a los asesores habilitados (activos, no borrados, con "recibe consultas" y sin cuenta de
  administrador), en orden de `id`. El puntero es la clave `reparto_ultimo_vendedor` de `configuracion`, y
  se lee con `SELECT ... FOR UPDATE` dentro de una transacción para que dos consultas simultáneas no reciban
  el mismo turno. Con el reparto apagado (`reparticion_equitativa`) o sin nadie habilitado, queda sin asignar.
  Solo se reparte al crear la consulta.
- **`agente-conversacion` (MODIFIED)** "Consultas que llegan desde la web": el link de un asesor activo gana
  siempre. La consulta en la que sigue la charla (nueva, abierta, o la de otro auto que se abre o retoma)
  pasa a ser de ese asesor, con `atribuido`, aunque tuviera otro y aunque ese asesor no participe del turno.
  Un código inválido se ignora. Sin link, la consulta nueva va por turno (antes: sin asignar).
- **`agente-conversacion` (MODIFIED)** "Una consulta por auto": la consulta que se abre por otro auto ya no
  copia siempre al asesor. Primero el link del mensaje; si no hay, hereda al de la consulta actual mientras
  siga activo y no borrado; si no, va por turno. Al retomar una consulta, el link también la reasigna.
- **Configuración**: `obtenerConfig` devuelve solo las claves conocidas (el puntero no sale por la API) y
  `actualizarConfig` no puede escribirlo.
- **Panel (solo textos y la columna)**: la columna del asesor en Consultas se muestra siempre; Configuración
  explica el reparto por turnos con lo que de verdad hace; Asesores dice "reparto por turnos". Se corrigen
  comentarios desactualizados.

## Impact

- Migración `082`: inserta `reparto_ultimo_vendedor` (NULL), deja `reparticion_equitativa` en `1` y pone
  `recibe_consultas = 1` a todos los asesores no borrados. No cambia el schema de Prisma. Va antes que el backend.
- Una consulta nueva abre una transacción corta (el turno). Las consultas con link o heredadas no la abren.
- El bot viejo de n8n no se toca. No hay pantallas ni funciones nuevas en el panel.
- No cambia: las consultas ya abiertas sin asesor no se reasignan en mitad de la charla, salvo por el link de
  un asesor. Los asesores vinculados a una cuenta de administrador no entran al turno.
