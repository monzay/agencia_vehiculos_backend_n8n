import { Router } from "express";
import { getUbicacion, putUbicacion } from "../controllers/ubicacion.controller.js";
import { requireAuth, requireRole } from "../middlewares/auth.js";

const router = Router();

// Lectura: cualquier usuario autenticado.
router.get("/", requireAuth, getUbicacion);
// Escritura: SOLO admin.
router.put("/", requireAuth, requireRole("admin"), putUbicacion);

export default router;
