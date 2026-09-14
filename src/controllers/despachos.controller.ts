import { Response, NextFunction } from "express";
import mongoose from "mongoose";
import { PedidoModel } from "../models/pedido.model";
import { AuthRequest } from "../types/AuthRequest";
import { esUrlCloudinaryPropia } from "../services/cloudinary.service";

export const DespachosController = {
  /**
   * Marca la salida de bodega de un pedido APROBADO. La hora la pone el
   * servidor (no editable). Si ya salió, solo actualiza fotos y observación.
   */
  async marcarSalida(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { fotos, observacion } = req.body || {};
      const lista: string[] = Array.isArray(fotos) ? fotos.map(String) : [];
      if (lista.length > 10) {
        res.status(400).json({ success: false, message: "Máximo 10 fotos del despacho" });
        return;
      }
      if (lista.some((u) => !esUrlCloudinaryPropia(u))) {
        res.status(400).json({ success: false, message: "Foto del despacho con enlace no permitido" });
        return;
      }

      const id = String(req.params.id);
      const pedido = mongoose.isValidObjectId(id) ? await PedidoModel.findById(id) : null;
      if (!pedido) {
        res.status(404).json({ success: false, message: "Pedido no encontrado" });
        return;
      }
      if (pedido.estado !== "aprobado") {
        res.status(409).json({
          success: false,
          message:
            pedido.estado === "enviado"
              ? "Este pedido aún no está aprobado por administración: no se puede despachar."
              : "Este pedido fue rechazado: no se despacha.",
        });
        return;
      }

      const yaSalio = pedido.despacho?.salidaAt;
      pedido.set("despacho", {
        salidaAt: yaSalio || new Date(),
        fotos: lista,
        observacion: String(observacion || "").trim().slice(0, 500) || undefined,
        despachadoPor: pedido.despacho?.despachadoPor || req.user!.email,
      });
      await pedido.save();
      res.json({ success: true, data: pedido });
    } catch (error) {
      next(error);
    }
  },
};
