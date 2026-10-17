import { Router } from "express";
import { getSenas, getSena, postSena, patchSena, postCancelacion, postTramite, deleteSena } from "../controllers/senas.controller.js";
import { requireAuth, requireRole } from "../middlewares/auth.js";

const router = Router();

// Hay plata y datos de clientes: todo el módulo es solo del admin, también
// para leer (decisión del 16/10/2026). En Vehículos el asesor igual ve que un
// auto está señado (a nombre de quién y hasta cuándo), sin el monto ni el resto.
router.use(requireAuth, requireRole("admin"));

router.get("/", getSenas);
router.post("/", postSena);
router.get("/:id", getSena);
router.patch("/:id", patchSena);
router.delete("/:id", deleteSena);
router.post("/:id/cancelacion", postCancelacion);
router.post("/:id/tramite", postTramite);

export default router;
