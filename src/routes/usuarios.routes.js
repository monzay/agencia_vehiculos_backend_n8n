import { Router } from "express";
import {
  getUsuarios,
  getUsuario,
  postUsuario,
  patchUsuario,
  deleteUsuario,
} from "../controllers/usuarios.controller.js";
import { requireAuth, requireRole } from "../middlewares/auth.js";

const router = Router();

// Todas requieren sesion. Las mutaciones (crear/editar/eliminar) son SOLO admin.
router.get("/", requireAuth, getUsuarios);
router.get("/:id", requireAuth, getUsuario);
router.post("/", requireAuth, requireRole("admin"), postUsuario);
router.patch("/:id", requireAuth, requireRole("admin"), patchUsuario);
router.delete("/:id", requireAuth, requireRole("admin"), deleteUsuario);

export default router;
