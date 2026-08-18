import { Response, NextFunction } from "express";
import { PedidoModel, PedidoItem } from "../models/pedido.model";
import { UserModel } from "../models/user.model";
import { nextSeq, formatDoc } from "../models/counter.model";
import { sendMail, pedidoNuevoEmail, pedidoEstadoEmail } from "../services/email.service";
import { validarDisponibilidad } from "../services/stock.service";
import { AuthRequest } from "../types/AuthRequest";

/** Correos de todos los administradores (para avisos de aprobación). */
async function adminEmails(): Promise<string[]> {
  const admins = await UserModel.find({ role: "admin" }).select("email");
  return admins.map((a) => a.email);
}

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

      // Reserva al enviar: bloquear si supera el disponible (stock ERP - reservas).
      const errorStock = await validarDisponibilidad(parsed);
      if (errorStock) {
        res.status(409).json({ success: false, message: `Sin stock disponible. ${errorStock}` });
        return;
      }

      const total = Math.round(parsed.reduce((s, i) => s + i.subtotal, 0) * 100) / 100;

      const numero = formatDoc("OP", await nextSeq("pedido"));
      const pedido = await PedidoModel.create({
        numero,
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

      // Aviso a administración (no bloquea la respuesta).
      const mail = pedidoNuevoEmail({
        numero,
        clienteNombre,
        vendedor: req.user!.email,
        total,
        nItems: parsed.length,
      });
      adminEmails()
        .then((emails) => Promise.all(emails.map((to) => sendMail({ to, ...mail }))))
        .catch(() => {});
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

      // Aviso al vendedor con el resultado (no bloquea la respuesta).
      if (estado === "aprobado" || estado === "rechazado") {
        UserModel.findById(pedido.vendedorId)
          .then((u) => {
            if (!u) return;
            const mail = pedidoEstadoEmail({
              numero: pedido.numero,
              clienteNombre: pedido.clienteNombre,
              total: pedido.total,
              estado,
              motivoRechazo: pedido.motivoRechazo,
            });
            return sendMail({ to: u.email, ...mail });
          })
          .catch(() => {});
      }
    } catch (error) {
      next(error);
    }
  },
};
