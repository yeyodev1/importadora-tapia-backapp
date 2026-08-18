import { Router } from "express";
import { InventarioController } from "../controllers/inventario.controller";
import { authMiddleware } from "../middlewares/auth.middleware";

const inventarioRouter = Router();

inventarioRouter.use(authMiddleware);
inventarioRouter.get("/disponible", InventarioController.disponible);

export default inventarioRouter;
