import { Response, NextFunction } from "express";
import { CobroModel } from "../models/cobro.model";
import { UserModel } from "../models/user.model";
import { nextSeq, formatDoc } from "../models/counter.model";
import { uploadComprobante } from "../services/cloudinary.service";
import { sendMail, cobroEstadoEmail } from "../services/email.service";
import { AuthRequest } from "../types/AuthRequest";
import { carteraDelUsuario, clienteDelUsuario, numeroImpreso } from "../services/carteraUsuario.service";

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
        firma,
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

      // El cobro siempre es a un cliente que ya existe en la cartera del usuario.
      const cliente = clienteCodigo ? await clienteDelUsuario(req, String(clienteCodigo)) : null;
      if (!cliente) {
        res.status(400).json({ success: false, message: "Elige un cliente existente de tu cartera" });
        return;
      }
      // Si indica factura, debe ser una factura pendiente de ese mismo cliente.
      if (facturaRef) {
        const cartera = await carteraDelUsuario(req);
        const deEseCliente = cartera.some(
          (f) => f.per_nombre === cliente.per_nombre && numeroImpreso(f) === String(facturaRef)
        );
        if (!deEseCliente) {
          res.status(400).json({ success: false, message: "La factura elegida no pertenece a ese cliente" });
          return;
        }
      }

      const comprobanteUrl = await uploadComprobante(comprobante);
      // Firma digital opcional (canvas del cliente al recibir el cobro).
      const firmaUrl = firma ? await uploadComprobante(firma, "tapia-firmas") : undefined;

      const numero = formatDoc("RC", await nextSeq("cobro"));
      const cobro = await CobroModel.create({
        numero,
        vendedorId: req.user!.id,
        vendedorNombre: req.user!.email,
        venCodigo: req.user!.venCodigo,
        clienteNombre: cliente.per_nombre,
        clienteCodigo: String(cliente.per_codigo),
        facturaRef: facturaRef ? String(facturaRef) : undefined,
        monto: Number(monto),
        metodoPago,
        comprobanteUrl,
        firmaUrl,
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

      // Aviso al vendedor con el resultado (no bloquea la respuesta).
      if (estado === "aplicado" || estado === "rechazado") {
        UserModel.findById(cobro.vendedorId)
          .then((u) => {
            if (!u) return;
            const mail = cobroEstadoEmail({
              numero: cobro.numero,
              clienteNombre: cobro.clienteNombre,
              monto: cobro.monto,
              estado,
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
