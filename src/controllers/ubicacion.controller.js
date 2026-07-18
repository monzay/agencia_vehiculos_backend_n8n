import { obtenerUbicacion, guardarUbicacion } from "../services/ubicacion.service.js";

export async function getUbicacion(req, res, next) {
  try {
    res.json({ ok: true, data: await obtenerUbicacion() });
  } catch (err) {
    next(err);
  }
}

// Reemplaza la ubicación. El service valida y lanza 400 si los datos no sirven.
export async function putUbicacion(req, res, next) {
  try {
    const { nombre, direccion, mapsUrl, latitud, longitud } = req.body ?? {};
    res.json({ ok: true, data: await guardarUbicacion({ nombre, direccion, mapsUrl, latitud, longitud }) });
  } catch (err) {
    next(err);
  }
}
