import { Response, NextFunction } from "express";
import mongoose from "mongoose";
import { PedidoModel, EstadoPedido, ESTADOS_PEDIDO } from "../models/pedido.model";
import { UserModel } from "../models/user.model";
import { sendMail, pedidoEstadoEmail } from "../services/email.service";
import { AuthRequest } from "../types/AuthRequest";

/** Nombre del admin para el historial (si no se encuentra, su correo). */
async function nombreAdmin(req: AuthRequest): Promise<string> {
  const u = req.user?.id && mongoose.isValidObjectId(req.user.id)
    ? await UserModel.findById(req.user.id).select("name").lean()
    : null;
  return u?.name || req.user!.email;
}

export const PedidosEstadoController = {
  /**
   * Admin aprueba, rechaza o deja en espera el pedido, con un comentario:
   *  - aprobado  → comentarioAprobacion (opcional, p.ej. "Transferencia OK").
   *  - rechazado → motivoRechazo (opcional).
   *  - en_espera → motivoEspera (OBLIGATORIO: es el mensaje para el asesor).
   * Cada cambio queda en historialEstado y se avisa al vendedor por correo.
   */
  async updateEstado(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { estado, comentario, motivoRechazo } = req.body || {};
      // Anular tiene su propia ruta (POST /:id/anular), con motivo y aviso.
      if (!ESTADOS_PEDIDO.includes(estado) || estado === "anulado") {
        res.status(400).json({ success: false, message: "Estado inválido" });
        return;
      }
      // `motivoRechazo` se acepta por compatibilidad con la versión anterior de la app.
      const nota = String(comentario ?? motivoRechazo ?? "").trim().slice(0, 500);
      if (estado === "en_espera" && !nota) {
        res.status(400).json({ success: false, message: "Escribe el mensaje para el asesor" });
        return;
      }

      // Un pedido que ya salió de bodega no cambia de estado.
      const id = String(req.params.id);
      const actual = mongoose.isValidObjectId(id) ? await PedidoModel.findById(id).select("despacho estado") : null;
      if (!actual) {
        res.status(404).json({ success: false, message: "Pedido no encontrado" });
        return;
      }
      if (actual.estado === "anulado") {
        res.status(409).json({ success: false, message: "El pedido fue anulado: no se puede cambiar su estado" });
        return;
      }
      if (actual.despacho?.salidaAt) {
        res.status(409).json({ success: false, message: "El pedido ya salió de bodega: no se puede cambiar su estado" });
        return;
      }

      const nuevo = estado as EstadoPedido;
      const set: Record<string, unknown> = { estado: nuevo };
      const unset: Record<string, 1> = {};
      if (nuevo === "aprobado") {
        if (nota) set.comentarioAprobacion = nota;
        else unset.comentarioAprobacion = 1;
      }
      if (nuevo === "rechazado" && nota) set.motivoRechazo = nota;
      if (nuevo === "en_espera") set.motivoEspera = nota;
      const cambio = { estado: nuevo, ...(nota ? { nota } : {}), por: await nombreAdmin(req), at: new Date() };
      const pedido = await PedidoModel.findByIdAndUpdate(
        id,
        { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}), $push: { historialEstado: cambio } },
        { new: true }
      );
      if (!pedido) {
        res.status(404).json({ success: false, message: "Pedido no encontrado" });
        return;
      }
      res.json({ success: true, data: pedido });

      // Aviso al vendedor con el resultado (no bloquea la respuesta).
      if (nuevo === "aprobado" || nuevo === "rechazado" || nuevo === "en_espera") {
        UserModel.findById(pedido.vendedorId)
          .then((u) => {
            if (!u) return;
            const mail = pedidoEstadoEmail({
              numero: pedido.numero,
              clienteNombre: pedido.clienteNombre,
              total: pedido.total,
              estado: nuevo,
              motivoRechazo: pedido.motivoRechazo,
              comentario: nota || undefined,
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
