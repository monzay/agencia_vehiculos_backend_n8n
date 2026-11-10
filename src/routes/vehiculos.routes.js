import { Router } from "express";
import {
  getVehiculos,
  getVehiculosAdmin,
  getVehiculo,
  getMarcas,
  postVehiculo,
  patchVehiculo,
  deleteVehiculo,
  postVistaVehiculo,
  postVentaVehiculo,
  deleteVentaVehiculo,
  postConsignacionVehiculo,
  postLeerListaVehiculos,
  postImportarVehiculos,
} from "../controllers/vehiculos.controller.js";
import { requireAuth, requireRole, usuarioOpcional } from "../middlewares/auth.js";
import { rateLimit } from "../middlewares/rateLimit.js";

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

// Importar la lista del catálogo. Leerla cuesta plata y tarda: se limita por
// usuario, igual que el escaneo de papeles en Documentos.
const porUsuario = (req) => String(req.usuario?.id ?? req.ip);
const limiteLecturaLista = rateLimit({
  ventanaMs: 60_000,
  max: 5,
  clave: porUsuario,
  mensaje: "Demasiadas lecturas seguidas. Esperá un minuto y probá de nuevo.",
});
const limiteImportacion = rateLimit({ ventanaMs: 60_000, max: 10, clave: porUsuario });
router.post("/importar/leer", ...soloAdmin, limiteLecturaLista, postLeerListaVehiculos);
router.post("/importar", ...soloAdmin, limiteImportacion, postImportarVehiculos);
router.patch("/:ref", ...soloAdmin, patchVehiculo);
router.delete("/:ref", ...soloAdmin, deleteVehiculo);

// Cierre comercial del vehículo: vender, deshacer la venta, o cerrar la
// consignación (vendido/retirado). Involucran precios y márgenes, así que van
// con el resto de lo que solo toca el admin.
router.post("/:ref/venta", ...soloAdmin, postVentaVehiculo);
router.delete("/:ref/venta", ...soloAdmin, deleteVentaVehiculo);
router.post("/:ref/consignacion", ...soloAdmin, postConsignacionVehiculo);

router.get("/:ref", getVehiculo);

// PÚBLICO: la ficha avisa que la miraron. Es la única escritura sin sesión de
// esta API, así que va con rate limit por IP — sin él, cualquiera podría inflar
// el ranking del panel a fuerza de pedidos.
//
// `usuarioOpcional` (no requireAuth): el visitante anónimo TIENE que pasar; el
// token solo sirve para reconocer al staff y no anotar su visita.
const limiteVistas = rateLimit({
  ventanaMs: 60 * 1000,
  max: 30,
  mensaje: "Demasiadas visitas seguidas.",
});
router.post("/:ref/vista", limiteVistas, usuarioOpcional, postVistaVehiculo);

export default router;
