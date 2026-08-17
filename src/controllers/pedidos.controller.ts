import { Response, NextFunction } from "express";
import { PedidoModel, PedidoItem } from "../models/pedido.model";
import { AuthRequest } from "../types/AuthRequest";

export const PedidosController = {
  async list(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const filtro =
        req.user?.role === "vendedor" ? { vendedorId: req.user.id } : {};
      const pedidos = await PedidoModel.find(filtro).sort({ createdAt: -1 }).limit(200);
      res.json({ success: true, data: pedidos });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Crea una orden de pedido. El vendedor SIEMPRE puede enviarla; queda
   * "enviado" para que administración la apruebe o rechace. No factura.
   */
  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { clienteNombre, clienteCodigo, items, observacion } = req.body || {};

      if (!clienteNombre) {
        res.status(400).json({ success: false, message: "El cliente es requerido" });
        return;
      }
      if (!Array.isArray(items) || items.length === 0) {
        res.status(400).json({ success: false, message: "Agrega al menos un producto" });
        return;
      }

      const parsed: PedidoItem[] = [];
      for (const it of items) {
        const cantidad = Number(it.cantidad);
        const precioUnitario = Number(it.precioUnitario);
        if (!it.productoCodigo || !it.productoNombre) {
          res.status(400).json({ success: false, message: "Producto inválido en el pedido" });
          return;
        }
        if (!(cantidad > 0)) {
          res.status(400).json({ success: false, message: `Cantidad inválida para ${it.productoNombre}` });
          return;
        }
        if (!(precioUnitario >= 0)) {
          res.status(400).json({ success: false, message: `Precio inválido para ${it.productoNombre}` });
          return;
        }
        parsed.push({
          productoCodigo: String(it.productoCodigo),
          productoNombre: String(it.productoNombre),
          unidad: it.unidad,
          bodega: it.bodega,
          cantidad,
          precioUnitario,
          subtotal: Math.round(cantidad * precioUnitario * 100) / 100,
        });
      }

      const total = Math.round(parsed.reduce((s, i) => s + i.subtotal, 0) * 100) / 100;

      const pedido = await PedidoModel.create({
        vendedorId: req.user!.id,
        vendedorNombre: req.user!.email,
        venCodigo: req.user!.venCodigo,
        clienteNombre,
        clienteCodigo,
        items: parsed,
        total,
        observacion,
      });

      res.status(201).json({ success: true, data: pedido });
    } catch (error) {
      next(error);
    }
  },

  /** Admin aprueba o rechaza el pedido (con motivo opcional). */
  async updateEstado(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { estado, motivoRechazo } = req.body || {};
      if (!["aprobado", "rechazado", "enviado"].includes(estado)) {
        res.status(400).json({ success: false, message: "Estado inválido" });
        return;
      }
      const pedido = await PedidoModel.findByIdAndUpdate(
        req.params.id,
        { estado, ...(motivoRechazo ? { motivoRechazo } : {}) },
        { new: true }
      );
      if (!pedido) {
        res.status(404).json({ success: false, message: "Pedido no encontrado" });
        return;
      }
      res.json({ success: true, data: pedido });
    } catch (error) {
      next(error);
    }
  },
};
