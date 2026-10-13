import { Router } from "express";
import { PedidosController } from "../controllers/pedidos.controller";
import { PedidosEstadoController } from "../controllers/pedidosEstado.controller";
import { DespachosController } from "../controllers/despachos.controller";
import { PedidosNovedadesController } from "../controllers/pedidosNovedades.controller";
import { PedidosCambiosController } from "../controllers/pedidosCambios.controller";
import { PedidosVentasController } from "../controllers/pedidosVentas.controller";
import { authMiddleware } from "../middlewares/auth.middleware";
import { adminOnly } from "../middlewares/adminOnly.middleware";
import { permitirRoles, sinBodega } from "../middlewares/roles.middleware";

const pedidosRouter = Router();

pedidosRouter.use(authMiddleware);

pedidosRouter.post("/firma-subida", PedidosController.firmaSubida);
pedidosRouter.get("/", PedidosController.list);
// Cambios recientes para las alertas con sonido (sin recargar).
pedidosRouter.get("/novedades", PedidosNovedadesController.novedades);
// Cuánto vendió cada asesor de cada producto (admin: todos; vendedor: lo suyo).
pedidosRouter.get("/ventas-asesores", sinBodega, PedidosVentasController.porAsesor);
pedidosRouter.post("/", sinBodega, PedidosController.create);
// Admin aprueba, rechaza o deja en espera (con comentario / mensaje al asesor).
pedidosRouter.patch("/:id/estado", adminOnly, PedidosEstadoController.updateEstado);
// Anular un pedido que aún no sale (admin cualquiera; vendedor los suyos). Libera stock.
pedidosRouter.post("/:id/anular", sinBodega, PedidosCambiosController.anular);
// El cliente no recibió un pedido aprobado (admin, quien despacha en su bodega o su asesor).
pedidosRouter.post("/:id/rechazo-cliente", PedidosCambiosController.rechazoCliente);
// Admin baja cantidades o quita líneas de un pedido que aún no sale.
pedidosRouter.patch("/:id/items", adminOnly, PedidosCambiosController.ajustar);
pedidosRouter.patch("/:id/fotos", sinBodega, PedidosController.updateFotos);
// Bodega marca la salida del pedido aprobado (hora del servidor + fotos).
pedidosRouter.patch("/:id/despacho", permitirRoles("admin", "bodega"), DespachosController.marcarSalida);
// Bodega registra que el pedido no sale hoy: nueva fecha y motivo.
pedidosRouter.post("/:id/retraso", permitirRoles("admin", "bodega"), DespachosController.registrarRetraso);

export default pedidosRouter;
