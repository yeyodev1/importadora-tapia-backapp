import { Router } from "express";
import { VisitasController } from "../controllers/visitas.controller";
import { authMiddleware } from "../middlewares/auth.middleware";
import { sinBodega } from "../middlewares/roles.middleware";

const visitasRouter = Router();

visitasRouter.use(authMiddleware, sinBodega);

visitasRouter.get("/", VisitasController.list);
visitasRouter.post("/", VisitasController.entrada);
visitasRouter.patch("/:id/salida", VisitasController.salida);

export default visitasRouter;
