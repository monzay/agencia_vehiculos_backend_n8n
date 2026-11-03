// Traduce un `cliente` (con sus `chat_estado` y, opcionalmente, su historial)
// al shape de "lead" que consume el dashboard de administracion del front.
//
// Un cliente puede tener varias filas en `chat_estado` (varias sesiones de
// chat). De todas ellas derivamos:
//   - clasificacion: CALIENTE | TIBIO | FRIO (la guardada) o null (ver clasificacionDeSesion)
//   - score: el maximo entre las sesiones
//   - autos consultados: los `auto_ref` distintos referenciados en sus sesiones
//   - ultima actividad, paso actual y datos de la sesion "principal"

import { mapAutoToVehiculo } from "./vehiculo.mapper.js";


// Clasificacion que se muestra de una sesion: la guardada, porque la consulta
// nace fría y se recalcula con cada respuesta (decisión del 31/10/2026).
// Venta/consignacion no pasan por la calificacion del bot: quedan sin clasificar.
export function clasificacionDeSesion(sesion) {
  if (sesion?.tipo_lead === "venta") return null;
  return sesion?.clasificacion ?? null;
}

function fechaMax(fechas) {
  const validas = fechas.filter(Boolean).map((f) => new Date(f).getTime());
  if (validas.length === 0) return null;
  return new Date(Math.max(...validas)).toISOString();
}

// `autosMap`: { [ref]: fila autos } para resolver los autos consultados.
// Vehículo que describió el cliente (usado a entregar / auto a vender) para una
// sesión, según su `contexto`. Vive en la tabla normalizada `vehiculo_cliente`.
function vehiculoDeSesion(sesion, contexto) {
  return (sesion.vehiculo_cliente ?? []).find(
    (v) => v.contexto === contexto && !v.deleted_at
  ) ?? null;
}

// El último resultado del BCRA, para el asesor. SOLO INFORMATIVO: no entra en la
// clasificación. `consultas_crediticias` llega con la más reciente primero (leads.service).
// estado "error" = no se pudo consultar (sin verificar).
export function creditoDelCliente(cliente) {
  const ultima = cliente.consultas_crediticias?.[0];
  if (!ultima) return null;
  return {
    estado: ultima.estado,
    semaforo: ultima.semaforo ?? null,
    periodo: ultima.periodo ?? null,
    // Con qué nombre tiene el BCRA ese CUIL: el asesor verifica en persona que es quien escribió.
    nombre: ultima.nombre_bcra ?? null,
    fecha: new Date(ultima.consultado_at).toISOString(),
  };
}

export function mapClienteToLead(cliente, autosMap = {}) {
  const sesiones = cliente.chat_estado ?? [];

  // Sesion "principal": la de mayor score (desempate por actualizacion mas reciente).
  const principal = [...sesiones].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return new Date(b.updated_at ?? 0) - new Date(a.updated_at ?? 0);
  })[0];

  const scoreMax = sesiones.reduce((m, s) => Math.max(m, s.score ?? 0), 0);
  const clasificacion = clasificacionDeSesion(principal);

  // Autos consultados: agrupados por ref. Como cada consulta es una sesion
  // independiente con su propio score/clasificacion (asi lo arma el workflow),
  // cada auto lleva SU PROPIA clasificacion (la de la sesion de mayor score
  // que consulto ese auto). Un cliente puede estar CALIENTE por un auto y
  // FRIO por otro.
  const porAuto = new Map();
  for (const s of sesiones) {
    if (s.auto_id == null || !autosMap[s.auto_id]) continue;
    const prev = porAuto.get(s.auto_id);
    if (!prev || (s.score ?? 0) > (prev.score ?? 0)) porAuto.set(s.auto_id, s);
  }
  const autosConsultados = [...porAuto.entries()]
    .map(([autoId, s]) => ({
      ...mapAutoToVehiculo(autosMap[autoId]),
      clasificacion: clasificacionDeSesion(s),
      scoreConsulta: s.score ?? 0,
      consultadoEl: s.updated_at ? new Date(s.updated_at).toISOString() : null,
    }))
    .sort((a, b) => b.scoreConsulta - a.scoreConsulta);

  const ultimaActividad = fechaMax([
    ...sesiones.map((s) => s.updated_at),
    ...sesiones.map((s) => s.ultimo_mensaje),
    cliente.created_at,
  ]);

  // Venta: cliente que quiere VENDER su vehiculo (rama WhatsApp Business).
  // Solo cuentan las COMPLETAS (paso 'handoff' = respondio todo el flujo);
  // las abandonadas a mitad de preguntas no son una consulta de venta real.
  const sesionesVenta = sesiones.filter(
    (s) => s.tipo_lead === "venta" && s.paso_actual === "handoff"
  );
  // Compra: cualquier consulta que NO sea de venta. Un cliente puede ser ambas
  // cosas (consultó autos y además ofreció vender el suyo) → aparece en Clientes
  // Y en "Quieren vender".
  const sesionesCompra = sesiones.filter((s) => s.tipo_lead !== "venta");

  // Última consulta: la sesión MÁS RECIENTE (no la de mayor score). Con ella el
  // panel de Clientes muestra en la fila cómo quedó el último contacto (p. ej.
  // "FRÍO") y cuándo fue. Se prioriza la última consulta de compra; si el cliente
  // sólo tuvo sesiones de venta, se usa la más reciente de todas.
  const ultimaSesion = [...(sesionesCompra.length ? sesionesCompra : sesiones)].sort(
    (a, b) =>
      new Date(b.updated_at ?? b.ultimo_mensaje ?? 0) -
      new Date(a.updated_at ?? a.ultimo_mensaje ?? 0)
  )[0];
  const ultimaConsulta = ultimaSesion
    ? {
        clasificacion: clasificacionDeSesion(ultimaSesion),
        // 'venta' si el último contacto fue querer vender/consignar: la fila de
        // Clientes lo etiqueta como tal en vez de mostrar una clasificación.
        tipoLead: ultimaSesion.tipo_lead ?? null,
        fecha:
          fechaMax([ultimaSesion.updated_at, ultimaSesion.ultimo_mensaje]) ??
          (ultimaSesion.sesion_inicio
            ? new Date(ultimaSesion.sesion_inicio).toISOString()
            : null),
      }
    : null;
  const ventaPrincipal = [...sesionesVenta].sort(
    (a, b) => new Date(b.updated_at ?? 0) - new Date(a.updated_at ?? 0)
  )[0];
  const ventaVC = ventaPrincipal ? vehiculoDeSesion(ventaPrincipal, "venta") : null;

  return {
    id: cliente.id,
    nombre: cliente.nombre || "Sin nombre",
    telefono: cliente.telefono || "",
    email: cliente.email || "",
    canal: cliente.canal,
    creado: cliente.created_at ? new Date(cliente.created_at).toISOString() : null,

    credito: creditoDelCliente(cliente),
    clasificacion,           // la de la sesión de mayor score (ver clasificacionDeSesion)
    ultimaConsulta,          // { clasificacion, fecha } de la sesión más reciente
    score: scoreMax,
    pasoActual: principal?.paso_actual ?? null,
    ultimaActividad,

    totalSesiones: sesiones.length,
    totalAutosConsultados: autosConsultados.length,
    autosConsultados,        // [{ id, ref, brand, model, year, precio, image, ... }]

    // Venta (rama WhatsApp Business "quiero vender mi vehiculo").
    esVenta: sesionesVenta.length > 0,
    // Comprador: tiene al menos una consulta que no es de venta.
    esCompra: sesionesCompra.length > 0,
    venta: ventaPrincipal
      ? {
          marca: ventaVC?.marca ?? null,
          modelo: ventaVC?.modelo ?? null,
          anio: ventaVC?.anio ?? null,
          kms: ventaVC?.kms ?? null,
          precio: ventaVC?.precio_pedido ?? null,
          // 'venta' (se lo compramos) | 'consignacion' (lo vendemos por él).
          // null en sesiones anteriores a que el bot preguntara la modalidad.
          modalidad: ventaPrincipal.modalidad_venta ?? null,
          completa: ventaPrincipal.paso_actual === "handoff",
          fecha: ventaPrincipal.updated_at
            ? new Date(ventaPrincipal.updated_at).toISOString()
            : null,
          // Inicio de la sesión: con esto el panel decide si la venta es "nueva"
          // (mismo campo que cuenta `novedades.service`).
          inicio: ventaPrincipal.sesion_inicio
            ? new Date(ventaPrincipal.sesion_inicio).toISOString()
            : null,
        }
      : null,

    // Datos comerciales de la sesion principal (utiles para el vendedor).
    pagoTipo: principal?.pago_tipo ?? null,
    entregaUsado: Boolean(principal?.entrega_usado),
    disponibilidad: principal?.disponibilidad ?? null,
    decisor: principal?.decisor ?? null,
    decisorCon: principal?.decisor_con ?? null,
    // Financiacion: credito_ok (recibo de sueldo / garante), anticipo y cuotas.
    creditoOk:
      principal?.credito_ok === 1
        ? true
        : principal?.credito_ok === 0
        ? false
        : null,
    anticipo: principal?.anticipo != null ? String(principal.anticipo) : null,
    cuotas: principal?.cuotas ?? null,
  };
}

// Detalle: lead completo + sesiones crudas + historial de mensajes.
export function mapClienteToLeadDetalle(cliente, autosMap = {}) {
  const base = mapClienteToLead(cliente, autosMap);

  const sesiones = (cliente.chat_estado ?? [])
    // Ventas incompletas (abandonadas a mitad del flujo) no aparecen en el historial.
    .filter((s) => s.tipo_lead !== "venta" || s.paso_actual === "handoff")
    .map((s) => ({
      id: s.id,
      pasoActual: s.paso_actual,
      score: s.score ?? 0,
      // Clasificacion de la sesion (ver clasificacionDeSesion).
      clasificacion: clasificacionDeSesion(s),
      autoRef: autosMap[s.auto_id]?.ref ?? null, // ref derivada de auto_id (join)
      origen: s.origen ?? null, // 'web' si vino del boton Consultar
      // Tipo de consulta: 'venta' = quiere vender/consignar su vehiculo.
      tipoLead: s.tipo_lead ?? null,
      modalidadVenta: s.modalidad_venta ?? null, // 'venta' | 'consignacion' | null
      auto: s.auto_id != null && autosMap[s.auto_id]
        ? mapAutoToVehiculo(autosMap[s.auto_id])
        : null,
      // Vehiculo que OFRECE el cliente (venta/consignacion), para titular la consulta.
      venta: (() => {
        const vc = vehiculoDeSesion(s, "venta");
        return vc
          ? { marca: vc.marca, modelo: vc.modelo, anio: vc.anio, kms: vc.kms, precio: vc.precio_pedido }
          : null;
      })(),
      pagoTipo: s.pago_tipo,
      // Financiacion: recibo/garante (credito_ok) y anticipo.
      creditoOk:
        s.credito_ok === 1 ? true : s.credito_ok === 0 ? false : null,
      anticipo: s.anticipo != null ? String(s.anticipo) : null,
      entregaUsado: Boolean(s.entrega_usado),
      usado: (() => {
        const vc = vehiculoDeSesion(s, "trade_in");
        return vc ? { marca: vc.marca, modelo: vc.modelo, anio: vc.anio, kms: vc.kms } : null;
      })(),
      disponibilidad: s.disponibilidad,
      decisor: s.decisor,
      decisorCon: s.decisor_con ?? null,
      inicio: s.sesion_inicio ? new Date(s.sesion_inicio).toISOString() : null,
      actualizado: s.updated_at ? new Date(s.updated_at).toISOString() : null,
    }))
    // Mas reciente primero (cada consulta es una sesion propia).
    .sort((a, b) => new Date(b.actualizado ?? 0) - new Date(a.actualizado ?? 0));

  const mensajes = (cliente.historial_mensajes ?? []).map((m) => ({
    id: Number(m.id),
    direccion: m.direccion,            // entrante | saliente
    mensaje: m.mensaje,
    paso: m.paso_nodo,
    fecha: m.created_at ? new Date(m.created_at).toISOString() : null,
  }));

  return { ...base, sesiones, mensajes };
}
