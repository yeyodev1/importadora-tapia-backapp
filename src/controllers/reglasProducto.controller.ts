import { Response, NextFunction } from "express";
import { ReglaProductoModel } from "../models/reglaProducto.model";
import { AuthRequest } from "../types/AuthRequest";

function publica(r: any) {
  return {
    proCodigo: r.proCodigo,
    proNombre: r.proNombre || "",
    soloContado: Boolean(r.soloContado),
    actualizadoPor: r.actualizadoPor,
    updatedAt: r.updatedAt,
  };
}

/** Reglas por producto (hoy: solo contado). Listar: todos; guardar: admin. */
export const ReglasProductoController = {
  async list(_req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const rows = await ReglaProductoModel.find().lean();
      res.json({ success: true, data: rows.map(publica) });
    } catch (error) {
      next(error);
    }
  },

  async save(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const proCodigo = String(req.params.proCodigo || "").trim();
      const { soloContado, proNombre } = req.body || {};
      if (!proCodigo) {
        res.status(400).json({ success: false, message: "proCodigo requerido" });
        return;
      }
      const row = await ReglaProductoModel.findOneAndUpdate(
        { proCodigo },
        { proCodigo, proNombre: proNombre ? String(proNombre) : undefined, soloContado: Boolean(soloContado), actualizadoPor: req.user!.email },
        { upsert: true, new: true }
      );
      res.json({ success: true, data: publica(row) });
    } catch (error) {
      next(error);
    }
  },
};
