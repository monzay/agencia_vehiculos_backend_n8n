// 404 para rutas no encontradas
export function notFound(req, res) {
  res.status(404).json({ ok: false, error: "Ruta no encontrada" });
}

// Manejador central de errores
export function errorHandler(err, req, res, next) {
  console.error("[API error]", err);
  res.status(err.status || 500).json({
    ok: false,
    error: err.message || "Error interno del servidor",
  });
}
