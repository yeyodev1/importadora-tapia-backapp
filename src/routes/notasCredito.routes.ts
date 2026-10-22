import { Router } from "express";
import { NotasCreditoController } from "../controllers/notasCredito.controller";
import { authMiddleware } from "../middlewares/auth.middleware";
import { adminOnly } from "../middlewares/adminOnly.middleware";
import { sinBodega } from "../middlewares/roles.middleware";

const notasCreditoRouter = Router();

notasCreditoRouter.use(authMiddleware, sinBodega);

notasCreditoRouter.get("/", NotasCreditoController.list);
notasCreditoRouter.post("/", NotasCreditoController.create);
notasCreditoRouter.patch("/:id/estado", adminOnly, NotasCreditoController.updateEstado);

export default notasCreditoRouter;
