import { Response, NextFunction } from "express";
import mongoose from "mongoose";
import { PedidoModel, claveLinea, entregadoPorLinea } from "../models/pedido.model";
import { AuthRequest } from "../types/AuthRequest";
import { esUrlCloudinaryPropia } from "../services/cloudinary.service";
import { bodegaDeUsuario, pedidoEsDeBodega } from "../services/bodegaUsuario.service";

/** Por qué un pedido no aprobado no se despacha (mensaje para bodega). */
function motivoNoDespacha(estado: string): string {
  if (estado === "en_espera") return "Este pedido está en espera por administración: aún no se despacha.";
  if (estado === "enviado") return "Este pedido aún no está aprobado por administración: no se puede despachar.";
  if (estado === "anulado") return "Este pedido fue anulado: no se despacha.";
  return "Este pedido fue rechazado: no se despacha.";
}

/** Bodega con bodega asignada (p.ej. Quito) solo despacha pedidos de su bodega. */
async function esOtraBodega(req: AuthRequest, items: { bodega?: string }[]): Promise<boolean> {
  return !pedidoEsDeBodega(items, await bodegaDeUsuario(req.user));
}

const MSG_OTRA_BODEGA = "Este pedido es de otra bodega: no lo puedes gestionar.";

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
      if (await esOtraBodega(req, pedido.items)) {
        res.status(403).json({ success: false, message: MSG_OTRA_BODEGA });
        return;
      }
      if (pedido.estado !== "aprobado") {
        res.status(409).json({
          success: false,
          message: pedido.estado === "en_espera" ? motivoNoDespacha("en_espera") : "Solo se registra retraso de pedidos aprobados",
        });
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
   * Entregas por partes: `cantidades` (una por línea, en el orden del pedido)
   * dice cuánto sale ahora; sin ella sale todo lo que falta. Cuando ya salió
   * todo, el pedido queda despachado.
   */
  async marcarSalida(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { fotos, observacion, cantidades } = req.body || {};
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
      if (await esOtraBodega(req, pedido.items)) {
        res.status(403).json({ success: false, message: MSG_OTRA_BODEGA });
        return;
      }
      if (pedido.estado !== "aprobado") {
        res.status(409).json({ success: false, message: motivoNoDespacha(pedido.estado) });
        return;
      }

      const obs = String(observacion || "").trim().slice(0, 500) || undefined;
      const yaSalio = pedido.despacho?.salidaAt;
      if (yaSalio) {
        // Ya salió todo: solo se corrigen fotos y observación de la última salida.
        pedido.set("despacho", { salidaAt: yaSalio, fotos: lista, observacion: obs, despachadoPor: pedido.despacho!.despachadoPor });
        await pedido.save();
        res.json({ success: true, data: pedido });
        return;
      }

      // Cuánto sale ahora de cada línea (por defecto, todo lo que falta).
      const entregado = entregadoPorLinea(pedido.entregas);
      const faltan = pedido.items.map((it) => Math.max(0, it.cantidad - (entregado[claveLinea(it)] || 0)));
      if (cantidades !== undefined && (!Array.isArray(cantidades) || cantidades.length !== pedido.items.length)) {
        res.status(400).json({ success: false, message: "Indica cuánto sale de cada producto" });
        return;
      }
      const salen: number[] = Array.isArray(cantidades) ? cantidades.map(Number) : faltan;
      for (let i = 0; i < pedido.items.length; i++) {
        const n = salen[i]!;
        if (!Number.isFinite(n) || n < 0 || n > faltan[i]!) {
          res.status(400).json({ success: false, message: `${pedido.items[i]!.productoNombre}: puede salir entre 0 y ${faltan[i]} (lo que falta)` });
          return;
        }
      }
      if (!salen.some((n) => n > 0)) {
        res.status(400).json({ success: false, message: "Indica cuánto sale en esta entrega" });
        return;
      }

      const ahora = new Date();
      const por = req.user!.email;
      pedido.entregas = [
        ...(pedido.entregas || []),
        {
          at: ahora,
          por,
          cantidades: pedido.items
            .map((it, i) => ({ productoCodigo: it.productoCodigo, bodega: it.bodega, cantidad: salen[i]! }))
            .filter((c) => c.cantidad > 0),
          fotos: lista,
          observacion: obs,
        },
      ];
      // Si con esta salida ya se entregó todo, el pedido queda despachado.
      if (salen.every((n, i) => n === faltan[i])) {
        pedido.set("despacho", { salidaAt: ahora, fotos: lista, observacion: obs, despachadoPor: por });
      }
      await pedido.save();
      res.json({ success: true, data: pedido });
    } catch (error) {
      next(error);
    }
  },
};
