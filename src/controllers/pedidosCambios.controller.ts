import { Response, NextFunction } from "express";
import mongoose from "mongoose";
import { PedidoModel } from "../models/pedido.model";
import { UserModel } from "../models/user.model";
import { sendMail, pedidoAnuladoEmail, pedidoAjustadoEmail } from "../services/email.service";
import { AuthRequest } from "../types/AuthRequest";

/** Nombre de quien hace el cambio para el historial (si no se encuentra, su correo). */
async function nombreUsuario(req: AuthRequest): Promise<string> {
  const u = req.user?.id && mongoose.isValidObjectId(req.user.id)
    ? await UserModel.findById(req.user.id).select("name").lean()
    : null;
  return u?.name || req.user!.email;
}

const redondear = (n: number) => Math.round(n * 100) / 100;

export const PedidosCambiosController = {
  /**
   * Anula un pedido que todavía no sale de bodega (enviado, en espera o
   * aprobado): el cliente ya no lo quiere, se pasó del cupo, etc. Libera el
   * stock reservado. Lo puede hacer administración con cualquier pedido y el
   * vendedor con los suyos. El motivo es obligatorio.
   */
  async anular(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const motivo = String(req.body?.motivo ?? "").trim().slice(0, 500);
      if (motivo.length < 3) {
        res.status(400).json({ success: false, message: "Escribe el motivo de la anulación" });
        return;
      }
      const id = String(req.params.id);
      const pedido = mongoose.isValidObjectId(id) ? await PedidoModel.findById(id) : null;
      if (!pedido) {
        res.status(404).json({ success: false, message: "Pedido no encontrado" });
        return;
      }
      const esAdmin = req.user?.role === "admin";
      if (!esAdmin && pedido.vendedorId !== req.user?.id) {
        res.status(403).json({ success: false, message: "Solo el vendedor del pedido o un administrador puede anularlo" });
        return;
      }
      if (pedido.despacho?.salidaAt) {
        res.status(409).json({ success: false, message: "El pedido ya salió de bodega: no se puede anular" });
        return;
      }
      if (pedido.estado === "anulado" || pedido.estado === "rechazado") {
        res.status(409).json({ success: false, message: "Este pedido ya no está activo" });
        return;
      }

      const por = await nombreUsuario(req);
      const at = new Date();
      pedido.estado = "anulado";
      pedido.anulacion = { motivo, por, rol: req.user!.role, at };
      pedido.historialEstado = [...(pedido.historialEstado || []), { estado: "anulado", nota: motivo, por, at }];
      await pedido.save();
      res.json({ success: true, data: pedido });

      // Aviso a la otra parte (no bloquea la respuesta).
      const mail = pedidoAnuladoEmail({ numero: pedido.numero, clienteNombre: pedido.clienteNombre, total: pedido.total, motivo, por });
      const destinos = esAdmin
        ? UserModel.findById(pedido.vendedorId).select("email").then((u) => (u ? [u.email] : []))
        : UserModel.find({ role: "admin" }).select("email").then((us) => us.map((u) => u.email));
      destinos
        .then((emails) => Promise.all(emails.map((to) => sendMail({ to, ...mail }))))
        .catch(() => {});
    } catch (error) {
      next(error);
    }
  },

  /**
   * Administración baja cantidades o quita líneas de un pedido que aún no sale
   * (p.ej. el cliente pidió 100 y solo le tocan 97). Solo reduce: lo que se
   * quita vuelve al stock disponible, así no hay que revalidar inventario.
   * body: { cantidades: number[] (una por línea, en el mismo orden), nota? }
   */
  async ajustar(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { cantidades, nota: notaBody } = req.body || {};
      const nota = String(notaBody ?? "").trim().slice(0, 500);
      const id = String(req.params.id);
      const pedido = mongoose.isValidObjectId(id) ? await PedidoModel.findById(id) : null;
      if (!pedido) {
        res.status(404).json({ success: false, message: "Pedido no encontrado" });
        return;
      }
      if (pedido.despacho?.salidaAt) {
        res.status(409).json({ success: false, message: "El pedido ya salió de bodega: no se puede ajustar" });
        return;
      }
      if (pedido.estado === "anulado" || pedido.estado === "rechazado") {
        res.status(409).json({ success: false, message: "Este pedido ya no está activo" });
        return;
      }
      if (!Array.isArray(cantidades) || cantidades.length !== pedido.items.length) {
        res.status(400).json({ success: false, message: "Envía la cantidad de cada producto del pedido" });
        return;
      }

      const cambios: { productoNombre: string; antes: number; despues: number }[] = [];
      const items = [];
      for (let i = 0; i < pedido.items.length; i++) {
        const it = pedido.items[i]!;
        const nueva = Number(cantidades[i]);
        if (!Number.isFinite(nueva) || nueva < 0) {
          res.status(400).json({ success: false, message: `Cantidad inválida para ${it.productoNombre}` });
          return;
        }
        if (nueva > it.cantidad) {
          res.status(400).json({
            success: false,
            message: `${it.productoNombre}: solo se puede bajar la cantidad (tenía ${it.cantidad}). Para subirla, el asesor envía otro pedido.`,
          });
          return;
        }
        if (nueva !== it.cantidad) cambios.push({ productoNombre: it.productoNombre, antes: it.cantidad, despues: nueva });
        if (nueva > 0) {
          items.push({
            productoCodigo: it.productoCodigo,
            productoNombre: it.productoNombre,
            unidad: it.unidad,
            bodega: it.bodega,
            cantidad: nueva,
            precioUnitario: it.precioUnitario,
            subtotal: redondear(nueva * it.precioUnitario),
          });
        }
      }
      if (!cambios.length) {
        res.status(400).json({ success: false, message: "No cambiaste ninguna cantidad" });
        return;
      }
      if (!items.length) {
        res.status(400).json({ success: false, message: "El pedido quedaría vacío: mejor anúlalo" });
        return;
      }

      const por = await nombreUsuario(req);
      pedido.items = items;
      pedido.total = redondear(items.reduce((s, i) => s + i.subtotal, 0));
      pedido.ajustes = [...(pedido.ajustes || []), { at: new Date(), por, ...(nota ? { nota } : {}), cambios }];
      await pedido.save();
      res.json({ success: true, data: pedido });

      // Aviso al vendedor (no bloquea la respuesta).
      UserModel.findById(pedido.vendedorId)
        .then((u) => {
          if (!u) return;
          const mail = pedidoAjustadoEmail({
            numero: pedido.numero,
            clienteNombre: pedido.clienteNombre,
            total: pedido.total,
            por,
            nota: nota || undefined,
            cambios,
          });
          return sendMail({ to: u.email, ...mail });
        })
        .catch(() => {});
    } catch (error) {
      next(error);
    }
  },
};
