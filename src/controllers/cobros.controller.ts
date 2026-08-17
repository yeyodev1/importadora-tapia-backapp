import { Response, NextFunction } from "express";
import { CobroModel } from "../models/cobro.model";
import { uploadComprobante } from "../services/cloudinary.service";
import { AuthRequest } from "../types/AuthRequest";

const METODOS = ["efectivo", "transferencia", "cheque", "deposito"];

export const CobrosController = {
  /** Vendedor ve sus cobros; admin ve todos. Orden: más recientes primero. */
  async list(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const filtro =
        req.user?.role === "vendedor" ? { vendedorId: req.user.id } : {};
      const cobros = await CobroModel.find(filtro).sort({ createdAt: -1 }).limit(200);
      res.json({ success: true, data: cobros });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Registra un cobro. NO factura ni toca el ERP: guarda el respaldo (monto,
   * método y foto del comprobante) para que administración lo aplique después.
   */
  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const {
        clienteNombre,
        clienteCodigo,
        facturaRef,
        monto,
        metodoPago,
        comprobante,
        observacion,
      } = req.body || {};

      if (!clienteNombre || !monto || !metodoPago) {
        res.status(400).json({
          success: false,
          message: "Cliente, monto y método de pago son requeridos",
        });
        return;
      }
      if (!METODOS.includes(metodoPago)) {
        res.status(400).json({ success: false, message: "Método de pago inválido" });
        return;
      }
      if (Number(monto) <= 0) {
        res.status(400).json({ success: false, message: "El monto debe ser mayor a cero" });
        return;
      }
      if (!comprobante) {
        res.status(400).json({
          success: false,
          message: "Adjunta la foto del comprobante (cheque, depósito o transferencia)",
        });
        return;
      }

      const comprobanteUrl = await uploadComprobante(comprobante);

      const cobro = await CobroModel.create({
        vendedorId: req.user!.id,
        vendedorNombre: req.user!.email,
        venCodigo: req.user!.venCodigo,
        clienteNombre,
        clienteCodigo,
        facturaRef,
        monto: Number(monto),
        metodoPago,
        comprobanteUrl,
        observacion,
      });

      res.status(201).json({ success: true, data: cobro });
    } catch (error) {
      next(error);
    }
  },

  /** Admin marca un cobro como aplicado o rechazado en el ERP. */
  async updateEstado(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { estado } = req.body || {};
      if (!["aplicado", "rechazado", "registrado"].includes(estado)) {
        res.status(400).json({ success: false, message: "Estado inválido" });
        return;
      }
      const cobro = await CobroModel.findByIdAndUpdate(
        req.params.id,
        { estado },
        { new: true }
      );
      if (!cobro) {
        res.status(404).json({ success: false, message: "Cobro no encontrado" });
        return;
      }
      res.json({ success: true, data: cobro });
    } catch (error) {
      next(error);
    }
  },
};
