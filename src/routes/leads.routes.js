import { Router } from "express";
import { getLeads, getLead, getResumen, getMetricas, getConversion } from "../controllers/leads.controller.js";
import { requireAuth, requireRole } from "../middlewares/auth.js";

const router = Router();

// Datos del panel: requieren sesion (admin o asesor).
router.get("/", requireAuth, getLeads);
router.get("/resumen", requireAuth, getResumen);
router.get("/metricas", requireAuth, getMetricas); // métricas del día + fluctuación + top autos
// Ventas por asesor: solo el admin.
router.get("/conversion", requireAuth, requireRole("admin"), getConversion);
router.get("/:id", requireAuth, getLead);

export default router;
