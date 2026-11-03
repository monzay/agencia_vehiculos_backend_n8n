import {
  listarConsultas,
  listarConsultasVenta,
  obtenerConsulta,
  marcarConsultaAtendida,
  responderComoHumano,
  reanudarBot,
} from "../services/consultas.service.js";

// Por qué no se pudo responder desde el panel → estado HTTP y mensaje para el asesor.
const ERROR_INTERVENCION = {
  no_encontrada: { estado: 404, error: "Consulta no encontrada" },
  texto_invalido: { estado: 400, error: "El mensaje está vacío o es demasiado largo" },
  sin_telefono: { estado: 409, error: "La consulta no tiene un teléfono para responder" },
  ventana_cerrada: { estado: 409, error: "La ventana de 24 h de WhatsApp está cerrada: el cliente tiene que volver a escribir" },
  envio_fallido: { estado: 502, error: "No se pudo enviar el mensaje por WhatsApp" },
};

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

// Detalle de una consulta: el chat completo (cliente/bot/humano) de esa sesión.
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

// Responder al cliente desde el panel (intervención humana). body { texto }.
// Toma la conversación: pausa el bot y marca la consulta como atendida.
export async function postMensajeConsulta(req, res, next) {
  try {
    const r = await responderComoHumano(req.params.id, req.body?.texto, req.usuario);
    if (r.ok) return res.json({ ok: true, data: r });
    const { estado, error } = ERROR_INTERVENCION[r.codigo] ?? { estado: 400, error: "No se pudo responder" };
    res.status(estado).json({ ok: false, error, codigo: r.codigo });
  } catch (err) {
    next(err);
  }
}

// Devolver la conversación al bot: vuelve a responder solo.
export async function postDevolverBot(req, res, next) {
  try {
    const r = await reanudarBot(req.params.id);
    if (!r) return res.status(404).json({ ok: false, error: "Consulta no encontrada" });
    res.json({ ok: true, data: r });
  } catch (err) {
    next(err);
  }
}
