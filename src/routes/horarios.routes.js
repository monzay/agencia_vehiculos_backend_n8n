import { Router } from "express";
import { getHorarios, putHorarios } from "../controllers/horarios.controller.js";
import { requireAuth, requireRole } from "../middlewares/auth.js";

const router = Router();

// LECTURA pública: el home muestra los horarios de atención sin sesión. No
// expone datos personales, solo el horario comercial de cada día.
router.get("/", getHorarios);
// Escritura: SOLO admin.
router.put("/", requireAuth, requireRole("admin"), putHorarios);

export default router;
