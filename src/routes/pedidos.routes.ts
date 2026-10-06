import { Router } from "express";
import { PedidosController } from "../controllers/pedidos.controller";
import { PedidosEstadoController } from "../controllers/pedidosEstado.controller";
import { DespachosController } from "../controllers/despachos.controller";
import { PedidosNovedadesController } from "../controllers/pedidosNovedades.controller";
import { authMiddleware } from "../middlewares/auth.middleware";
import { adminOnly } from "../middlewares/adminOnly.middleware";
import { permitirRoles, sinBodega } from "../middlewares/roles.middleware";

const pedidosRouter = Router();

pedidosRouter.use(authMiddleware);

pedidosRouter.post("/firma-subida", PedidosController.firmaSubida);
pedidosRouter.get("/", PedidosController.list);
// Cambios recientes para las alertas con sonido (sin recargar).
pedidosRouter.get("/novedades", PedidosNovedadesController.novedades);
pedidosRouter.post("/", sinBodega, PedidosController.create);
// Admin aprueba, rechaza o deja en espera (con comentario / mensaje al asesor).
pedidosRouter.patch("/:id/estado", adminOnly, PedidosEstadoController.updateEstado);
pedidosRouter.patch("/:id/fotos", sinBodega, PedidosController.updateFotos);
// Bodega marca la salida del pedido aprobado (hora del servidor + fotos).
pedidosRouter.patch("/:id/despacho", permitirRoles("admin", "bodega"), DespachosController.marcarSalida);
// Bodega registra que el pedido no sale hoy: nueva fecha y motivo.
pedidosRouter.post("/:id/retraso", permitirRoles("admin", "bodega"), DespachosController.registrarRetraso);

export default pedidosRouter;
