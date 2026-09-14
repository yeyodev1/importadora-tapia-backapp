import { Router } from "express";
import { SolicitudesController } from "../controllers/solicitudes.controller";
import { authMiddleware } from "../middlewares/auth.middleware";
import { adminOnly } from "../middlewares/adminOnly.middleware";
import { sinBodega } from "../middlewares/roles.middleware";

const solicitudesRouter = Router();

solicitudesRouter.use(authMiddleware, sinBodega);

solicitudesRouter.post("/firma-subida", SolicitudesController.firmaSubida);
solicitudesRouter.get("/", SolicitudesController.list);
solicitudesRouter.post("/", SolicitudesController.create);
solicitudesRouter.get("/:id", SolicitudesController.get);
solicitudesRouter.put("/:id", SolicitudesController.update);
solicitudesRouter.patch("/:id/estado", adminOnly, SolicitudesController.updateEstado);
solicitudesRouter.patch("/:id/vincular", adminOnly, SolicitudesController.vincular);

export default solicitudesRouter;
