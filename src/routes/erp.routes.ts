import { Router, Response, NextFunction } from "express";
import { ErpController } from "../controllers/erp.controller";
import { CarteraCompartirController } from "../controllers/carteraCompartir.controller";
import { FacturaAdjuntosController } from "../controllers/facturaAdjuntos.controller";
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
// Enviar el saldo de una factura por correo (desde app@importadoratapia.app).
erpRouter.post("/cartera/facturas/:codigo/enviar", CarteraCompartirController.enviarCorreo);
// Foto/PDF de la factura física (el ERP no trae el detalle de productos).
erpRouter.post("/cartera/firma-subida", FacturaAdjuntosController.firmaSubida);
erpRouter.get("/cartera/adjuntos", FacturaAdjuntosController.list);
erpRouter.post("/cartera/facturas/:codigo/adjuntos", FacturaAdjuntosController.crear);
erpRouter.delete("/cartera/adjuntos/:id", FacturaAdjuntosController.eliminar);

export default erpRouter;
