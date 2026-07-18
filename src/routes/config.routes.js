import { Router } from "express";
import { getConfig, patchConfig } from "../controllers/config.controller.js";
import { requireAuth, requireRole } from "../middlewares/auth.js";

const router = Router();

// Lectura: cualquier usuario autenticado (el panel la usa para mostrar/ocultar).
router.get("/", requireAuth, getConfig);
// Escritura: SOLO admin (control total de la configuración global).
router.patch("/", requireAuth, requireRole("admin"), patchConfig);

export default router;
