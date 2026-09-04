import { Router } from "express";
import { getContabilidad } from "../controllers/contabilidad.controller.js";
import { requireAuth, requireRole } from "../middlewares/auth.js";

const router = Router();

// Costos, facturación y márgenes: SOLO admin. Un asesor no tiene por qué ver
// cuánto gana la agencia por auto.
router.get("/", requireAuth, requireRole("admin"), getContabilidad);

export default router;
