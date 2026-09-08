import { Router } from "express";
import { InventarioController } from "../controllers/inventario.controller";
import { authMiddleware } from "../middlewares/auth.middleware";
import { adminOnly } from "../middlewares/adminOnly.middleware";
import { AsignacionesInventarioController } from "../controllers/asignacionesInventario.controller";
import { ReglasProductoController } from "../controllers/reglasProducto.controller";

const inventarioRouter = Router();

inventarioRouter.use(authMiddleware);
inventarioRouter.get("/disponible", InventarioController.disponible);

// Inventario asignado por vendedor (el admin decide qué ve cada uno).
inventarioRouter.get("/asignaciones/mia", AsignacionesInventarioController.mia);
inventarioRouter.get("/asignaciones", adminOnly, AsignacionesInventarioController.list);
inventarioRouter.put("/asignaciones/:venCodigo", adminOnly, AsignacionesInventarioController.save);

export default inventarioRouter;

// Reglas por producto (solo contado). Todos las leen; el admin las cambia.
inventarioRouter.get("/reglas", ReglasProductoController.list);
inventarioRouter.put("/reglas/:proCodigo", adminOnly, ReglasProductoController.save);
