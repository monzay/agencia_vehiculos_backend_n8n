import { Router } from "express";
import { getHorarios, putHorarios } from "../controllers/horarios.controller.js";
import { requireAuth, requireRole } from "../middlewares/auth.js";

const router = Router();

// Lectura: cualquier usuario autenticado.
router.get("/", requireAuth, getHorarios);
// Escritura: SOLO admin.
router.put("/", requireAuth, requireRole("admin"), putHorarios);

export default router;
