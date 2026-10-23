import { randomUUID } from "node:crypto";

// 404 para rutas no encontradas
export function notFound(req, res) {
  res.status(404).json({ ok: false, error: "Ruta no encontrada" });
}

// Manejador central de errores.
// - 4xx: son errores esperados que los servicios lanzan con su `status` y un
//   mensaje pensado para el usuario → se devuelve tal cual.
// - 5xx: fallos inesperados. Se registra el detalle completo con un id de
//   correlación y al cliente solo le vuelve un mensaje genérico + ese id, para
//   no filtrar internals (SQL/Prisma/stack) que ayudarían a un atacante.
// - 5xx con `publico: true`: fallos ESPERADOS de un servicio externo (no está
//   configurado, no respondió). El mensaje lo escribimos nosotros y le dice a
//   quien está cargando qué hacer, así que se muestra tal cual. No lleva stack
//   ni detalle del proveedor: eso queda en el log del servicio.
// Reglas de la base (CHECK y UNIQUE, migraciones 071, 073 y 074). Los servicios
// ya las cuidan; si igual se rompen, el usuario recibe un 409 claro y nunca el
// detalle de MySQL. Los mensajes no llevan datos de la persona.
const MENSAJES_DE_REGLA = {
  chk_auto_vendido_no_disponible: "Un vehículo vendido no puede quedar disponible.",
  chk_auto_precio_venta_vendido: "Solo un vehículo vendido puede tener precio de venta.",
  chk_sena_convertida_con_tramite: "Una seña que pasó a trámite tiene que figurar como convertida.",
  chk_entrega_vigente_con_cliente: "Cada entrega tiene que tener un cliente.",
  chk_cliente_fusionado_archivado: "Una ficha fusionada en otra tiene que estar archivada.",
};
const MENSAJES_DE_UNICO = {
  uq_usuarios_email_activo: "Ya existe un usuario con ese email.",
  uq_clientes_dni_vigente: "Ya hay otra ficha con ese DNI.",
  uq_canal_identificador: "Ese número ya está vinculado a otra ficha.",
};
// Prisma lo informa como "MysqlError { code: 3819 ... }" y las consultas SQL
// directas como "Code: `3819`".
const REGLA_ROTA = /code:\s*`?3819`?.*check constraint '(\w+)'/is;

function reglaRota(err) {
  if (err?.code === "P2002") {
    const indice = [err.meta?.target].flat().join(",");
    return { regla: indice, mensaje: MENSAJES_DE_UNICO[indice] ?? "Ya existe un registro con esos datos." };
  }
  const regla = String(err?.message ?? "").match(REGLA_ROTA)?.[1];
  if (!regla) return null;
  return { regla, mensaje: MENSAJES_DE_REGLA[regla] ?? "Los datos no cumplen una regla de la base." };
}

export function errorHandler(err, req, res, next) {
  const rota = reglaRota(err);
  if (rota) {
    // Una regla rota es un error del código que escribió el dato: queda registrado.
    console.error(`[API regla] ${req?.method ?? ""} ${String(req?.originalUrl ?? "").split("?")[0]} → ${rota.regla}`);
    return res.status(409).json({ ok: false, error: rota.mensaje });
  }

  const status = err.status || 500;

  if (status >= 500 && err.publico) {
    console.error(`[API aviso] ${status} ${err.message}`);
    return res.status(status).json({ ok: false, error: err.message });
  }

  if (status >= 500) {
    const correlationId = randomUUID();
    console.error(`[API error] cid=${correlationId}`, err);
    return res.status(status).json({
      ok: false,
      error: "Error interno del servidor. Si el problema persiste, reportá este código.",
      correlationId,
    });
  }

  return res.status(status).json({ ok: false, error: err.message || "Solicitud inválida" });
}
