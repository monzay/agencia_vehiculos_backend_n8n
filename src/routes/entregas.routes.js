import { Router } from "express";
import { getEntregas, postEntrega, deleteEntrega } from "../controllers/entregas.controller.js";
import { requireAuth, requireRole } from "../middlewares/auth.js";

const router = Router();

// LECTURA pública: el home muestra la galería sin sesión.
router.get("/", getEntregas);

// ESCRITURA solo admin.
router.post("/", requireAuth, requireRole("admin"), postEntrega);
router.delete("/:id", requireAuth, requireRole("admin"), deleteEntrega);

export default router;
