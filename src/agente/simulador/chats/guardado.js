// Lo que quedó anotado de un cliente simulado al terminar su chat, leído de la base de simulación.
// Recibe `prisma` (el cliente del backend); no lo importa.

export function crearLectorDeGuardado(prisma) {
  return async function leerGuardado(telefono) {
    const { cliente_id: clienteId } = await prisma.cliente_canales.findUniqueOrThrow({
      where: { canal_identificador: { canal: "whatsapp", identificador: String(telefono) } },
      select: { cliente_id: true },
    });
    const sesion = await prisma.chat_estado.findFirst({ where: { cliente_id: clienteId }, orderBy: [{ ultimo_mensaje: "desc" }, { id: "desc" }] });
    const auto = sesion?.auto_id == null ? null : await prisma.autos.findUnique({ where: { id: sesion.auto_id }, select: { ref: true } });
    const permisos = await prisma.consentimientos.count({ where: { cliente_id: clienteId, deleted_at: null } });
    const { _sum } = await prisma.ia_consumos.aggregate({ where: { cliente_id: clienteId }, _sum: { costo_usd: true } });
    const guardado = {
      pago_tipo: sesion?.pago_tipo ?? null,
      anticipo: sesion?.anticipo ?? null,
      entrega_usado: sesion?.entrega_usado == null ? null : Boolean(sesion.entrega_usado),
      auto: auto?.ref ?? null,
      visita: sesion?.visita_propuesta ?? null,
      requiere_vendedor: Boolean(sesion?.requiere_vendedor),
      permisos,
      cuil: sesion?.cuil_informado ?? null,
    };
    return { guardado, costoUsd: Number(_sum.costo_usd ?? 0), clienteId };
  };
}
