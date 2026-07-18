import {
  listarFinanciaciones,
  listarFinanciacionesPaginado,
  obtenerFinanciacion,
  crearFinanciacion,
  actualizarFinanciacion,
  eliminarFinanciacion,
  marcarCuota,
  consultarPorDni,
} from "../services/financiaciones.service.js";

// Consulta pública por DNI (sin auth). Devuelve las financiaciones del cliente.
export async function getConsultaPorDni(req, res, next) {
  try {
    const financiaciones = await consultarPorDni(req.query.dni);
    res.json({ ok: true, total: financiaciones.length, data: financiaciones });
  } catch (err) {
    next(err);
  }
}

export async function getFinanciaciones(req, res, next) {
  try {
    const { q, offset, limite } = req.query;
    if (limite !== undefined) {
      const data = await listarFinanciacionesPaginado({ q, offset, limite });
      return res.json({ ok: true, data });
    }
    const financiaciones = await listarFinanciaciones();
    res.json({ ok: true, total: financiaciones.length, data: financiaciones });
  } catch (err) {
    next(err);
  }
}

export async function getFinanciacion(req, res, next) {
  try {
    const financiacion = await obtenerFinanciacion(req.params.id);
    if (!financiacion) {
      return res.status(404).json({ ok: false, error: "Financiación no encontrada" });
    }
    res.json({ ok: true, data: financiacion });
  } catch (err) {
    next(err);
  }
}

export async function postFinanciacion(req, res, next) {
  try {
    const financiacion = await crearFinanciacion(req.body);
    res.status(201).json({ ok: true, data: financiacion });
  } catch (err) {
    next(err);
  }
}

export async function patchFinanciacion(req, res, next) {
  try {
    const financiacion = await actualizarFinanciacion(req.params.id, req.body);
    if (!financiacion) {
      return res.status(404).json({ ok: false, error: "Financiación no encontrada" });
    }
    res.json({ ok: true, data: financiacion });
  } catch (err) {
    next(err);
  }
}

export async function putCuota(req, res, next) {
  try {
    const financiacion = await marcarCuota(req.params.id, req.params.numero, req.body?.pagado === true);
    if (!financiacion) {
      return res.status(404).json({ ok: false, error: "Financiación no encontrada" });
    }
    res.json({ ok: true, data: financiacion });
  } catch (err) {
    next(err);
  }
}

export async function deleteFinanciacion(req, res, next) {
  try {
    const ok = await eliminarFinanciacion(req.params.id);
    if (!ok) {
      return res.status(404).json({ ok: false, error: "Financiación no encontrada" });
    }
    res.json({ ok: true, data: { eliminado: true } });
  } catch (err) {
    next(err);
  }
}
