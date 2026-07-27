import { Router } from "express";
import { getUbicacion, putUbicacion } from "../controllers/ubicacion.controller.js";
import { requireAuth, requireRole } from "../middlewares/auth.js";

const router = Router();

// Lectura PUBLICA (la web usa el nombre/dirección de la agencia sin login).
router.get("/", getUbicacion);
// Escritura: SOLO admin.
router.put("/", requireAuth, requireRole("admin"), putUbicacion);

export default router;
