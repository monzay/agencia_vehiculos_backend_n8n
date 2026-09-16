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
export function errorHandler(err, req, res, next) {
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
