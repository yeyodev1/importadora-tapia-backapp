import { Response, NextFunction } from "express";
import { inventarioDisponible } from "../services/stock.service";
import { AuthRequest } from "../types/AuthRequest";

export const InventarioController = {
  /** Inventario del ERP con la reserva propia descontada (disponible real). */
  async disponible(_req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const data = await inventarioDisponible();
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
};
