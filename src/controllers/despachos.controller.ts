import { Response, NextFunction } from "express";
import mongoose from "mongoose";
import { PedidoModel } from "../models/pedido.model";
import { AuthRequest } from "../types/AuthRequest";
import { esUrlCloudinaryPropia } from "../services/cloudinary.service";

/** Fecha de hoy en Ecuador como "YYYY-MM-DD". */
function hoyEcuador(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guayaquil" }).format(new Date());
}

export const DespachosController = {
  /**
   * Registra que un pedido aprobado NO pudo salir hoy: nueva fecha de salida
   * (posterior a hoy) y el motivo. Queda en el historial del pedido y avisa
   * al vendedor y a administración por las alertas.
   */
  async registrarRetraso(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const nuevaFecha = String(req.body?.nuevaFecha || "").trim();
      const motivo = String(req.body?.motivo || "").trim().slice(0, 500);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(nuevaFecha) || Number.isNaN(Date.parse(nuevaFecha))) {
        res.status(400).json({ success: false, message: "Indica la fecha en que saldrá el pedido" });
        return;
      }
      if (nuevaFecha <= hoyEcuador()) {
        res.status(400).json({ success: false, message: "La nueva fecha de salida debe ser posterior a hoy" });
        return;
      }
      if (motivo.length < 3) {
        res.status(400).json({ success: false, message: "Explica el motivo del retraso" });
        return;
      }

      const id = String(req.params.id);
      const pedido = mongoose.isValidObjectId(id) ? await PedidoModel.findById(id) : null;
      if (!pedido) {
        res.status(404).json({ success: false, message: "Pedido no encontrado" });
        return;
      }
      if (pedido.estado !== "aprobado") {
        res.status(409).json({ success: false, message: "Solo se registra retraso de pedidos aprobados" });
        return;
      }
      if (pedido.despacho?.salidaAt) {
        res.status(409).json({ success: false, message: "Este pedido ya salió de bodega" });
        return;
      }

      pedido.set("retrasos", [
        ...(pedido.retrasos || []),
        { registradoAt: new Date(), nuevaFecha, motivo, registradoPor: req.user!.email },
      ]);
      await pedido.save();
      res.json({ success: true, data: pedido });
    } catch (error) {
      next(error);
    }
  },

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
