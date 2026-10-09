// El boleto de una compra o una permuta, en la forma que consume el panel y que
// se congela al firmar.

const iso = (d) => (d ? new Date(d).toISOString() : null);
const soloFecha = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);
const aNumero = (d) => (d != null ? Number(d) : null);
const DIA_MS = 86_400_000;

// Quién le paga a quién y cuánto. En una compra paga siempre la agencia. En una
// permuta se compensan los dos autos y se paga solo la diferencia: si el auto
// de la agencia vale más, paga el cliente; si vale menos, la agencia.
// La seña que el cliente ya pagó cuenta a su favor: se descuenta de lo que
// debe, o se suma a lo que la agencia le tiene que devolver.
// Lo usa también el servicio para validar el pago en el acto.
export function montoAPagar(precio, entregadoValor, sena = 0) {
  if (entregadoValor == null) return { pagador: "agencia", monto: precio };
  const diferencia = Math.round((precio - entregadoValor + sena) * 100) / 100;
  if (diferencia === 0) return { pagador: null, monto: 0 };
  return diferencia > 0 ? { pagador: "agencia", monto: diferencia } : { pagador: "cliente", monto: -diferencia };
}

// La seña del trámite, si la parte de pago nació de una. Se lee del ingreso con
// su relación `sena` incluida.
export const senaDelIngreso = (i) =>
  i?.sena && !i.sena.deleted_at ? { monto: Number(i.sena.monto), fecha: i.sena.senado_at } : null;

function autoEntregado(c) {
  if (c.entregado_valor == null) return null;
  const a = c.auto_entregado;
  return {
    ref: a?.ref ?? null,
    marca: a?.marca ?? null,
    modelo: a?.modelo ?? null,
    anio: a?.anio ?? null,
    kms: a?.kms ?? null,
    dominio: c.entregado_dominio ?? null,
    motor: c.entregado_motor ?? null,
    chasis: c.entregado_chasis ?? null,
    valor: aNumero(c.entregado_valor),
    // Ya se marcó vendido desde el legajo.
    vendido: a?.vendido_at != null,
  };
}

// `sena`: la de `senaDelIngreso`. Solo pesa en la parte de pago.
export function mapCompraventa(c, sena = null) {
  if (!c) return null;
  const precio = aNumero(c.precio);
  const permuta = autoEntregado(c);
  const senaMonto = permuta ? sena?.monto ?? 0 : 0;
  const { pagador, monto } = montoAPagar(precio, permuta?.valor ?? null, senaMonto);
  const pagoEnActo = aNumero(c.pago_en_acto);

  return {
    id: c.id,
    precio, // lo que la agencia reconoce por el auto del cliente
    permuta, // null en una compra
    pago: {
      pagador, // agencia | cliente | null (permuta sin diferencia)
      monto, // ya descontada la seña
      sena: senaMonto,
      senaFecha: senaMonto ? iso(sena.fecha) : null,
      forma: c.forma_pago,
      enActo: pagoEnActo,
      saldo: Math.max(0, Math.round((monto - pagoEnActo) * 100) / 100),
      saldoFecha: soloFecha(c.saldo_fecha),
    },
    entrega: iso(c.entrega_at),
    transferencia: {
      dias: c.transferencia_dias,
      // Hasta cuándo tiene la agencia para inscribirla. Pasado ese día, el
      // vendedor puede hacer la denuncia de venta.
      vence: c.entrega_at ? new Date(new Date(c.entrega_at).getTime() + c.transferencia_dias * DIA_MS).toISOString() : null,
      gastosACargo: c.gastos_transferencia,
    },
    estadoUnidad: c.estado_unidad ?? null,
    condiciones: c.condiciones ?? null,
    jurisdiccion: c.jurisdiccion ?? null,
    firmado: iso(c.firmado_at),
    snapshot: c.contrato_json ?? null,
  };
}
