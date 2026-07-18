import {
  listarPromociones,
  obtenerPromocion,
  crearPromocion,
  actualizarPromocion,
  eliminarPromocion,
  aplicarPromocionAVehiculos,
  quitarPromocionDeVehiculos,
} from "../services/promociones.service.js";

export async function getPromociones(req, res, next) {
  try {
    const promociones = await listarPromociones();
    res.json({ ok: true, total: promociones.length, data: promociones });
  } catch (err) {
    next(err);
  }
}

export async function getPromocion(req, res, next) {
  try {
    const promocion = await obtenerPromocion(req.params.id);
    if (!promocion) {
      return res.status(404).json({ ok: false, error: "Promoción no encontrada" });
    }
    res.json({ ok: true, data: promocion });
  } catch (err) {
    next(err);
  }
}

export async function postPromocion(req, res, next) {
  try {
    const promocion = await crearPromocion(req.body);
    res.status(201).json({ ok: true, data: promocion });
  } catch (err) {
    next(err);
  }
}

export async function patchPromocion(req, res, next) {
  try {
    const promocion = await actualizarPromocion(req.params.id, req.body);
    if (!promocion) {
      return res.status(404).json({ ok: false, error: "Promoción no encontrada" });
    }
    res.json({ ok: true, data: promocion });
  } catch (err) {
    next(err);
  }
}

export async function deletePromocion(req, res, next) {
  try {
    const ok = await eliminarPromocion(req.params.id);
    if (!ok) {
      return res.status(404).json({ ok: false, error: "Promoción no encontrada" });
    }
    res.json({ ok: true, data: { eliminado: true } });
  } catch (err) {
    next(err);
  }
}

export async function aplicarAPromocion(req, res, next) {
  try {
    const refs = req.body?.refs ?? req.body?.ref;
    const afectados = await aplicarPromocionAVehiculos(req.params.id, refs);
    res.json({ ok: true, data: { afectados } });
  } catch (err) {
    next(err);
  }
}

export async function quitarPromocion(req, res, next) {
  try {
    const refs = req.body?.refs ?? req.body?.ref;
    const afectados = await quitarPromocionDeVehiculos(req.params.id, refs);
    res.json({ ok: true, data: { afectados } });
  } catch (err) {
    next(err);
  }
}
