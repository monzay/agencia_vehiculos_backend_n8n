# Seguimiento del trámite y salida segura

> Decisiones del dueño del 2026-11-03. Fase 2 del flujo de la consulta a la entrega.

## Why

Una vez en el legajo, el admin no sabe qué falta. Además, hoy se puede marcar vendido sin firmar,
desfirmar un auto vendido y deshacer una venta con cuotas activas; deshacer la venta de una
consignación da error siempre; un trámite no se puede cancelar desde el panel, y la web sigue
ofreciendo un auto con trámite abierto que el bot da por reservado.

## What Changes

- **`tramites-seguimiento` (ADDED)**: lista de pasos calculada por el backend según la modalidad,
  con el próximo paso. No se guarda: sale de los datos que ya existen.
- **`tramites-venta` (ADDED)**: vendido exige boleto firmado; no se desfirma un auto vendido; no se
  deshace una venta con financiación activa; se arregla deshacer la venta de una consignación.
- **`tramites-cancelar` (ADDED)**: botón Cancelar trámite con frenos.
- **`vehiculos-catalogo` (ADDED)**: un auto con trámite abierto sale de la web, igual que para el bot.
- En Financiación, acceso al legajo de la cuota.

## Impact

- Sin migración.
- Cambia un hábito: un trámite vendido sin firmar ya no se puede hacer.
- Los vendidos sin firmar que ya existan no se tocan: su venta se puede deshacer y su próximo paso
  queda en firmar.
- El comprador de un auto consignado sigue igual, por decisión del dueño.
- El catálogo público muestra menos autos: los que tienen un trámite de venta abierto.
