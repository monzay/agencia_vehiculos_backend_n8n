import {
  listarDescuentos,
  obtenerDescuento,
  crearDescuento,
  actualizarDescuento,
  eliminarDescuento,
  aplicarDescuentoAVehiculos,
  quitarDescuentoDeVehiculos,
} from "../services/descuentos.service.js";

export async function getDescuentos(req, res, next) {
  try {
    const descuentos = await listarDescuentos();
    res.json({ ok: true, total: descuentos.length, data: descuentos });
  } catch (err) {
    next(err);
  }
}

export async function getDescuento(req, res, next) {
  try {
    const descuento = await obtenerDescuento(req.params.id);
    if (!descuento) {
      return res.status(404).json({ ok: false, error: "Descuento no encontrado" });
    }
    res.json({ ok: true, data: descuento });
  } catch (err) {
    next(err);
  }
}

export async function postDescuento(req, res, next) {
  try {
    const descuento = await crearDescuento(req.body);
    res.status(201).json({ ok: true, data: descuento });
  } catch (err) {
    next(err);
  }
}

export async function patchDescuento(req, res, next) {
  try {
    const descuento = await actualizarDescuento(req.params.id, req.body);
    if (!descuento) {
      return res.status(404).json({ ok: false, error: "Descuento no encontrado" });
    }
    res.json({ ok: true, data: descuento });
  } catch (err) {
    next(err);
  }
}

export async function deleteDescuento(req, res, next) {
  try {
    const ok = await eliminarDescuento(req.params.id);
    if (!ok) {
      return res.status(404).json({ ok: false, error: "Descuento no encontrado" });
    }
    res.json({ ok: true, data: { eliminado: true } });
  } catch (err) {
    next(err);
  }
}

// Aplica el descuento :id a los vehiculos indicados en body.refs (array o string).
export async function aplicarADescuento(req, res, next) {
  try {
    const refs = req.body?.refs ?? req.body?.ref;
    const afectados = await aplicarDescuentoAVehiculos(req.params.id, refs);
    res.json({ ok: true, data: { afectados } });
  } catch (err) {
    next(err);
  }
}

// Quita el descuento de los vehiculos indicados en body.refs (array o string).
export async function quitarDescuento(req, res, next) {
  try {
    const refs = req.body?.refs ?? req.body?.ref;
    const afectados = await quitarDescuentoDeVehiculos(refs);
    res.json({ ok: true, data: { afectados } });
  } catch (err) {
    next(err);
  }
}
