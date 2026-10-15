import { Response, NextFunction } from "express";
import { ReglaProductoModel } from "../models/reglaProducto.model";
import { AuthRequest } from "../types/AuthRequest";

function publica(r: any) {
  return {
    proCodigo: r.proCodigo,
    proNombre: r.proNombre || "",
    soloContado: Boolean(r.soloContado),
    librasPorSaco: Number(r.librasPorSaco) > 0 ? Number(r.librasPorSaco) : null,
    actualizadoPor: r.actualizadoPor,
    updatedAt: r.updatedAt,
  };
}

/** Reglas por producto (solo contado y libras por saco). Listar: todos; guardar: admin. */
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
      const body = req.body || {};
      if (!proCodigo) {
        res.status(400).json({ success: false, message: "proCodigo requerido" });
        return;
      }
      // Solo cambia lo que viene: marcar "solo contado" no borra las libras por saco y viceversa.
      const set: Record<string, unknown> = { proCodigo, actualizadoPor: req.user!.email };
      if (body.proNombre) set.proNombre = String(body.proNombre);
      if (body.soloContado !== undefined) set.soloContado = Boolean(body.soloContado);
      if (body.librasPorSaco !== undefined) {
        const n = body.librasPorSaco === null || body.librasPorSaco === "" ? 0 : Number(body.librasPorSaco);
        if (!Number.isFinite(n) || n < 0 || n > 10000) {
          res.status(400).json({ success: false, message: "Libras por saco inválidas" });
          return;
        }
        set.librasPorSaco = n > 0 ? Math.round(n * 100) / 100 : null;
      }
      const row = await ReglaProductoModel.findOneAndUpdate({ proCodigo }, { $set: set }, { upsert: true, new: true });
      res.json({ success: true, data: publica(row) });
    } catch (error) {
      next(error);
    }
  },
};
