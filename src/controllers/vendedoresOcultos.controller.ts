import { Response, NextFunction } from "express";
import { VendedorOcultoModel } from "../models/vendedorOculto.model";
import { UserModel } from "../models/user.model";
import { AuthRequest } from "../types/AuthRequest";

function publico(v: any) {
  return {
    venCodigo: v.venCodigo,
    venNombre: v.venNombre,
    motivo: v.motivo || "",
    ocultadoPor: v.ocultadoPor,
    createdAt: v.createdAt,
  };
}

/** Sólo admin (el router ya lo exige). */
export const VendedoresOcultosController = {
  async list(_req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const rows = await VendedorOcultoModel.find().sort({ venNombre: 1 });
      res.json({ success: true, data: rows.map(publico) });
    } catch (error) {
      next(error);
    }
  },

  async ocultar(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { venCodigo, venNombre, motivo } = req.body || {};
      if (!venCodigo || !venNombre) {
        res.status(400).json({ success: false, message: "venCodigo y venNombre son requeridos" });
        return;
      }
      // Si tiene cuenta activa no se oculta: primero hay que eliminar la cuenta.
      const conCuenta = await UserModel.exists({ venCodigo: String(venCodigo) });
      if (conCuenta) {
        res.status(409).json({
          success: false,
          message: "Ese vendedor tiene una cuenta activa. Elimina la cuenta primero.",
        });
        return;
      }
      const row = await VendedorOcultoModel.findOneAndUpdate(
        { venCodigo: String(venCodigo) },
        { venCodigo: String(venCodigo), venNombre: String(venNombre), motivo, ocultadoPor: req.user!.email },
        { upsert: true, new: true }
      );
      res.status(201).json({ success: true, data: publico(row) });
    } catch (error) {
      next(error);
    }
  },

  async restaurar(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const row = await VendedorOcultoModel.findOneAndDelete({ venCodigo: String(req.params.venCodigo) });
      if (!row) {
        res.status(404).json({ success: false, message: "Ese vendedor no estaba oculto" });
        return;
      }
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  },
};
