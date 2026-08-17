import { Router } from "express";
import { PedidosController } from "../controllers/pedidos.controller";
import { authMiddleware } from "../middlewares/auth.middleware";
import { adminOnly } from "../middlewares/adminOnly.middleware";

const pedidosRouter = Router();

pedidosRouter.use(authMiddleware);

pedidosRouter.get("/", PedidosController.list);
pedidosRouter.post("/", PedidosController.create);
pedidosRouter.patch("/:id/estado", adminOnly, PedidosController.updateEstado);

export default pedidosRouter;
