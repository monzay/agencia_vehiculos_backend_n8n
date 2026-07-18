import { contarNuevos, marcarVisto, esSeccionValida } from "../services/novedades.service.js";

// La sección viene de la URL: se valida contra la lista blanca del servicio
// antes de tocar la base (el nombre de la columna se deriva de ella).
function seccionDe(req, res) {
  const { seccion } = req.params;
  if (!esSeccionValida(seccion)) {
    res.status(404).json({ ok: false, error: "Sección desconocida" });
    return null;
  }
  return seccion;
}

// Cuántas novedades hay en la sección desde la última revisión de este usuario.
export async function getNuevas(req, res, next) {
  try {
    const seccion = seccionDe(req, res);
    if (!seccion) return;
    res.json({ ok: true, data: await contarNuevos(seccion, req.usuario.id) });
  } catch (err) {
    next(err);
  }
}

// Marca la sección como revisada AHORA por este usuario (resetea el contador).
export async function postVisto(req, res, next) {
  try {
    const seccion = seccionDe(req, res);
    if (!seccion) return;
    res.json({ ok: true, data: await marcarVisto(seccion, req.usuario.id) });
  } catch (err) {
    next(err);
  }
}
