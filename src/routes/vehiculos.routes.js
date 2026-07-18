import { Router } from "express";
import {
  getVehiculos,
  getVehiculosAdmin,
  getVehiculo,
  getMarcas,
  postVehiculo,
  patchVehiculo,
  deleteVehiculo,
} from "../controllers/vehiculos.controller.js";
import { requireAuth, requireRole } from "../middlewares/auth.js";

const router = Router();

// Lectura PUBLICA (catalogo de la web).
router.get("/", getVehiculos);
router.get("/marcas", getMarcas);

// Ver el stock completo: cualquier sesión (admin o asesor).
// /admin va ANTES de /:ref para que no lo capture el parametro.
router.get("/admin/todos", requireAuth, getVehiculosAdmin);

// Crear / editar / eliminar: SOLO admin.
const soloAdmin = [requireAuth, requireRole("admin")];
router.post("/", ...soloAdmin, postVehiculo);
router.patch("/:ref", ...soloAdmin, patchVehiculo);
router.delete("/:ref", ...soloAdmin, deleteVehiculo);

router.get("/:ref", getVehiculo);

export default router;
