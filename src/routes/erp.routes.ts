import { Router, Response, NextFunction } from "express";
import { ErpController } from "../controllers/erp.controller";
import { authMiddleware } from "../middlewares/auth.middleware";
import { AuthRequest } from "../types/AuthRequest";

const erpRouter = Router();

erpRouter.use(authMiddleware);

// Un vendedor sin código ERP asignado no debe ver datos de nadie.
erpRouter.use((req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.user?.role === "vendedor" && !req.user.venCodigo) {
    res.status(403).json({
      success: false,
      message: "Tu cuenta no tiene un vendedor del ERP asignado. Contacta al administrador.",
    });
    return;
  }
  next();
});

erpRouter.get("/clientes", ErpController.clientes);
erpRouter.get("/vendedores", ErpController.vendedores);
erpRouter.get("/inventario", ErpController.inventario);
erpRouter.get("/cartera/facturas", ErpController.carteraFacturas);
erpRouter.get("/cartera/consolidada", ErpController.carteraConsolidada);

export default erpRouter;
