import { Router } from "express";
import { getEntregas, getEntregasGestion, getClientesParaEntrega, postEntrega, deleteEntrega } from "../controllers/entregas.controller.js";
import { requireAuth, requireRole } from "../middlewares/auth.js";

const router = Router();

// LECTURA pública: el home muestra la galería sin sesión.
router.get("/", getEntregas);

// Panel: con el cliente de cada entrega (datos personales), solo admin.
router.get("/gestion", requireAuth, requireRole("admin"), getEntregasGestion);
router.get("/clientes", requireAuth, requireRole("admin"), getClientesParaEntrega);

// ESCRITURA solo admin.
router.post("/", requireAuth, requireRole("admin"), postEntrega);
router.delete("/:id", requireAuth, requireRole("admin"), deleteEntrega);

export default router;
