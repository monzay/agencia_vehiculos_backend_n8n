import { Router } from "express";
import { getNuevas, postVisto } from "../controllers/novedades.controller.js";
import { requireAuth } from "../middlewares/auth.js";

const router = Router();

// Novedades por sección del panel: "consultas" | "ventas" | "financiacion" | "descuentos".
router.get("/:seccion", requireAuth, getNuevas);
router.post("/:seccion/visto", requireAuth, postVisto);

export default router;
