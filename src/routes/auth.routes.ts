import { Router } from "express";
import { AuthController } from "../controllers/auth.controller";
import { authMiddleware } from "../middlewares/auth.middleware";
import { limitarIntentos } from "../middlewares/rateLimit.middleware";

const QUINCE_MIN = 15 * 60 * 1000;

/** 5 pedidos de enlace por IP + correo cada 15 min. */
const limiteOlvide = limitarIntentos({
  nombre: "olvide",
  max: 5,
  ventanaMs: QUINCE_MIN,
  clave: (req, ip) => `${ip}|${String(req.body?.email || "").trim().toLowerCase()}`,
});

/** 5 intentos de restablecer por IP cada 15 min. */
const limiteRestablecer = limitarIntentos({ nombre: "restablecer", max: 5, ventanaMs: QUINCE_MIN });

const authRouter = Router();

authRouter.post("/login", AuthController.login);
authRouter.post("/olvide-contrasena", limiteOlvide, AuthController.olvideContrasena);
authRouter.post("/restablecer-contrasena", limiteRestablecer, AuthController.restablecerContrasena);
authRouter.get("/me", authMiddleware, AuthController.me);

export default authRouter;
