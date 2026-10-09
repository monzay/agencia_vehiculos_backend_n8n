import {
  listarConsultas,
  listarConsultasVenta,
  obtenerConsulta,
  marcarConsultaAtendida,
} from "../services/consultas.service.js";

export async function getConsultas(req, res, next) {
  try {
    const { items, hayMas, total } = await listarConsultas({
      limite: req.query.limite,
      offset: req.query.offset,
      q: req.query.q,
      clasif: req.query.clasif,
    });
    res.json({ ok: true, total, data: { items, hayMas, total } });
  } catch (err) {
    next(err);
  }
}

// Consultas de venta/consignación (una por sesión), filtrables por modalidad.
export async function getConsultasVenta(req, res, next) {
  try {
    const { items, hayMas, total } = await listarConsultasVenta({
      limite: req.query.limite,
      offset: req.query.offset,
      q: req.query.q,
      modalidad: req.query.modalidad,
    });
    res.json({ ok: true, total, data: { items, hayMas, total } });
  } catch (err) {
    next(err);
  }
}

// Marca/desmarca una consulta como atendida. body { atendido: boolean } (default true).
export async function patchAtendido(req, res, next) {
  try {
    const atendido = req.body?.atendido !== false;
    const r = await marcarConsultaAtendida(req.params.id, atendido, req.usuario);
    if (!r) return res.status(404).json({ ok: false, error: "Consulta no encontrada" });
    res.json({ ok: true, data: r });
  } catch (err) {
    next(err);
  }
}

// Detalle de una consulta: mensajes (respuestas del cliente) de esa sesión.
export async function getConsulta(req, res, next) {
  try {
    const consulta = await obtenerConsulta(req.params.id);
    if (!consulta) {
      return res.status(404).json({ ok: false, error: "Consulta no encontrada" });
    }
    res.json({ ok: true, data: consulta });
  } catch (err) {
    next(err);
  }
}
