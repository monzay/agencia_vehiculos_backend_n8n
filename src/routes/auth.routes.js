import { Router } from "express";
import { postLogin, getMe, patchMe } from "../controllers/auth.controller.js";
import { requireAuth } from "../middlewares/auth.js";

const router = Router();

router.post("/login", postLogin);
router.get("/me", requireAuth, getMe);
router.patch("/me", requireAuth, patchMe);


export default router;
