// Traduce una fila `financiaciones` (con `clientes` y `pagos` incluidos) al shape
// que consume el panel. Los datos de identidad de la persona viven en `clientes`;
// el plan en `financiaciones`; y `pagos` marca qué cuotas ya se pagaron.
//
// El cronograma (fecha de vencimiento de cada cuota y la fecha de fin) NO se
// almacena: se DERIVA del plan → created_at + dia_pago + numero de cuota.

// Devuelve una fecha con el día pedido, recortado al último día del mes cuando
// no existe (ej: día 31 en febrero → 28/29).
function fechaConDia(anio, mes, dia) {
  const ultimoDia = new Date(anio, mes + 1, 0).getDate();
  return new Date(anio, mes, Math.min(dia, ultimoDia));
}

// Construye el cronograma: cuota 1..N con su fecha de vencimiento.
// La 1ª cuota vence el `diaPago` del mes de alta si ese día todavía no pasó;
// si ya pasó, arranca el mes siguiente. Cada cuota suma un mes a la anterior.
function calcularCronograma(altaISO, cantidadCuotas, diaPago, pagados) {
  const base = altaISO ? new Date(altaISO) : new Date();
  const offset = diaPago >= base.getDate() ? 0 : 1;
  const cuotas = [];
  for (let k = 0; k < cantidadCuotas; k++) {
    const venc = fechaConDia(base.getFullYear(), base.getMonth() + offset + k, diaPago);
    const numero = k + 1;
    cuotas.push({
      numero,
      vencimiento: venc.toISOString(),
      pagado: pagados.has(numero),
    });
  }
  return cuotas;
}

export function mapFinanciacion(f) {
  const c = f.clientes ?? {};
  const cuotas = f.cantidad_cuotas ?? 0;
  const precio = f.precio_cuota != null ? Number(f.precio_cuota) : 0;

  const pagados = new Set((f.pagos ?? []).map((p) => p.numero));
  const cronograma = calcularCronograma(f.created_at, cuotas, f.dia_pago, pagados);

  const cuotasPagadas = pagados.size;
  const cuotasRestantes = Math.max(0, cuotas - cuotasPagadas);
  const montoTotal = Number((cuotas * precio).toFixed(2));
  const fechaFin = cronograma.length ? cronograma[cronograma.length - 1].vencimiento : null;
  // Próxima cuota impaga (para "vence el…").
  const proxima = cronograma.find((q) => !q.pagado) ?? null;

  return {
    id: f.id,
    clienteId: f.cliente_id,
    // El trámite de parte de pago cuyo saldo se financia; null si es suelta.
    ingresoId: f.ingreso_id ?? null,
    nombre: c.nombre ?? "",
    telefono: c.telefono ?? "",
    telefonoAlt: f.telefono_alt ?? "",
    dni: c.dni ?? "",
    email: c.email ?? "",
    cantidadCuotas: cuotas,
    precioCuota: precio,
    diaPago: f.dia_pago,
    montoTotal,
    montoPagado: Number((cuotasPagadas * precio).toFixed(2)),
    saldo: Number((cuotasRestantes * precio).toFixed(2)),
    cuotasPagadas,
    cuotasRestantes,
    cronograma,
    fechaFin,
    proximaCuota: proxima ? { numero: proxima.numero, vencimiento: proxima.vencimiento } : null,
    completada: cuotas > 0 && cuotasRestantes === 0,
    activo: Boolean(f.activo),
    creado: f.created_at ? new Date(f.created_at).toISOString() : null,
    actualizado: f.updated_at ? new Date(f.updated_at).toISOString() : null,
  };
}
