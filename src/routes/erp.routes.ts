import { Router } from "express";
import { ErpController } from "../controllers/erp.controller";
import { authMiddleware } from "../middlewares/auth.middleware";

const erpRouter = Router();

erpRouter.use(authMiddleware);

erpRouter.get("/clientes", ErpController.clientes);
erpRouter.get("/vendedores", ErpController.vendedores);
erpRouter.get("/inventario", ErpController.inventario);
erpRouter.get("/cartera/facturas", ErpController.carteraFacturas);
erpRouter.get("/cartera/consolidada", ErpController.carteraConsolidada);

export default erpRouter;
