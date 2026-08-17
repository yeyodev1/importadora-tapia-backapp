import { Response, NextFunction } from "express";
import { ErpService } from "../services/erp.service";
import { AuthRequest } from "../types/AuthRequest";

/** Los vendedores sólo ven su propia cartera; admin ve todo. */
function scope(req: AuthRequest): string | undefined {
  return req.user?.role === "vendedor" ? req.user.venCodigo : undefined;
}

export const ErpController = {
  async clientes(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const data = await ErpService.getClientes(scope(req));
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async vendedores(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const data = await ErpService.getVendedores(scope(req));
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async inventario(_req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const data = await ErpService.getInventario();
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async carteraFacturas(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const data = await ErpService.getCarteraFacturas(scope(req));
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async carteraConsolidada(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const data = await ErpService.getCarteraConsolidada(scope(req));
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
};
