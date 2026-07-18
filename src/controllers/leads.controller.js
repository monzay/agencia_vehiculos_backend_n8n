import {
  listarLeads,
  listarLeadsPaginado,
  obtenerLead,
  resumenLeads,
} from "../services/leads.service.js";
import { metricasResumen } from "../services/metricas.service.js";

export async function getMetricas(req, res, next) {
  try {
    const metricas = await metricasResumen();
    res.json({ ok: true, data: metricas });
  } catch (err) {
    next(err);
  }
}

export async function getLeads(req, res, next) {
  try {
    const { tipo, clasif, q, offset, limite } = req.query;
    // Con `limite` → respuesta paginada { items, hayMas, total }.
    if (limite !== undefined) {
      const data = await listarLeadsPaginado({ tipo, clasif, q, offset, limite });
      return res.json({ ok: true, data });
    }
    // Sin params → lista completa (compatibilidad).
    const leads = await listarLeads();
    res.json({ ok: true, total: leads.length, data: leads });
  } catch (err) {
    next(err);
  }
}

export async function getResumen(req, res, next) {
  try {
    const resumen = await resumenLeads();
    res.json({ ok: true, data: resumen });
  } catch (err) {
    next(err);
  }
}

export async function getLead(req, res, next) {
  try {
    const lead = await obtenerLead(req.params.id);
    if (!lead) {
      return res.status(404).json({ ok: false, error: "Lead no encontrado" });
    }
    res.json({ ok: true, data: lead });
  } catch (err) {
    next(err);
  }
}
