import { Router } from "express";
import { getTerminos, postTerminos } from "../controllers/terminos.controller.js";
import { requireAuth, requireRole } from "../middlewares/auth.js";

const router = Router();

// Lectura PÚBLICA: la página /privacidad que el bot le pasa al cliente.
router.get("/", getTerminos);
// Publicar una versión nueva: SOLO admin.
router.post("/", requireAuth, requireRole("admin"), postTerminos);

export default router;
