import { Response, NextFunction } from "express";
import { inventarioDisponible } from "../services/stock.service";
import { filtrarInventario } from "../services/asignacionInventario.service";
import { marcarSoloContado } from "../services/reglasProducto.service";
import { AuthRequest } from "../types/AuthRequest";

export const InventarioController = {
  /** Inventario del ERP con la reserva propia descontada (disponible real). */
  async disponible(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const todo = await inventarioDisponible();
      const { data, asignacion } = await filtrarInventario(todo, req.user);
      res.json({ success: true, data: await marcarSoloContado(data), meta: { asignacion } });
    } catch (error) {
      next(error);
    }
  },
};
