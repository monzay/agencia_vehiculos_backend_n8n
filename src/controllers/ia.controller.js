import { resumenGastoIa } from "../services/ia-consumos.service.js";

// Gasto de IA del mes y estado del tope, para el contador de Resumen.
export async function getGastoIa(req, res, next) {
  try {
    res.json({ ok: true, data: await resumenGastoIa() });
  } catch (err) {
    next(err);
  }
}

