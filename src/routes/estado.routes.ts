import { Router } from "express";
import { EstadoController } from "../controllers/estado.controller";
import { authMiddleware } from "../middlewares/auth.middleware";

const estadoRouter = Router();

estadoRouter.use(authMiddleware);
estadoRouter.get("/erp", EstadoController.erp);

export default estadoRouter;
