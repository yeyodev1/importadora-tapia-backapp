import { Router } from "express";
import { AuthController } from "../controllers/auth.controller";
import { authMiddleware } from "../middlewares/auth.middleware";

const authRouter = Router();

authRouter.post("/login", AuthController.login);
authRouter.get("/me", authMiddleware, AuthController.me);

export default authRouter;
