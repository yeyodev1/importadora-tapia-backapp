import { Response, NextFunction } from "express";
import mongoose from "mongoose";
import { PedidoModel } from "../models/pedido.model";
import { UserModel } from "../models/user.model";
import { ESTADOS_CON_CUPO } from "../services/cupos.service";
import { AuthRequest } from "../types/AuthRequest";

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

/** "YYYY-MM-DD" en hora de Ecuador (UTC-5, sin horario de verano). */
function fechaEcuador(d: unknown, fin: boolean): Date | null {
  const s = String(d || "");
  if (!FECHA_RE.test(s)) return null;
  const t = new Date(`${s}T${fin ? "23:59:59.999" : "00:00:00.000"}-05:00`);
  return Number.isNaN(t.getTime()) ? null : t;
}

/**
 * Cuánto ha vendido cada asesor de cada producto (p.ej. cuántos sacos de
 * lenteja). Cuenta los pedidos vivos —sin aprobación, en espera y aprobados,
 * despachados incluidos—, igual que el cupo; los no aprobados y anulados no.
 * Admin ve a todos; el vendedor solo lo suyo.
 */
export const PedidosVentasController = {
  async porAsesor(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const desde = fechaEcuador(req.query.desde, false);
      const hasta = fechaEcuador(req.query.hasta, true);
      if ((req.query.desde && !desde) || (req.query.hasta && !hasta)) {
        res.status(400).json({ success: false, message: "Fechas inválidas (usa AAAA-MM-DD)" });
        return;
      }

      const match: Record<string, unknown> = { estado: { $in: ESTADOS_CON_CUPO } };
      if (desde || hasta) match.createdAt = { ...(desde ? { $gte: desde } : {}), ...(hasta ? { $lte: hasta } : {}) };
      if (req.user?.role === "vendedor") match.vendedorId = req.user.id;

      const filas: {
        _id: { vendedorId: string; productoCodigo: string };
        venCodigo?: string;
        vendedorNombre: string;
        productoNombre: string;
        unidad?: string;
        cantidad: number;
        aprobada: number;
        total: number;
        pedidos: unknown[];
      }[] = await PedidoModel.aggregate([
        { $match: match },
        { $unwind: "$items" },
        {
          $group: {
            _id: { vendedorId: "$vendedorId", productoCodigo: "$items.productoCodigo" },
            venCodigo: { $last: "$venCodigo" },
            vendedorNombre: { $last: "$vendedorNombre" },
            productoNombre: { $last: "$items.productoNombre" },
            unidad: { $last: "$items.unidad" },
            cantidad: { $sum: "$items.cantidad" },
            aprobada: { $sum: { $cond: [{ $eq: ["$estado", "aprobado"] }, "$items.cantidad", 0] } },
            total: { $sum: "$items.subtotal" },
            pedidos: { $addToSet: "$_id" },
          },
        },
      ]);

      // Nombre del asesor (el pedido guarda su correo).
      const ids = [...new Set(filas.map((f) => f._id.vendedorId))].filter((id) => mongoose.isValidObjectId(id));
      const users = await UserModel.find({ _id: { $in: ids } }).select("name venCodigo").lean();
      const nombres = new Map(users.map((u) => [String(u._id), u]));

      const porAsesor = new Map<string, { vendedorId: string; venCodigo: string | null; nombre: string; total: number; productos: unknown[] }>();
      for (const f of filas) {
        const u = nombres.get(f._id.vendedorId);
        let a = porAsesor.get(f._id.vendedorId);
        if (!a) {
          a = { vendedorId: f._id.vendedorId, venCodigo: u?.venCodigo || f.venCodigo || null, nombre: u?.name || f.vendedorNombre, total: 0, productos: [] };
          porAsesor.set(f._id.vendedorId, a);
        }
        const total = Math.round(f.total * 100) / 100;
        a.total = Math.round((a.total + total) * 100) / 100;
        a.productos.push({
          productoCodigo: f._id.productoCodigo,
          productoNombre: f.productoNombre,
          unidad: f.unidad,
          cantidad: f.cantidad,
          aprobada: f.aprobada,
          pendiente: f.cantidad - f.aprobada,
          total,
          pedidos: f.pedidos.length,
        });
      }
      const data = [...porAsesor.values()].sort((a, b) => b.total - a.total);
      for (const a of data) (a.productos as { cantidad: number }[]).sort((x, y) => y.cantidad - x.cantidad);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
};
