import { Response, NextFunction } from "express";
import mongoose from "mongoose";
import { PedidoModel, claveLinea, entregadoPorLinea } from "../models/pedido.model";
import { UserModel } from "../models/user.model";
import { sendMail, pedidoAnuladoEmail, pedidoAjustadoEmail } from "../services/email.service";
import { AuthRequest } from "../types/AuthRequest";
import { validarDisponibilidad } from "../services/stock.service";
import { validarCupos } from "../services/cupos.service";

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
      if (pedido.entregas?.length) {
        res.status(409).json({
          success: false,
          message: "Ya salió una parte del pedido: en vez de anularlo, ajusta las cantidades a lo entregado",
        });
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
   * Administración cambia cantidades o quita líneas de un pedido que aún no
   * sale (p.ej. el cliente pidió 100 y solo le tocan 97, o ahora quiere más).
   * Lo que se baja vuelve al stock; lo que se sube se valida contra el stock
   * disponible y el cupo del asesor (solo la diferencia).
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

      // Lo que ya salió de bodega no se puede quitar.
      const entregado = entregadoPorLinea(pedido.entregas);
      const cambios: { productoNombre: string; antes: number; despues: number }[] = [];
      const items = [];
      const aumentos: { productoCodigo: string; productoNombre: string; bodega?: string; cantidad: number }[] = [];
      for (let i = 0; i < pedido.items.length; i++) {
        const it = pedido.items[i]!;
        const nueva = Number(cantidades[i]);
        if (!Number.isFinite(nueva) || nueva < 0) {
          res.status(400).json({ success: false, message: `Cantidad inválida para ${it.productoNombre}` });
          return;
        }
        const salio = entregado[claveLinea(it)] || 0;
        if (nueva < salio) {
          res.status(400).json({ success: false, message: `${it.productoNombre}: ya salieron ${salio}, no puede quedar en menos` });
          return;
        }
        if (nueva > it.cantidad) {
          aumentos.push({ productoCodigo: it.productoCodigo, productoNombre: it.productoNombre, bodega: it.bodega, cantidad: nueva - it.cantidad });
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

      // Lo que se sube debe caber en el stock disponible y en el cupo del asesor.
      if (aumentos.length) {
        const errorCupo = await validarCupos(aumentos, pedido.venCodigo);
        if (errorCupo) {
          res.status(409).json({ success: false, message: errorCupo });
          return;
        }
        const errorStock = await validarDisponibilidad(aumentos);
        if (errorStock) {
          res.status(409).json({ success: false, message: `Sin stock para subir la cantidad. ${errorStock}` });
          return;
        }
      }

      const por = await nombreUsuario(req);
      pedido.items = items;
      pedido.total = redondear(items.reduce((s, i) => s + i.subtotal, 0));
      pedido.ajustes = [...(pedido.ajustes || []), { at: new Date(), por, ...(nota ? { nota } : {}), cambios }];
      // Si al bajar ya quedó todo entregado, el pedido queda despachado con la última salida.
      const ultima = pedido.entregas?.[pedido.entregas.length - 1];
      if (ultima && items.every((it) => (entregado[claveLinea(it)] || 0) >= it.cantidad)) {
        pedido.set("despacho", { salidaAt: ultima.at, fotos: ultima.fotos, observacion: ultima.observacion, despachadoPor: ultima.por });
      }
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
