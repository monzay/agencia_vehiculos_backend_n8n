import { Router } from "express";
import { postLogin, getMe, patchMe } from "../controllers/auth.controller.js";
import { requireAuth } from "../middlewares/auth.js";
import { rateLimit } from "../middlewares/rateLimit.js";

const router = Router();

// Anti fuerza-bruta / credential stuffing: máximo 10 intentos por IP+email cada
// 15 minutos. Se combina la IP con el email para no bloquear a toda una red por
// culpa de un atacante que rota emails, y para limitar los intentos por cuenta.
const limiteLogin = rateLimit({
  ventanaMs: 15 * 60 * 1000,
  max: 10,
  clave: (req) => `${req.ip}|${String(req.body?.email || "").trim().toLowerCase()}`,
  mensaje: "Demasiados intentos de inicio de sesión. Esperá unos minutos y probá de nuevo.",
});

router.post("/login", limiteLogin, postLogin);
router.get("/me", requireAuth, getMe);
router.patch("/me", requireAuth, patchMe);


export default router;
