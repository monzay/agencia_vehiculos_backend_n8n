import { Router } from "express";
import { getGastoIa } from "../controllers/ia.controller.js";
import { requireAuth, requireRole } from "../middlewares/auth.js";

const router = Router();

// Solo lectura y solo admin: el tope lo fija el proveedor en el servidor
// (IA_TOPE_USD_MES), así que no hay ruta para cambiarlo.
router.get("/gasto", requireAuth, requireRole("admin"), getGastoIa);

export default router;
