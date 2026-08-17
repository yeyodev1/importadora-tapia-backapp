import { Router } from "express";
import { CobrosController } from "../controllers/cobros.controller";
import { authMiddleware } from "../middlewares/auth.middleware";
import { adminOnly } from "../middlewares/adminOnly.middleware";

const cobrosRouter = Router();

cobrosRouter.use(authMiddleware);

cobrosRouter.get("/", CobrosController.list);
cobrosRouter.post("/", CobrosController.create);
cobrosRouter.patch("/:id/estado", adminOnly, CobrosController.updateEstado);

export default cobrosRouter;
