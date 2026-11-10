import {
  listarVehiculos,
  listarVehiculosAdmin,
  obtenerVehiculoPorRef,
  listarMarcas,
  crearVehiculo,
  actualizarVehiculo,
  eliminarVehiculo,
  marcarVendido,
  deshacerVenta,
  cerrarConsignacion,
} from "../services/vehiculos.service.js";
import { registrarVista } from "../services/vistas.service.js";
import { leerListaVehiculos, importarVehiculos } from "../services/importacion-vehiculos.service.js";

// Lee la lista del catálogo (PDF/imagen) y devuelve la propuesta. No guarda nada.
// Body: { archivos: ["listas/<huella>.jpg" | ".pdf", ...] }.
export async function postLeerListaVehiculos(req, res, next) {
  try {
    const data = await leerListaVehiculos(req.body ?? {});
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
}

// Crea los vehículos confirmados, sin publicar. Body: { archivos, vehiculos }.
export async function postImportarVehiculos(req, res, next) {
  try {
    const data = await importarVehiculos(req.body ?? {}, req.usuario?.id ?? null);
    res.status(201).json({ ok: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getVehiculos(req, res, next) {
  try {
    const vehiculos = await listarVehiculos();
    res.json({ ok: true, total: vehiculos.length, data: vehiculos });
  } catch (err) {
    next(err);
  }
}

// Registra una visita a la ficha pública del vehículo (interés por vehículo).
//
// Responde 204 SIEMPRE, pase lo que pase: es telemetría, el visitante no tiene
// nada que hacer con el resultado. Devolver si la ref existía convertiría este
// endpoint público en una forma de enumerar el catálogo.
export async function postVistaVehiculo(req, res, next) {
  try {
    // Asesores y admin no cuentan: sería medir el trabajo del equipo como si
    // fuera interés de clientes. `usuarioOpcional` ya resolvió el token.
    if (!req.usuario) await registrarVista(req.params.ref);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

// Marca el vehículo como vendido. Body: { precio_venta?, vendido_at? }.
export async function postVentaVehiculo(req, res, next) {
  try {
    const ok = await marcarVendido(req.params.ref, req.body ?? {});
    if (!ok) return res.status(404).json({ ok: false, error: "Vehiculo no encontrado" });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

// Deshace la venta (se marcó por error).
export async function deleteVentaVehiculo(req, res, next) {
  try {
    const ok = await deshacerVenta(req.params.ref);
    if (!ok) return res.status(404).json({ ok: false, error: "Ese vehiculo no figura como vendido" });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

// Cierra la consignación desde la ficha del auto. Body: { estado: vendido|retirado }.
export async function postConsignacionVehiculo(req, res, next) {
  try {
    const ok = await cerrarConsignacion(req.params.ref, req.body?.estado);
    if (!ok) return res.status(404).json({ ok: false, error: "Vehiculo no encontrado" });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

// Listado para el panel admin (incluye no disponibles). Requiere sesion.
export async function getVehiculosAdmin(req, res, next) {
  try {
    const vehiculos = await listarVehiculosAdmin({ vendidos: req.query.vendidos });
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
