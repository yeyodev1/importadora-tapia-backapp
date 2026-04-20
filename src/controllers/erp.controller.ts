import { Request, Response, NextFunction } from "express";
import { ErpService } from "../services/erp.service";

export const ErpController = {
  async clientes(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await ErpService.getClientes();
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async vendedores(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await ErpService.getVendedores();
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async inventario(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await ErpService.getInventario();
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async carteraFacturas(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await ErpService.getCarteraFacturas();
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async carteraConsolidada(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await ErpService.getCarteraConsolidada();
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
};
