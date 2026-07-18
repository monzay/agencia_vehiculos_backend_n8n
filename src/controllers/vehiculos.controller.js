import {
  listarVehiculos,
  listarVehiculosAdmin,
  obtenerVehiculoPorRef,
  listarMarcas,
  crearVehiculo,
  actualizarVehiculo,
  eliminarVehiculo,
} from "../services/vehiculos.service.js";

export async function getVehiculos(req, res, next) {
  try {
    const vehiculos = await listarVehiculos();
    res.json({ ok: true, total: vehiculos.length, data: vehiculos });
  } catch (err) {
    next(err);
  }
}

// Listado para el panel admin (incluye no disponibles). Requiere sesion.
export async function getVehiculosAdmin(req, res, next) {
  try {
    const vehiculos = await listarVehiculosAdmin();
    res.json({ ok: true, total: vehiculos.length, data: vehiculos });
  } catch (err) {
    next(err);
  }
}

export async function getVehiculo(req, res, next) {
  try {
    const vehiculo = await obtenerVehiculoPorRef(req.params.ref);
    if (!vehiculo) {
      return res.status(404).json({ ok: false, error: "Vehiculo no encontrado" });
    }
    res.json({ ok: true, data: vehiculo });
  } catch (err) {
    next(err);
  }
}

export async function getMarcas(req, res, next) {
  try {
    const marcas = await listarMarcas();
    res.json({ ok: true, total: marcas.length, data: marcas });
  } catch (err) {
    next(err);
  }
}

export async function postVehiculo(req, res, next) {
  try {
    const vehiculo = await crearVehiculo(req.body);
    res.status(201).json({ ok: true, data: vehiculo });
  } catch (err) {
    next(err);
  }
}

export async function patchVehiculo(req, res, next) {
  try {
    const vehiculo = await actualizarVehiculo(req.params.ref, req.body);
    if (!vehiculo) {
      return res.status(404).json({ ok: false, error: "Vehiculo no encontrado" });
    }
    res.json({ ok: true, data: vehiculo });
  } catch (err) {
    next(err);
  }
}

export async function deleteVehiculo(req, res, next) {
  try {
    const ok = await eliminarVehiculo(req.params.ref);
    if (!ok) {
      return res.status(404).json({ ok: false, error: "Vehiculo no encontrado" });
    }
    res.json({ ok: true, data: { eliminado: true } });
  } catch (err) {
    next(err);
  }
}
