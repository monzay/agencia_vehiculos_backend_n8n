import { Router } from "express";
import { getLeads, getLead, getResumen, getMetricas } from "../controllers/leads.controller.js";
import { requireAuth } from "../middlewares/auth.js";

const router = Router();

// Datos del panel: requieren sesion (admin o asesor).
router.get("/", requireAuth, getLeads);
router.get("/resumen", requireAuth, getResumen);
router.get("/metricas", requireAuth, getMetricas); // métricas del día + fluctuación + top autos
router.get("/:id", requireAuth, getLead);

export default router;
