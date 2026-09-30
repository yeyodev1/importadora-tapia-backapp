import { Response, NextFunction } from "express";
import { AsignacionInventarioModel } from "../models/asignacionInventario.model";
import { asignacionDe, publica } from "../services/asignacionInventario.service";
import { AuthRequest } from "../types/AuthRequest";

/** Inventario asignado por vendedor. Listar/guardar: admin. "mia": cualquier usuario. */
export const AsignacionesInventarioController = {
  async list(_req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const rows = await AsignacionInventarioModel.find().lean();
      res.json({ success: true, data: rows.map(publica) });
    } catch (error) {
      next(error);
    }
  },

  /** Lo que ve el usuario autenticado (para explicar en pantalla el filtro). */
  async mia(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const venCodigo = req.user?.role === "vendedor" ? req.user.venCodigo : undefined;
      const a = venCodigo ? await asignacionDe(venCodigo) : { venCodigo: "", restringido: false, productos: [], bodega: null };
      res.json({ success: true, data: a });
    } catch (error) {
      next(error);
    }
  },

  async save(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const venCodigo = String(req.params.venCodigo || "").trim();
      const { restringido, productos, bodega } = req.body || {};
      if (!venCodigo) {
        res.status(400).json({ success: false, message: "venCodigo requerido" });
        return;
      }
      if (!Array.isArray(productos)) {
        res.status(400).json({ success: false, message: "productos debe ser una lista de códigos" });
        return;
      }
      const lista = [...new Set(productos.map((p: unknown) => String(p).trim()).filter(Boolean))];
      if (restringido && lista.length === 0) {
        res.status(400).json({ success: false, message: "Elige al menos un producto o deja que vea todo el inventario" });
        return;
      }
      // Bodega de la que vende (bod_nombre); si no viene, se conserva la actual.
      const cambios: Record<string, unknown> = { venCodigo, restringido: Boolean(restringido), productos: lista, actualizadoPor: req.user!.email };
      if (bodega !== undefined) cambios.bodega = bodega ? String(bodega).trim() : null;
      const row = await AsignacionInventarioModel.findOneAndUpdate(
        { venCodigo },
        cambios,
        { upsert: true, new: true }
      );
      res.json({ success: true, data: publica(row) });
    } catch (error) {
      next(error);
    }
  },
};
